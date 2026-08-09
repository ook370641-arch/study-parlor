// @vitest-environment jsdom
// 回归测试:
// 1) 外部粘贴清洗(milkdown-paste-plain)—— style/class 剥离、h1-h6 降级;内部粘贴(data-pm-slice)原样保留
// 2) Tab 缩进兜底(milkdown-tab-keymap)—— 段落/代码块/列表/表格四种上下文
// 插件组合与 WritingEditor.tsx 一致,末尾追加两个待测插件。
import { describe, it, expect } from 'vitest'
import { Editor, rootCtx, defaultValueCtx, editorViewCtx } from '@milkdown/core'
import { commonmark } from '@milkdown/preset-commonmark'
import { gfm } from '@milkdown/preset-gfm'
import { listener } from '@milkdown/plugin-listener'
import { history } from '@milkdown/plugin-history'
import { clipboard } from '@milkdown/plugin-clipboard'
import { getMarkdown } from '@milkdown/utils'
import { AllSelection, TextSelection } from 'prosemirror-state'
import { textColorPlugins } from '@/lib/milkdown-text-color'
import { pastePlainPlugins } from '@/lib/milkdown-paste-plain'
import { tabKeymapPlugins } from '@/lib/milkdown-tab-keymap'

// jsdom 没有 ClipboardEvent;prosemirror-view 的 pasteHTML 仅把它当事件对象传递
if (typeof globalThis.ClipboardEvent === 'undefined') {
  ;(globalThis as any).ClipboardEvent = class ClipboardEvent extends Event {}
}

type TestEditor = Awaited<ReturnType<typeof makeEditor>>

async function makeEditor(initial = '') {
  const root = document.createElement('div')
  document.body.appendChild(root)
  const editor = await Editor.make()
    .use(commonmark)
    .use(gfm)
    .use(listener)
    .use(history)
    .use(clipboard)
    .use(textColorPlugins)
    .use(pastePlainPlugins)
    .use(tabKeymapPlugins)
    .config(ctx => {
      ctx.set(rootCtx, root)
      ctx.set(defaultValueCtx, initial)
    })
    .create()
  return editor
}

function fakePasteEvent(data: Record<string, string>) {
  const event = new (globalThis as any).ClipboardEvent('paste')
  ;(event as any).clipboardData = { getData: (t: string) => data[t] ?? '' }
  return event
}

function pasteHTML(editor: TestEditor, html: string) {
  editor.action(ctx => {
    const view = ctx.get(editorViewCtx)
    view.pasteHTML(html, fakePasteEvent({ 'text/html': html, 'text/plain': '' }))
  })
}

function docJSON(editor: TestEditor): any {
  return editor.action(ctx => ctx.get(editorViewCtx).state.doc.toJSON())
}

/** 递归收集 doc JSON 中所有 node.type 与 mark.type */
function collectTypes(node: any, out = { nodes: new Set<string>(), marks: new Set<string>() }) {
  if (node.type) out.nodes.add(node.type)
  for (const m of node.marks ?? []) out.marks.add(m.type)
  for (const c of node.content ?? []) collectTypes(c, out)
  return out
}

function pressTab(editor: TestEditor, shift = false) {
  return editor.action(ctx => {
    const view = ctx.get(editorViewCtx)
    const event = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: shift, bubbles: true, cancelable: true })
    view.dom.dispatchEvent(event)
    return { defaultPrevented: event.defaultPrevented }
  })
}

/** 把光标移到包含 targetText 的文本处(偏移 offset) */
function placeCursor(editor: TestEditor, targetText: string, offset = 0) {
  editor.action(ctx => {
    const view = ctx.get(editorViewCtx)
    const doc = view.state.doc
    let pos = -1
    doc.descendants((node, p) => {
      if (node.isText && node.text?.includes(targetText)) pos = p + offset
      return true
    })
    if (pos < 0) throw new Error(`找不到文本: ${targetText}`)
    view.dispatch(view.state.tr.setSelection(TextSelection.create(doc, pos)))
  })
}

