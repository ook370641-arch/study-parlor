// @vitest-environment jsdom
// 空列表项 Backspace 退出列表 —— src/lib/milkdown-list-backspace.ts
//
// 背景(2026-08-22 用户反馈):空列表项上按 Backspace,Milkdown 默认走
// liftFirstListItem → joinBackward,会把空段落**并进上一项**(项内多出尾随空段落),
// 而不是退出列表。用户继续输入的内容落进列表项,序列化成缩进续行(`  后文`),
// 重新解析时被 CommonMark 列表延续规则永久吸回列表——「之后所有内容都归列表管」。
// 本插件在「空段落且是 list_item 唯一子块」(=空项)时优先 liftListItem 抬出列表。
import { describe, it, expect } from 'vitest'
import { Editor, rootCtx, defaultValueCtx, editorViewCtx } from '@milkdown/core'
import { commonmark } from '@milkdown/preset-commonmark'
import { gfm } from '@milkdown/preset-gfm'
import { TextSelection } from 'prosemirror-state'
import { getMarkdown } from '@milkdown/utils'
import { listBackspacePlugins } from '@/lib/milkdown-list-backspace'

// 用 fromCharCode 构造不可见字符,避免源码里出现看不见的空白字面量(测试坑见 list-enter 测试)
const NBSP = String.fromCharCode(0xa0)

type TestEditor = Awaited<ReturnType<typeof makeEditor>>

async function makeEditor(initial = '') {
  const root = document.createElement('div')
  document.body.appendChild(root)
  return Editor.make()
    .use(commonmark).use(gfm)
    .use(listBackspacePlugins)
    .config(ctx => { ctx.set(rootCtx, root); ctx.set(defaultValueCtx, initial) })
    .create()
}

function view(te: TestEditor) { return te.ctx.get(editorViewCtx) }

function pressKey(te: TestEditor, key: string) {
  view(te).dom.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
}

/** 光标放到包含 target 的文本节点末尾;target 为空串时放到文档末尾(空项) */
function placeCursor(te: TestEditor, target: string) {
  const v = view(te)
  let pos = -1
  v.state.doc.descendants((node, p) => {
    if (node.isText && node.text?.includes(target)) pos = p + target.length
    return true
  })
  if (pos < 0) throw new Error(`找不到: ${target}`)
  v.dispatch(v.state.tr.setSelection(TextSelection.create(v.state.doc, pos)))
}

/** 光标放到「文本内容恰好等于 target」的文本节点开头 */
function placeCursorAtTextStart(te: TestEditor, target: string) {
  const v = view(te)
  let pos = -1
  v.state.doc.descendants((node, p) => {
    if (node.isText && node.text === target) pos = p
    return true
  })
  if (pos < 0) throw new Error(`找不到: ${JSON.stringify(target)}`)
  v.dispatch(v.state.tr.setSelection(TextSelection.create(v.state.doc, pos)))
}

/** 制造损坏结构:第一个 list_item 尾部追加一个段落(text 为 null 时是真空段落) */
function appendTrailingParagraph(te: TestEditor, text: string | null) {
  const v = view(te)
  let itemEnd = -1
  v.state.doc.descendants((node, p) => {
    if (node.type.name === 'list_item' && itemEnd < 0) { itemEnd = p + node.nodeSize - 1; return false }
    return true
  })
  const para = v.state.schema.nodes.paragraph.create(null, text === null ? null : v.state.schema.text(text))
  v.dispatch(v.state.tr.insert(itemEnd, para))
  v.dispatch(v.state.tr.setSelection(TextSelection.create(v.state.doc, itemEnd + 1)))
}

function docJSON(te: TestEditor): any {
  return te.action(ctx => ctx.get(editorViewCtx).state.doc.toJSON())
}

function topLevelTypes(te: TestEditor): string[] {
  return docJSON(te).content.map((c: any) => c.type)
}

