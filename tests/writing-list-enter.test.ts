// @vitest-environment jsdom
// 伪空列表项 Enter 退出列表 —— src/lib/milkdown-list-enter.ts
//
// 背景(2026-08-30 用户反馈:回车退不出列表、连按裂出多个空 bullet,时好时坏):
// 列表项可见文本后可能藏一串不可见字符(U+00A0 不间断空格,粘贴/排版残留,
// 实例:简历整体与自我介绍.md「精准学…」行尾 ~150 连 nbsp)。光标点击「行尾」
// 实际落在 nbsp 串中间/前面,第一次 Enter 时 splitListItem 把 nbsp 尾巴带进新项
// ——新项看着是空的,但 paragraph.content.size != 0,splitListItem 的空项抬出
// 分支永不命中,第二次 Enter 只会再裂一个 bullet。落点在 nbsp 串之后则正常,
// 这就是「不稳定」的来源。
// 本插件把「项内唯一子块是纯空白段落」视为空项:清掉不可见空白后 liftListItem。
import { describe, it, expect } from 'vitest'
import { Editor, rootCtx, defaultValueCtx, editorViewCtx } from '@milkdown/core'
import { commonmark } from '@milkdown/preset-commonmark'
import { gfm } from '@milkdown/preset-gfm'
import { TextSelection } from 'prosemirror-state'
import { listEnterPlugins } from '@/lib/milkdown-list-enter'

// 用 fromCharCode 构造不可见字符,避免源码里出现看不见的空白字面量
const NBSP = String.fromCharCode(0xa0)
const ZWSP_BOM = String.fromCharCode(0x200b) + String.fromCharCode(0xfeff)

type TestEditor = Awaited<ReturnType<typeof makeEditor>>

async function makeEditor(initial = '') {
  const root = document.createElement('div')
  document.body.appendChild(root)
  return Editor.make()
    .use(commonmark).use(gfm)
    .use(listEnterPlugins)
    .config(ctx => { ctx.set(rootCtx, root); ctx.set(defaultValueCtx, initial) })
    .create()
}

function view(te: TestEditor) { return te.ctx.get(editorViewCtx) }

function pressKey(te: TestEditor, key: string) {
  view(te).dom.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
}

/** 光标放到包含 target 的文本节点末尾 */
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

function docJSON(te: TestEditor): any {
  return te.action(ctx => ctx.get(editorViewCtx).state.doc.toJSON())
}

function topLevelTypes(te: TestEditor): string[] {
  return docJSON(te).content.map((c: any) => c.type)
}

describe('伪空列表项 Enter 退出列表', () => {
  it('nbsp 尾列表项:行尾(可见文本后)两次 Enter → 退出列表,不裂第二个 bullet', async () => {
    const te = await makeEditor(`- 一\n- 精准学${NBSP.repeat(10)}\n`)
    placeCursor(te, '精准学') // 光标在可见文本后、nbsp 串中间
    pressKey(te, 'Enter') // 分裂:新项继承 nbsp 尾巴,看着空实则非空
    pressKey(te, 'Enter') // 应退出列表,而不是再裂一个 bullet
    const doc = docJSON(te)
    expect(topLevelTypes(te)).toEqual(['bullet_list', 'paragraph'])
    expect(doc.content[0].content.length).toBe(2) // 列表仍是两项
    // 抬出的段落是真空段(不可见空白被清掉)
    expect(doc.content[1].content).toBeUndefined()
    te.action(ctx => {
      const { $from } = ctx.get(editorViewCtx).state.selection
      expect($from.depth).toBe(1)
      expect($from.parent.type.name).toBe('paragraph')
    })
    te.destroy()
  })

  it('零宽空格伪空项 Enter → 同样退出列表', async () => {
    const te = await makeEditor('- 一\n- 二\n')
    placeCursor(te, '二')
    pressKey(te, 'Enter') // 新增真空项
    te.action(ctx => {
      const v = ctx.get(editorViewCtx)
      v.dispatch(v.state.tr.insertText(ZWSP_BOM)) // 模拟残留:零宽空格 + BOM
    })
    pressKey(te, 'Enter')
    expect(topLevelTypes(te)).toEqual(['bullet_list', 'paragraph'])
    const doc = docJSON(te)
    expect(doc.content[0].content.length).toBe(2)
    te.destroy()
  })

  it('有序列表伪空项 Enter → 退出列表', async () => {
    const te = await makeEditor(`1. 一\n2. 精准学${NBSP.repeat(5)}\n`)
    placeCursor(te, '精准学')
    pressKey(te, 'Enter')
    pressKey(te, 'Enter')
    expect(topLevelTypes(te)).toEqual(['ordered_list', 'paragraph'])
    const doc = docJSON(te)
    expect(doc.content[0].content.length).toBe(2)
    te.destroy()
  })

  it('真空项 Enter → 保持默认行为(退出列表),本插件不破坏', async () => {
    const te = await makeEditor('- 一\n- 二\n')
    placeCursor(te, '二')
    pressKey(te, 'Enter') // 新增真空项
    pressKey(te, 'Enter') // 默认链:splitListItem 空检查命中 → liftEmptyBlock
    expect(topLevelTypes(te)).toEqual(['bullet_list', 'paragraph'])
    te.destroy()
  })

  it('非空项中段 Enter → 保持默认分裂,不被本插件拦截', async () => {
    const te = await makeEditor('- 一二三四\n')
    placeCursor(te, '一二') // 光标在项中段
    pressKey(te, 'Enter')
    const doc = docJSON(te)
    expect(topLevelTypes(te)).toEqual(['bullet_list'])
    const items = doc.content[0].content
    expect(items.length).toBe(2)
    expect(items[0].content[0].content?.[0]?.text).toBe('一二')
    expect(items[1].content[0].content?.[0]?.text).toBe('三四')
    te.destroy()
  })

  it('嵌套伪空子项 Enter → 提升一级,不裂兄弟项', async () => {
    const te = await makeEditor(`- 一\n  - 子一${NBSP.repeat(5)}\n`)
    placeCursor(te, '子一')
    pressKey(te, 'Enter') // 子列表新增伪空项(带 nbsp 尾)
    pressKey(te, 'Enter') // 应抬到父列表层级
    const doc = docJSON(te)
    const outerItems = doc.content[0].content
    const nested = outerItems[0].content.find((c: any) => c.type === 'bullet_list')
    expect(nested.content.length).toBe(1) // 子一仍在子列表,伪空项没裂进去
    expect(outerItems.length).toBe(2) // 抬出项成为父列表第二项
    te.destroy()
  })
})
