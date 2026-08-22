// @vitest-environment jsdom
// 插入分隔线后光标自动进入下一行 —— src/lib/milkdown-orbit-hr.ts (hrCaretAfterInsert)
//
// 背景(2026-08-23 用户需求):打 --- 触发输入规则插入 hr 后,ProseMirror 把
// NodeSelection 留在 hr 上(Chrome 渲染成高亮框),hr 在文末时下方没有可输入的行,
// 继续打字会替换掉 hr。工具栏路径(insertHrBelow)已自行处理落点,本插件兜底
// 输入规则路径:hr 刚插入且光标不在文本块时,复用 cursorBelowHrCommand 落到下一行。
import { describe, it, expect } from 'vitest'
import { Editor, rootCtx, defaultValueCtx, editorViewCtx } from '@milkdown/core'
import { commonmark } from '@milkdown/preset-commonmark'
import { gfm } from '@milkdown/preset-gfm'
import { TextSelection, NodeSelection } from 'prosemirror-state'
import { orbitHrPlugins } from '@/lib/milkdown-orbit-hr'

type TE = Awaited<ReturnType<typeof makeEditor>>

async function makeEditor(initial = '') {
  const root = document.createElement('div')
  root.className = 'writing-editor-root'
  document.body.appendChild(root)
  return Editor.make()
    .use(commonmark).use(gfm)
    .use(orbitHrPlugins)
    .config(ctx => { ctx.set(rootCtx, root); ctx.set(defaultValueCtx, initial) })
    .create()
}

function view(te: TE) { return te.ctx.get(editorViewCtx) }

/** 模拟逐字输入(走 handleTextInput,输入规则才会触发) */
function typeText(te: TE, text: string) {
  const v = view(te)
  for (const ch of text) {
    const { from, to } = v.state.selection
    const handled = v.someProp('handleTextInput', f => f(v, from, to, ch))
    if (!handled) v.dispatch(v.state.tr.insertText(ch))
  }
}

function cursorToDocEnd(te: TE) {
  const v = view(te)
  v.dispatch(v.state.tr.setSelection(TextSelection.create(v.state.doc, v.state.doc.content.size)))
}

function topLevelTypes(te: TE): string[] {
  return te.action(ctx => ctx.get(editorViewCtx).state.doc.toJSON().content.map((c: any) => c.type))
}

describe('插入分隔线后光标落到下一行', () => {
  it('文末打 --- → 自动补空段落,光标在其中(不是 NodeSelection)', async () => {
    const te = await makeEditor('前文')
    cursorToDocEnd(te)
    view(te).dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })) // 换到新行
    typeText(te, '---')
    expect(topLevelTypes(te)).toEqual(['paragraph', 'hr', 'paragraph'])
    const sel = view(te).state.selection
    expect(sel).toBeInstanceOf(TextSelection)
    expect(sel.$from.parent.type.name).toBe('paragraph')
    expect(sel.$from.depth).toBe(1)
    te.destroy()
  })

  it('空段上打 --- → 同样落到 hr 下一行', async () => {
    const te = await makeEditor('前文\n')
    cursorToDocEnd(te)
    typeText(te, '---')
    expect(topLevelTypes(te)).toEqual(['paragraph', 'hr', 'paragraph'])
    expect(view(te).state.selection).toBeInstanceOf(TextSelection)
    te.destroy()
  })

  it('中段打 ---(下方有内容) → 光标在下方内容行首,不额外插段', async () => {
    const te = await makeEditor('上文\n\n下文\n')
    const v = view(te)
    let pos = -1
    v.state.doc.descendants((n, p) => { if (n.isText && n.text === '下文') pos = p; return true })
    v.dispatch(v.state.tr.setSelection(TextSelection.create(v.state.doc, pos)))
    typeText(te, '---')
    expect(topLevelTypes(te)).toEqual(['paragraph', 'hr', 'paragraph']) // 没有多余空段
    expect(view(te).state.selection.$from.parent.textContent).toBe('下文')
    te.destroy()
  })

  it('手动选中的 NodeSelection(hr 数量未变) → 插件不动', async () => {
    const te = await makeEditor('上文\n\n---\n\n下文\n')
    const v = view(te)
    let hrPos = -1
    v.state.doc.descendants((n, p) => { if (n.type.name === 'hr') hrPos = p; return true })
    v.dispatch(v.state.tr.setSelection(NodeSelection.create(v.state.doc, hrPos)))
    // 没有 docChanged → 不应有兜底插入;hr 上/下结构不变
    expect(topLevelTypes(te)).toEqual(['paragraph', 'hr', 'paragraph'])
    te.destroy()
  })

  it('连续打两条 --- → 每条之后都有可输入的行', async () => {
    const te = await makeEditor('甲')
    cursorToDocEnd(te)
    view(te).dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
    typeText(te, '---')
    view(te).dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })) // 在兜底空段里换行
    typeText(te, '---')
    const types = topLevelTypes(te)
    expect(types.filter(t => t === 'hr').length).toBe(2)
    expect(types[types.length - 1]).toBe('paragraph')
    expect(view(te).state.selection).toBeInstanceOf(TextSelection)
    te.destroy()
  })
})