describe('外部粘贴清洗', () => {
  it('剥离 style/class:span 颜色不保留为 textColor mark', async () => {
    const editor = await makeEditor('')
    pasteHTML(editor, '<p><span style="color:red;font-size:20px;font-family:Arial">彩色大字</span></p>')
    const { nodes, marks } = collectTypes(docJSON(editor))
    expect(marks.has('textColor')).toBe(false)
    expect(nodes.has('text')).toBe(true)
    const md = editor.action(getMarkdown())
    expect(md).toContain('彩色大字')
    expect(md).not.toContain('<span')
    editor.destroy()
  })

  it('h1-h6 降级为段落', async () => {
    const editor = await makeEditor('')
    pasteHTML(editor, '<h1 style="color:blue;font-size:32px">样式标题</h1><h3 class="MsoNormal">三级标题</h3>')
    const { nodes } = collectTypes(docJSON(editor))
    expect(nodes.has('heading')).toBe(false)
    const md = editor.action(getMarkdown())
    expect(md).toContain('样式标题')
    expect(md).toContain('三级标题')
    expect(md).not.toMatch(/^#/m)
    editor.destroy()
  })

  it('结构化标签(列表/链接)保留', async () => {
    const editor = await makeEditor('')
    pasteHTML(editor, '<ul><li style="font-size:9px">条目一</li></ul><p><a href="https://example.com" style="color:green">链接</a></p>')
    const { nodes, marks } = collectTypes(docJSON(editor))
    expect(nodes.has('bullet_list')).toBe(true)
    expect(nodes.has('list_item')).toBe(true)
    expect(marks.has('link')).toBe(true)
    expect(marks.has('textColor')).toBe(false)
    editor.destroy()
  })

  it('内部粘贴(带 data-pm-slice)保留颜色和标题', async () => {
    // 从源编辑器真实复制一段带颜色的标题,得到 ProseMirror 内部剪贴板 HTML
    const src = await makeEditor('# <span style="color:#d97757">内部彩色标题</span>\n')
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
    const { nodes, marks } = collectTypes(docJSON(target))
    expect(nodes.has('heading')).toBe(true)
    expect(marks.has('textColor')).toBe(true)
    const md = target.action(getMarkdown())
    expect(md).toContain('内部彩色标题')
    target.destroy()
  })
})

describe('Tab 缩进兜底', () => {
  it('普通段落 Tab 插入两个全角空格', async () => {
    const editor = await makeEditor('段落文字')
    placeCursor(editor, '段落文字')
    const { defaultPrevented } = pressTab(editor)
    expect(defaultPrevented).toBe(true)
    const md = editor.action(getMarkdown())
    expect(md).toContain('　　段落文字')
    editor.destroy()
  })

  it('普通段落 Shift-Tab 删除光标前的两个全角空格', async () => {
    const editor = await makeEditor('段落文字')
    placeCursor(editor, '段落文字')
    pressTab(editor)
    const { defaultPrevented } = pressTab(editor, true)
    expect(defaultPrevented).toBe(true)
    const md = editor.action(getMarkdown())
    expect(md).not.toContain('　　')
    expect(md).toContain('段落文字')
    editor.destroy()
  })

  it('光标前无全角空格时 Shift-Tab 不处理(返回 false)', async () => {
    const editor = await makeEditor('段落文字')
    placeCursor(editor, '段落文字', 2)
    const before = editor.action(getMarkdown())
    const { defaultPrevented } = pressTab(editor, true)
    expect(defaultPrevented).toBe(false)
    expect(editor.action(getMarkdown())).toBe(before)
    editor.destroy()
  })

  it('代码块内 Tab 插入两个半角空格', async () => {
    const editor = await makeEditor('```ts\nconst x = 1\n```\n')
    placeCursor(editor, 'const x = 1')
    const { defaultPrevented } = pressTab(editor)
    expect(defaultPrevented).toBe(true)
    const md = editor.action(getMarkdown())
    expect(md).toContain('  const x = 1')
    editor.destroy()
  })

  it('列表项内 Tab 仍然 sink(嵌套加深),不插空格', async () => {
    const editor = await makeEditor('- 一\n- 二\n')
    placeCursor(editor, '二', 1)
    const { defaultPrevented } = pressTab(editor)
    expect(defaultPrevented).toBe(true)
    const md = editor.action(getMarkdown())
    expect(md).toMatch(/[-*]\s+一\s+[-*]\s+二/) // 二 被 sink 为 一 的子项(序列化器输出 * 或 - 均可)
    expect(md).not.toContain('　　')
    editor.destroy()
  })

  it('表格内 Tab 跳到下一单元格(移动选区,不改文档)', async () => {
    const editor = await makeEditor('| 甲 | 乙 |\n|---|---|\n| 丙 | 丁 |\n')
    placeCursor(editor, '甲', 1)
    const posBefore = editor.action(ctx => ctx.get(editorViewCtx).state.selection.from)
    const mdBefore = editor.action(getMarkdown())
    const { defaultPrevented } = pressTab(editor)
    expect(defaultPrevented).toBe(true)
    const posAfter = editor.action(ctx => ctx.get(editorViewCtx).state.selection.from)
    expect(posAfter).not.toBe(posBefore) // goToNextCell 移动了光标
    expect(editor.action(getMarkdown())).toBe(mdBefore) // 文档内容不变
    editor.destroy()
  })
})
