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
import { AllSelection, TextSelection } from 'prosemirror-state'
import { textColorPlugins } from '@/lib/milkdown-text-color'
import { pastePlainPlugins } from '@/lib/milkdown-paste-plain'
import { milkdownClipboardPlugins } from '@/lib/milkdown-clipboard'

if (typeof globalThis.ClipboardEvent === 'undefined') {
  // jsdom 无原生 ClipboardEvent;stub 需从 init 复制修饰键(Event 构造器只认 bubbles/cancelable/composed)
  ;(globalThis as any).ClipboardEvent = class ClipboardEvent extends Event {
    constructor(type: string, init: any = {}) {
      super(type, init)
      if (init.shiftKey !== undefined) (this as any).shiftKey = init.shiftKey
    }
  }
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

function pasteText(editor: TestEditor, text: string, opts: { shiftKey?: boolean } = {}) {
  editor.action(ctx => {
    const view = ctx.get(editorViewCtx)
    const event = new (globalThis as any).ClipboardEvent('paste', { bubbles: true, cancelable: true, shiftKey: opts.shiftKey ?? false })
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

  it('Shift+粘贴 → 交还默认，**加粗** 按字面插入（无 strong）', async () => {
    const editor = await makeEditor('')
    pasteText(editor, '**加粗**', { shiftKey: true })
    const { marks } = collectTypes(docJSON(editor))
    expect(marks.has('strong')).toBe(false)
    // 文档文本按字面保留(markdown 序列化会把字面星号转义成 \*\*，故断言 doc.textContent)
    const textContent = editor.action(ctx => ctx.get(editorViewCtx).state.doc.textContent)
    expect(textContent).toContain('**加粗**')
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

// 2026-08-26 粘贴劫持修复:内部复制的开口 slice 贴进标题时,PM Fitter 会把标题包进列表
// 上下文(一级标题变成无序列表项,并产生单项列表岛)。修复:内部粘贴去块结构(列表/标题/
// 引用拍平为段落,行内样式保留);光标在标题内时一律纯文本插入。
describe('内部粘贴去块结构', () => {
  /** 源编辑器内拖选全部文本(部分选区 → 开口 slice),返回内部复制 HTML */
  function internalCopyHTML(editor: TestEditor): string {
    return editor.action(ctx => {
      const view = ctx.get(editorViewCtx)
      let from = -1, to = -1
      view.state.doc.descendants((node, pos) => {
        if (node.isText) { if (from < 0) from = pos; to = pos + node.nodeSize }
      })
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, from, to)))
      const { dom } = view.serializeForClipboard(view.state.selection.content())
      return dom.outerHTML
    })
  }

  function cursorToHeadingEnd(editor: TestEditor) {
    editor.action(ctx => {
      const view = ctx.get(editorViewCtx)
      view.dispatch(view.state.tr.setSelection(TextSelection.atEnd(view.state.doc)))
    })
  }

  it('内部复制列表贴进标题:标题不被劫持,内容落为段落', async () => {
    const src = await makeEditor('- 甲\n- 乙')
    const html = internalCopyHTML(src)
    src.destroy()
    expect(html).toContain('data-pm-slice')

    const target = await makeEditor('# 标题行')
    cursorToHeadingEnd(target)
    pasteHTML(target, html)

    const json = docJSON(target)
    // 标题仍是标题,不含列表
    const heading = json.content.find((n: any) => n.type === 'heading')
    expect(heading).toBeTruthy()
    const { nodes } = collectTypes(json)
    expect(nodes.has('bullet_list')).toBe(false)
    target.destroy()
  })

  it('内部复制列表贴进空文档:拍平为段落,行内样式保留', async () => {
    const src = await makeEditor('- **甲** 和 `码`\n- 乙')
    const html = internalCopyHTML(src)
    src.destroy()

    const target = await makeEditor('')
    pasteHTML(target, html)

    const json = docJSON(target)
    const { nodes, marks } = collectTypes(json)
    expect(nodes.has('bullet_list')).toBe(false)
    expect(nodes.has('list_item')).toBe(false)
    expect(nodes.has('paragraph')).toBe(true)
    expect(marks.has('strong')).toBe(true)
    expect(marks.has('inlineCode')).toBe(true)
    target.destroy()
  })

  it('外部 rich html 列表贴进标题:纯文本落入标题,不产生列表', async () => {
    const target = await makeEditor('# 标题行')
    cursorToHeadingEnd(target)
    pasteHTML(target, '<ul><li>甲</li><li>乙</li></ul>')

    const json = docJSON(target)
    const { nodes } = collectTypes(json)
    expect(nodes.has('bullet_list')).toBe(false)
    const heading = json.content.find((n: any) => n.type === 'heading')
    expect(heading).toBeTruthy()
    expect(heading.content?.map((t: any) => t.text).join('')).toContain('甲')
    target.destroy()
  })
})
