// @vitest-environment jsdom
/**
 * 代码块 Enter 退出(Typora 惯例)—— src/lib/milkdown-codeblock-enter.ts
 *
 * 插件组合与 WritingEditor.tsx 完全一致,追加 codeblockEnterPlugins。
 * 通过 view.someProp('handleKeyDown') 走真实 keydown 分发链,
 * 同时实证本插件的 handler 先于 baseKeymap 的 newlineInCode 被调用。
 */
import { describe, it, expect } from 'vitest'
import { Editor, rootCtx, defaultValueCtx, editorViewCtx } from '@milkdown/core'
import { commonmark } from '@milkdown/preset-commonmark'
import { gfm } from '@milkdown/preset-gfm'
import { listener } from '@milkdown/plugin-listener'
import { history } from '@milkdown/plugin-history'
import { clipboard } from '@milkdown/plugin-clipboard'
import { textColorPlugins } from '@/lib/milkdown-text-color'
import { codeblockEnterPlugins } from '@/lib/milkdown-codeblock-enter'
import { TextSelection } from '@milkdown/prose/state'
import type { EditorView } from '@milkdown/prose/view'
import type { Node as PMNode } from '@milkdown/prose/model'

/** 与 WritingEditor.tsx 相同的插件组合 + codeblockEnterPlugins */
async function makeEditor(md: string) {
  const root = document.createElement('div')
  document.body.appendChild(root)
  const editor = await Editor.make()
    .use(commonmark)
    .use(gfm)
    .use(listener)
    .use(history)
    .use(clipboard)
    .use(textColorPlugins)
    .use(codeblockEnterPlugins)
    .config(ctx => {
      ctx.set(rootCtx, root)
      ctx.set(defaultValueCtx, md)
    })
    .create()
  const view = editor.ctx.get(editorViewCtx)
  return { editor, view, root }
}

function pressEnter(view: EditorView): boolean {
  const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
  return view.someProp('handleKeyDown', f => f(view, event)) ?? false
}

function setCursor(view: EditorView, pos: number) {
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, pos)))
}

/** 找到文档中第 n 个 code_block,返回其内容起点 pos 与节点 */
function findCodeBlock(view: EditorView, n = 0): { pos: number; node: PMNode } {
  let count = 0
  let found: { pos: number; node: PMNode } | null = null
  view.state.doc.forEach((node, offset) => {
    if (node.type.name === 'code_block') {
      if (count === n && !found) found = { pos: offset + 1, node }
      count++
    }
  })
  if (!found) throw new Error('code_block not found')
  return found
}

describe('代码块 Enter 退出(Typora 惯例)', () => {
  it('代码块内容中间按 Enter → 正常插入 \\n(不退出)', async () => {
    const { editor, view } = await makeEditor('前文\n\n```\nfoo\nbar\n```\n')
    const cb = findCodeBlock(view)
    setCursor(view, cb.pos + 2) // 'foo' 中间
    const handled = pressEnter(view)
    expect(handled).toBe(true)
    expect(view.state.selection.$from.parent.type.name).toBe('code_block')
    expect(view.state.selection.$from.parent.textContent).toBe('fo\no\nbar')
    expect(view.state.doc.childCount).toBe(2) // 前文 + code_block,无新块
    editor.destroy()
  })

  it('代码块尾行有内容时按 Enter → 插入 \\n(不退出)', async () => {
    const { editor, view } = await makeEditor('```\nfoo\n```\n')
    const cb = findCodeBlock(view)
    expect(cb.node.textContent).toBe('foo')
    setCursor(view, cb.pos + cb.node.content.size) // 内容末尾,尾行='foo' 非空
    const handled = pressEnter(view)
    expect(handled).toBe(true)
    expect(view.state.selection.$from.parent.type.name).toBe('code_block')
    expect(view.state.selection.$from.parent.textContent).toBe('foo\n')
    expect(view.state.doc.childCount).toBe(1)
    editor.destroy()
  })

  it('代码块最后一个空行按 Enter → 代码块不变,下方新建空段落并移入光标', async () => {
    const { editor, view } = await makeEditor('前文\n\n```\nfoo\n\n```\n')
    const cb = findCodeBlock(view)
    expect(cb.node.textContent.endsWith('\n')).toBe(true) // fixture 前置条件:末行为空行
    const contentBefore = cb.node.textContent
    setCursor(view, cb.pos + cb.node.content.size) // 内容末尾 = 空行上
    const handled = pressEnter(view)
    expect(handled).toBe(true)
    // 代码块内容不变
    expect(findCodeBlock(view).node.textContent).toBe(contentBefore)
    // 下方出现新空段落
    expect(view.state.doc.childCount).toBe(3) // 前文, code_block, 新段落
    const last = view.state.doc.lastChild!
    expect(last.type.name).toBe('paragraph')
    expect(last.content.size).toBe(0)
    // 光标在新空段落内
    expect(view.state.selection.empty).toBe(true)
    expect(view.state.selection.$from.parent.type.name).toBe('paragraph')
    expect(view.state.selection.$from.parent.childCount).toBe(0)
    editor.destroy()
  })

  it('文末空代码块(《日记标准》真实形态)按 Enter → 保留代码块,退出并新建段落', async () => {
    const { editor, view } = await makeEditor('正文\n\n```\n```\n')
    const cb = findCodeBlock(view)
    expect(cb.node.content.size).toBe(0) // 空代码块
    setCursor(view, cb.pos) // 内容起点即终点
    const handled = pressEnter(view)
    expect(handled).toBe(true)
    // 空代码块保留、不删用户内容
    expect(findCodeBlock(view).node.content.size).toBe(0)
    expect(view.state.doc.childCount).toBe(3) // 正文, code_block, 新段落
    const last = view.state.doc.lastChild!
    expect(last.type.name).toBe('paragraph')
    expect(last.content.size).toBe(0)
    expect(view.state.selection.$from.parent.type.name).toBe('paragraph')
    editor.destroy()
  })

  it('普通段落按 Enter 不受影响(仍 splitBlock)', async () => {
    const { editor, view } = await makeEditor('第一段\n\n第二段\n')
    const endPos = view.state.doc.content.size - 1 // 第二段末尾
    setCursor(view, endPos)
    const handled = pressEnter(view)
    expect(handled).toBe(true)
    expect(view.state.doc.childCount).toBe(3)
    const last = view.state.doc.lastChild!
    expect(last.type.name).toBe('paragraph')
    expect(last.content.size).toBe(0)
    expect(view.state.selection.$from.parent.type.name).toBe('paragraph')
    editor.destroy()
  })
})
