// @vitest-environment jsdom
// 外部粘贴清洗(自定义 handlePaste):markdown 文本路径 / rich html 路径 / 内部粘贴保留。
// 与 WritingEditor.tsx 的插件组合保持一致(用 milkdownClipboardPlugins 替换 @milkdown/plugin-clipboard)。
import { describe, it, expect } from 'vitest'
import { Editor, rootCtx, defaultValueCtx, editorViewCtx } from '@milkdown/core'
import { commonmark } from '@milkdown/preset-commonmark'
import { gfm } from '@milkdown/preset-gfm'
import { listener } from '@milkdown/plugin-listener'
import { history } from '@milkdown/plugin-history'
import { getMarkdown } from '@milkdown/utils'
import { AllSelection } from 'prosemirror-state'
import { textColorPlugins } from '@/lib/milkdown-text-color'
import { pastePlainPlugins } from '@/lib/milkdown-paste-plain'
import { milkdownClipboardPlugins } from '@/lib/milkdown-clipboard'

if (typeof globalThis.ClipboardEvent === 'undefined') {
  ;(globalThis as any).ClipboardEvent = class ClipboardEvent extends Event {}
}

type TestEditor = Awaited<ReturnType<typeof makeEditor>>

async function makeEditor(initial = '') {
  const root = document.createElement('div')
  document.body.appendChild(root)
  return Editor.make()
    .use(commonmark).use(gfm).use(listener).use(history)
    .use(milkdownClipboardPlugins)
    .use(textColorPlugins).use(pastePlainPlugins)
    .config(ctx => { ctx.set(rootCtx, root); ctx.set(defaultValueCtx, initial) })
    .create()
}

function pasteHTML(editor: TestEditor, html: string) {
  editor.action(ctx => {
    const view = ctx.get(editorViewCtx)
    const event = new (globalThis as any).ClipboardEvent('paste')
    event.clipboardData = { getData: (t: string) => (t === 'text/html' ? html : '') }
    view.pasteHTML(html, event)
  })
}

function pasteText(editor: TestEditor, text: string) {
  editor.action(ctx => {
    const view = ctx.get(editorViewCtx)
    const event = new (globalThis as any).ClipboardEvent('paste', { bubbles: true, cancelable: true })
    event.clipboardData = { getData: (t: string) => (t === 'text/plain' ? text : '') }
    view.dom.dispatchEvent(event)
  })
}

function docJSON(editor: TestEditor): any {
  return editor.action(ctx => ctx.get(editorViewCtx).state.doc.toJSON())
}

function collectTypes(node: any, out = { nodes: new Set<string>(), marks: new Set<string>() }) {
  if (node.type) out.nodes.add(node.type)
  for (const m of node.marks ?? []) out.marks.add(m.type)
  for (const c of node.content ?? []) collectTypes(c, out)
  return out
}

describe('自定义 handlePaste', () => {
  it('纯文本 markdown：**加粗** → strong，反引号代码 → 纯文字', async () => {
    const editor = await makeEditor('')
    pasteText(editor, '**加粗** and `代码`')
    const { nodes, marks } = collectTypes(docJSON(editor))
    expect(marks.has('strong')).toBe(true)
    expect(marks.has('inlineCode')).toBe(false)
    expect(editor.action(getMarkdown())).not.toContain('`')
    editor.destroy()
  })

  it('纯文本 span 颜色 → textColor 不保留', async () => {
    const editor = await makeEditor('')
    pasteText(editor, '前<span style="color:#d97757">彩色</span>后')
    const { marks } = collectTypes(docJSON(editor))
    expect(marks.has('textColor')).toBe(false)
    expect(editor.action(getMarkdown())).not.toContain('<span')
    editor.destroy()
  })

  it('纯文本代码块 → 转普通段落', async () => {
    const editor = await makeEditor('')
    pasteText(editor, '```\n数据需关联核心业务指标\n```')
    const { nodes } = collectTypes(docJSON(editor))
    expect(nodes.has('code_block')).toBe(false)
    expect(nodes.has('paragraph')).toBe(true)
    editor.destroy()
  })

  it('rich html：保留 strong/链接，剥 style/class 与代码', async () => {
    const editor = await makeEditor('')
    pasteHTML(editor, '<p><strong style="color:red">重要</strong> <code>代码</code> <a href="https://x.com" style="color:green">链接</a></p>')
    const { nodes, marks } = collectTypes(docJSON(editor))
    expect(marks.has('strong')).toBe(true)
    expect(marks.has('link')).toBe(true)
    expect(marks.has('inlineCode')).toBe(false)
    expect(marks.has('textColor')).toBe(false)
    editor.destroy()
  })

  it('内部粘贴(data-pm-slice)保留颜色与代码', async () => {
    const src = await makeEditor('带 `代码` 和 <span style="color:#d97757">彩色</span> 的内容')
    const internalHTML = src.action(ctx => {
      const view = ctx.get(editorViewCtx)
      view.dispatch(view.state.tr.setSelection(new AllSelection(view.state.doc)))
      const { dom } = view.serializeForClipboard(view.state.selection.content())
      return dom.outerHTML
    })
    src.destroy()
    expect(internalHTML).toContain('data-pm-slice')

    const target = await makeEditor('')
    pasteHTML(target, internalHTML)
    const { marks } = collectTypes(docJSON(target))
    expect(marks.has('textColor')).toBe(true)
    expect(marks.has('inlineCode')).toBe(true)
    target.destroy()
  })
})
