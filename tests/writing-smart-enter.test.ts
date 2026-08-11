// @vitest-environment jsdom
// 智能 Enter：段中回车 = 单行硬换行 —— src/lib/milkdown-smart-enter.ts
//
// 说明（与 brief 测试代码的唯一偏差）：交还默认（fall-through）的用例不断言
// event.defaultPrevented === false。ProseMirror 的 view 在任何 keydown handler
// （含 baseKeymap 的 splitBlock / 列表 Enter / 表格 exitTable）处理按键后都会调用
// preventDefault，因此 defaultPrevented 在交还默认时恒为 true，无法区分"smart-enter
// 未拦截"。改为用结果文档结构断言"默认行为确实发生"（段尾→2 段、列表→3 项、
// 空段→splitBlock、表格→不插 hardbreak 且光标退出表格）。
import { describe, it, expect } from 'vitest'
import { Editor, rootCtx, defaultValueCtx, editorViewCtx } from '@milkdown/core'
import { commonmark } from '@milkdown/preset-commonmark'
import { gfm } from '@milkdown/preset-gfm'
import { TextSelection } from 'prosemirror-state'
import { smartEnterPlugins } from '@/lib/milkdown-smart-enter'

type TestEditor = Awaited<ReturnType<typeof makeEditor>>

async function makeEditor(initial = '') {
  const root = document.createElement('div')
  document.body.appendChild(root)
  return Editor.make()
    .use(commonmark).use(gfm)
    .use(smartEnterPlugins)
    .config(ctx => { ctx.set(rootCtx, root); ctx.set(defaultValueCtx, initial) })
    .create()
}

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

function pressEnter(editor: TestEditor) {
  return editor.action(ctx => {
    const view = ctx.get(editorViewCtx)
    const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
    view.dom.dispatchEvent(event)
    return { defaultPrevented: event.defaultPrevented }
  })
}

function docJSON(editor: TestEditor): any {
  return editor.action(ctx => ctx.get(editorViewCtx).state.doc.toJSON())
}

function collectNodes(node: any, out = new Set<string>()) {
  if (node.type) out.add(node.type)
  for (const c of node.content ?? []) collectNodes(c, out)
  return out
}

/** 光标是否仍位于表格（任意 table* 祖先）内部 */
function cursorInsideTable(editor: TestEditor): boolean {
  return editor.action(ctx => {
    const $from = ctx.get(editorViewCtx).state.selection.$from
    for (let d = $from.depth; d >= 0; d--) {
      if ($from.node(d).type.name.startsWith('table')) return true
    }
    return false
  })
}

describe('智能 Enter', () => {
  it('段中 AB|CD 按 Enter → 插入 hardbreak，仍是单个段落', async () => {
    const editor = await makeEditor('ABCD')
    placeCursor(editor, 'ABCD', 2)
    const { defaultPrevented } = pressEnter(editor)
    expect(defaultPrevented).toBe(true)
    const nodes = collectNodes(docJSON(editor))
    expect(nodes.has('hardbreak')).toBe(true)
    const paras = docJSON(editor).content.filter((c: any) => c.type === 'paragraph')
    expect(paras.length).toBe(1) // 未拆成两段 → 无空行间距
    editor.destroy()
  })

  it('段尾按 Enter → 交还默认，拆成两个段落', async () => {
    const editor = await makeEditor('ABCD')
    placeCursor(editor, 'ABCD', 4)
    pressEnter(editor)
    const paras = docJSON(editor).content.filter((c: any) => c.type === 'paragraph')
    expect(paras.length).toBe(2)
    editor.destroy()
  })

  it('列表项内 Enter → 交还默认，新增列表项', async () => {
    const editor = await makeEditor('- 一\n- 二\n')
    placeCursor(editor, '二', 1)
    pressEnter(editor)
    const items = docJSON(editor).content[0].content.filter((c: any) => c.type === 'list_item')
    expect(items.length).toBe(3)
    editor.destroy()
  })

  it('列表项段中 Enter → 交还默认，新增列表项（不是 hardbreak）', async () => {
    const editor = await makeEditor('- 一二\n- 三\n')
    placeCursor(editor, '一二', 1) // 光标在 一|二 之间
    pressEnter(editor)
    const nodes = collectNodes(docJSON(editor))
    expect(nodes.has('hardbreak')).toBe(false)
    const items = docJSON(editor).content[0].content.filter((c: any) => c.type === 'list_item')
    expect(items.length).toBe(3)
    editor.destroy()
  })

  it('表格单元格内 Enter → 交还默认（不插 hardbreak，光标退出表格）', async () => {
    const editor = await makeEditor('| 甲 | 乙 |\n|---|---|\n| 丙 | 丁 |\n')
    placeCursor(editor, '甲', 1)
    pressEnter(editor)
    const nodes = collectNodes(docJSON(editor))
    expect(nodes.has('hardbreak')).toBe(false) // smart-enter 未拦截
    const doc = docJSON(editor)
    expect(doc.content[0].type).toBe('table') // 表格原样保留
    expect(doc.content[doc.content.length - 1].type).toBe('paragraph') // 默认 exitTable：表后新建空段落
    expect(cursorInsideTable(editor)).toBe(false)
    editor.destroy()
  })

  it('空段落 Enter → 交还默认（splitBlock 拆成两个空段）', async () => {
    const editor = await makeEditor('')
    pressEnter(editor)
    const paras = docJSON(editor).content.filter((c: any) => c.type === 'paragraph')
    expect(paras.length).toBe(2)
    editor.destroy()
  })
})