describe('空列表项 Backspace 退出列表', () => {
  it('末位空项 Backspace → 抬出成顶层段落,列表只留一/二', async () => {
    const te = await makeEditor('- 一\n- 二\n')
    placeCursor(te, '二')
    pressKey(te, 'Enter') // 新增空项
    pressKey(te, 'Backspace')
    const doc = docJSON(te)
    expect(topLevelTypes(te)).toEqual(['bullet_list', 'paragraph'])
    const items = doc.content[0].content
    expect(items.length).toBe(2) // 列表仍是两项,空项没并进去
    // 上一项内容必须只有「二」一个段落(无尾随空段落)
    expect(items[1].content.length).toBe(1)
    // 光标在顶层段落里
    te.action(ctx => {
      const { $from } = ctx.get(editorViewCtx).state.selection
      expect($from.depth).toBe(1)
      expect($from.parent.type.name).toBe('paragraph')
    })
    te.destroy()
  })

  it('中间空项 Backspace → 列表断开,空项变顶层段落', async () => {
    const te = await makeEditor('- 一\n- 二\n- 三\n')
    placeCursor(te, '二')
    pressKey(te, 'Enter') // 二/三之间新增空项(光标在空项,三 在其后)
    pressKey(te, 'Backspace')
    const types = topLevelTypes(te)
    // 期望:bullet_list(一,二) + paragraph(空,光标处) + bullet_list(三)
    expect(types).toEqual(['bullet_list', 'paragraph', 'bullet_list'])
    te.destroy()
  })

  it('序列化回归:Backspace 后 md 重新解析,后文不会被吸进列表', async () => {
    const te = await makeEditor('- 一\n- 二\n')
    placeCursor(te, '二')
    pressKey(te, 'Enter')
    pressKey(te, 'Backspace')
    te.action(ctx => {
      const v = ctx.get(editorViewCtx)
      v.dispatch(v.state.tr.insertText('后文'))
    })
    const md = te.action(getMarkdown())
    expect(md).not.toMatch(/\n {2,}\S/) // 不得产生缩进续行
    const doc = docJSON(te)
    const items = doc.content[0].content
    expect(items.length).toBe(2)
    expect(doc.content[1].content?.[0]?.text).toBe('后文') // 后文是顶层段落
    te.destroy()
  })

  it('非空项行首 Backspace → 保持默认(join 进上一项),不被本插件拦截', async () => {
    const te = await makeEditor('- 一\n- 二\n')
    placeCursor(te, '二')
    te.action(ctx => {
      const v = ctx.get(editorViewCtx)
      const { $from } = v.state.selection
      v.dispatch(v.state.tr.setSelection(TextSelection.create(v.state.doc, $from.start())))
    })
    pressKey(te, 'Backspace')
    const doc = docJSON(te)
    // 默认行为:二 的段落并入上一项(项内两个段落,文本不拼接)
    expect(doc.content[0].content.length).toBe(1)
    const paras = doc.content[0].content[0].content
    expect(paras.map((p: any) => p.content?.[0]?.text)).toEqual(['一', '二'])
    te.destroy()
  })

  it('嵌套空子项 Backspace → 提升一级(变父列表的项),不并入兄弟项', async () => {
    const te = await makeEditor('- 一\n  - 子一\n')
    placeCursor(te, '子一')
    pressKey(te, 'Enter') // 子列表新增空项
    pressKey(te, 'Backspace')
    const doc = docJSON(te)
    // 空子项应被抬到父列表层级,而不是并入「子一」
    const outerItems = doc.content[0].content
    const nested = outerItems[0].content.find((c: any) => c.type === 'bullet_list')
    expect(nested.content.length).toBe(1) // 子一仍在子列表且无尾随空段落
    expect(nested.content[0].content.length).toBe(1)
    expect(outerItems.length).toBe(2) // 抬出的空项成为父列表第二项
    te.destroy()
  })

  // 2026-09-22 用户反馈(building effective agents):删掉列表项可见文字后残留
  // 不可见 nbsp 的「伪空项」上 Backspace,旧插件要求 content.size === 0 不拦截,
  // 默认 joinBackward 把伪空段落并进上一项成为项内尾随段落——光标困在 list_item
  // 里:无 bullet 的行、加号锚在项首行(看着没有加号)、Tab sink 失败无法缩进,
  // 之后输入被序列化成缩进续行永久吸回列表。
  it('伪空(nbsp 残留)项 Backspace → 清空白后抬出列表,不并入上一项', async () => {
    const te = await makeEditor(`- 一\n- ${NBSP.repeat(3)}\n- 二\n`)
    placeCursorAtTextStart(te, NBSP.repeat(3)) // 伪空项行首
    pressKey(te, 'Backspace')
    const doc = docJSON(te)
    // 期望:bullet_list(一) + paragraph(空,光标处) + bullet_list(二)
    expect(topLevelTypes(te)).toEqual(['bullet_list', 'paragraph', 'bullet_list'])
    // 上一项不得留下尾随段落
    expect(doc.content[0].content[0].content.length).toBe(1)
    te.destroy()
  })

  it('伪空项光标在空白串中段 Backspace → 不拦截,默认逐字符删除', async () => {
    const te = await makeEditor(`- 一\n- ${NBSP.repeat(3)}\n`)
    const v = view(te)
    let pos = -1
    v.state.doc.descendants((node, p) => {
      if (node.isText && node.text === NBSP.repeat(3)) pos = p + 2 // 第 2 个 nbsp 后
      return true
    })
    v.dispatch(v.state.tr.setSelection(TextSelection.create(v.state.doc, pos)))
    pressKey(te, 'Backspace')
    // 只删一个字符,不抬出列表
    expect(topLevelTypes(te)).toEqual(['bullet_list'])
    te.destroy()
  })

  it('项内尾随伪空段落 Backspace → 清空白后并入项内上一段末尾,文本不被 nbsp 污染', async () => {
    const te = await makeEditor('- 一\n- 二\n')
    appendTrailingParagraph(te, NBSP.repeat(4)) // 项一内: [p(一), p(nbsp×4)],光标在伪空段行首
    pressKey(te, 'Backspace')
    const doc = docJSON(te)
    const items = doc.content[0].content
    expect(items.length).toBe(2) // 两项还在,没有裂出顶层段落
    expect(items[0].content.length).toBe(1) // 尾随段落被删除
    expect(items[0].content[0].content?.[0]?.text).toBe('一') // 「一」不含 nbsp
    te.action(ctx => {
      const { $from } = ctx.get(editorViewCtx).state.selection
      expect($from.parent.textContent).toBe('一') // 光标并入「一」末尾
    })
    te.destroy()
  })

  it('项内尾随真空段落 Backspace → 保持默认自愈(删空段并入上一段),不被本插件破坏', async () => {
    const te = await makeEditor('- 一\n- 二\n')
    appendTrailingParagraph(te, null) // 项一内: [p(一), p(空)]
    pressKey(te, 'Backspace')
    const doc = docJSON(te)
    const items = doc.content[0].content
    expect(items.length).toBe(2)
    expect(items[0].content.length).toBe(1)
    expect(items[0].content[0].content?.[0]?.text).toBe('一')
    te.destroy()
  })
})
