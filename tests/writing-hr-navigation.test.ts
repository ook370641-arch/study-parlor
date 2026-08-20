// @vitest-environment jsdom
// 回归测试:分隔线(hr/轨道)的光标导航。
//
// 背景(2026-08-17 用户反馈):
// 1) 点击分隔线,光标停在分隔线之前;PM 的 posAtCoords 对非 atom 叶子节点
//    会把光标落在 hr 前,而不是用户预期的"进入分隔线下一行"。
// 2) 光标在分隔线上一段按 ↓,PM 默认 arrowHandler 会对 hr 创建 NodeSelection,
//    Chrome 把选中节点渲染成一个高亮框——看起来像"分隔线的文本编辑框",对 hr 毫无意义。
//
// 修复:
// - orbit-hr node view 拦截 mousedown → 光标落到 hr 下一行(无内容则补空段落)。
// - 高优先级 ArrowDown keymap:光标在 hr 上一段的段末 → 跳过分隔线进下方内容行首。
import { describe, it, expect } from 'vitest'
import { Editor, rootCtx, defaultValueCtx, editorViewCtx } from '@milkdown/core'
import { commonmark } from '@milkdown/preset-commonmark'
import { gfm } from '@milkdown/preset-gfm'
import { listener } from '@milkdown/plugin-listener'
import { TextSelection } from 'prosemirror-state'
import { orbitHrPlugins } from '@/lib/milkdown-orbit-hr'
import { hrArrowDownPlugins } from '@/lib/milkdown-hr-arrow-down'

type TestEditor = Awaited<ReturnType<typeof makeEditor>>

async function makeEditor(initial = '') {
  const root = document.createElement('div')
  root.className = 'writing-editor-root'
  document.body.appendChild(root)
  const editor = await Editor.make()
    .use(commonmark)
    .use(gfm)
    .use(listener)
    .use(orbitHrPlugins)
    .use(hrArrowDownPlugins)
    .config(ctx => {
      ctx.set(rootCtx, root)
      ctx.set(defaultValueCtx, initial)
    })
    .create()
  return editor
}

function viewOf(editor: TestEditor) {
  return editor.action(ctx => ctx.get(editorViewCtx))
}

/** 把光标放到指定文本所在段落的段末 */
function cursorAtEndOf(editor: TestEditor, text: string) {
  editor.action(ctx => {
    const view = ctx.get(editorViewCtx)
    const doc = view.state.doc
    let pos = -1
    doc.descendants((node: any, p: number) => {
      if (node.isText && node.text === text) pos = p + node.nodeSize
      return true
    })
    if (pos < 0) throw new Error(`text not found: ${text}`)
    view.dispatch(view.state.tr.setSelection(TextSelection.create(doc, pos)))
  })
}

function pressArrowDown(editor: TestEditor) {
  const view = viewOf(editor)
  view.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }))
}

function clickOrbitHr(editor: TestEditor): boolean {
  const view = viewOf(editor)
  const el = view.dom.querySelector('.writing-orbit-hr') as HTMLElement | null
  if (!el) throw new Error('orbit hr not rendered')
  const ev = new MouseEvent('mousedown', { bubbles: true, cancelable: true })
  el.dispatchEvent(ev)
  return ev.defaultPrevented
}

describe('ArrowDown 跳过分隔线', () => {
  it('光标在 hr 上一段的段末按 ↓ → 光标进入 hr 下方段落行首', async () => {
    const editor = await makeEditor('前文\n\n---\n\n后文\n')
    cursorAtEndOf(editor, '前文')

    pressArrowDown(editor)

    const { $from } = viewOf(editor).state.selection
    expect($from.parent.type.name).toBe('paragraph')
    expect($from.parent.textContent).toBe('后文')
    expect($from.parentOffset).toBe(0)

    editor.destroy()
  })

  it('hr 是文档最后一个节点:段末按 ↓ → 补空段落并把光标放进去', async () => {
    const editor = await makeEditor('前文\n\n---\n')
    cursorAtEndOf(editor, '前文')

    pressArrowDown(editor)

    const view = viewOf(editor)
    const json = view.state.doc.toJSON()
    // hr 之后被补了一个空段落
    const types = json.content.map((n: any) => n.type)
    expect(types).toEqual(['paragraph', 'hr', 'paragraph'])
    const { $from } = view.state.selection
    expect($from.parent.type.name).toBe('paragraph')
    expect($from.parent.textContent).toBe('')

    editor.destroy()
  })

  it('光标不在段末(段落中间)按 ↓ → 不触发跳过,光标仍在前文段落', async () => {
    const editor = await makeEditor('前文\n\n---\n\n后文\n')
    editor.action(ctx => {
      const view = ctx.get(editorViewCtx)
      const doc = view.state.doc
      let pos = -1
      doc.descendants((node: any, p: number) => {
        if (node.isText && node.text === '前文') pos = p // 段首,不是段末
        return true
      })
      view.dispatch(view.state.tr.setSelection(TextSelection.create(doc, pos + 1)))
    })

    pressArrowDown(editor)

    const { $from } = viewOf(editor).state.selection
    expect($from.parent.textContent).toBe('前文')

    editor.destroy()
  })
})

describe('点击分隔线 → 光标进下一行', () => {
  it('点击 hr → 光标落到 hr 下方段落行首,mousedown 被拦截', async () => {
    const editor = await makeEditor('前文\n\n---\n\n后文\n')

    const prevented = clickOrbitHr(editor)

    expect(prevented).toBe(true)
    const { $from } = viewOf(editor).state.selection
    expect($from.parent.type.name).toBe('paragraph')
    expect($from.parent.textContent).toBe('后文')
    expect($from.parentOffset).toBe(0)

    editor.destroy()
  })

  it('hr 是文档最后一个节点:点击 → 补空段落并把光标放进去', async () => {
    const editor = await makeEditor('前文\n\n---\n')

    clickOrbitHr(editor)

    const view = viewOf(editor)
    const types = view.state.doc.toJSON().content.map((n: any) => n.type)
    expect(types).toEqual(['paragraph', 'hr', 'paragraph'])
    const { $from } = view.state.selection
    expect($from.parent.type.name).toBe('paragraph')
    expect($from.parent.textContent).toBe('')

    editor.destroy()
  })
})
