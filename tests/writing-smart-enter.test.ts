// @vitest-environment jsdom
// Typora 式 Enter 行为回归 —— 2026-09-22 移除 milkdown-smart-enter.ts(智能回车)。
//
// 背景:旧「智能回车」(2026-08-11 §F)让段中 Enter 插入 hardbreak 而非新建段落,
// 导致多行 hardbreak 段落里 Enter 永远得不到新块、gutter 加号锚在块首行,
// 光标行「没有加号菜单」(building effective agents 编辑中持续遭遇,用户反馈)。
// 现恢复 Typora/Notion 标准:Enter 一律新建段落(splitBlock 默认链),
// Shift+Enter 才是硬换行(commonmark 自带 hardbreakKeymap)。
// 本文件不加载任何自定义 Enter 插件,锁定默认链行为,防止智能回车回潮。
import { describe, it, expect } from 'vitest'
import { Editor, rootCtx, defaultValueCtx, editorViewCtx } from '@milkdown/core'
import { commonmark } from '@milkdown/preset-commonmark'
import { gfm } from '@milkdown/preset-gfm'
import { TextSelection } from 'prosemirror-state'

type TestEditor = Awaited<ReturnType<typeof makeEditor>>

async function makeEditor(initial = '') {
  const root = document.createElement('div')
  document.body.appendChild(root)
  return Editor.make()
    .use(commonmark).use(gfm)
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

function pressKey(editor: TestEditor, key: string, shiftKey = false) {
  editor.action(ctx => {
    const view = ctx.get(editorViewCtx)
    view.dom.dispatchEvent(new KeyboardEvent('keydown', { key, shiftKey, bubbles: true, cancelable: true }))
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

describe('Typora 式 Enter(无智能回车插件)', () => {
  it('段中 AB|CD 按 Enter → 拆成两个段落(不是 hardbreak)', async () => {
    const editor = await makeEditor('ABCD')
    placeCursor(editor, 'ABCD', 2)
    pressKey(editor, 'Enter')
    const doc = docJSON(editor)
    const paras = doc.content.filter((c: any) => c.type === 'paragraph')
    expect(paras.length).toBe(2)
    expect(paras[0].content?.[0]?.text).toBe('AB')
    expect(paras[1].content?.[0]?.text).toBe('CD')
    expect(collectNodes(doc).has('hardbreak')).toBe(false)
    editor.destroy()
  })

  it('段中 Shift+Enter → 插入 hardbreak,仍是单个段落', async () => {
    const editor = await makeEditor('ABCD')
    placeCursor(editor, 'ABCD', 2)
    pressKey(editor, 'Enter', true)
    const doc = docJSON(editor)
    expect(collectNodes(doc).has('hardbreak')).toBe(true)
    const paras = doc.content.filter((c: any) => c.type === 'paragraph')
    expect(paras.length).toBe(1)
    editor.destroy()
  })

  it('hardbreak 段落中按 Enter → 拆成两个段落(多块互不影响)', async () => {
    // 旧智能回车在此场景(如 building effective agents 的 \ 行段落)只加 hardbreak,
    // 永远得不到新块;现拆段,加号/块操作恢复正常
    const editor = await makeEditor('甲\\\n乙')
    placeCursor(editor, '乙', 1) // 光标在 乙 后(段尾,前面有 hardbreak)
    pressKey(editor, 'Enter')
    const doc = docJSON(editor)
    const paras = doc.content.filter((c: any) => c.type === 'paragraph')
    expect(paras.length).toBe(2)
    editor.destroy()
  })

  it('段尾按 Enter → 拆成两个段落', async () => {
    const editor = await makeEditor('ABCD')
    placeCursor(editor, 'ABCD', 4)
    pressKey(editor, 'Enter')
    const paras = docJSON(editor).content.filter((c: any) => c.type === 'paragraph')
    expect(paras.length).toBe(2)
    editor.destroy()
  })

  it('列表项内 Enter → 新增列表项(默认链不受影响)', async () => {
    const editor = await makeEditor('- 一\n- 二\n')
    placeCursor(editor, '二', 1)
    pressKey(editor, 'Enter')
    const items = docJSON(editor).content[0].content.filter((c: any) => c.type === 'list_item')
    expect(items.length).toBe(3)
    editor.destroy()
  })

  it('空段落 Enter → splitBlock 拆成两个空段', async () => {
    const editor = await makeEditor('')
    pressKey(editor, 'Enter')
    const paras = docJSON(editor).content.filter((c: any) => c.type === 'paragraph')
    expect(paras.length).toBe(2)
    editor.destroy()
  })
})
