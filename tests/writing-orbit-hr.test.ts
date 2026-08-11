// @vitest-environment jsdom
// 回归测试:hr(轨道分隔线)相关交互不得产生重复 hr。
//
// 背景:真实 E2E 复现「正文 → 工具栏分割线 → Enter → gutter 有序列表」时,
// 文档模型里出现**第二个 hr**(`.writing-orbit-hr` 变 2 个,甚至 pageerror
// RangeError)。系统化排查定位根因:**工具栏按钮点击后保留焦点**,随后的 Enter
// 会按浏览器按钮语义重新触发按钮点击 → `insertHrBelow` 再次执行 → 插入重复 hr
// (见 .superpowers/sdd/2026-08-11-writing-paste-and-formatting/task-hr-bug-report.md)。
// 修复:工具栏按钮 `onMouseDown` preventDefault,避免按钮夺取键盘焦点。
//
// 本文件两层回归:
// 1) Milkdown 层:hr 下方空段落跑 wrapInOrderedList 不抛错、hr 不重复、段落正确入列
//    (jsdom 无法复现焦点/Enter 问题,但守住命令逻辑正确性)。
// 2) 组件层:工具栏按钮 mousedown 必须 preventDefault(不夺焦),否则 Enter 会重触发。
import { describe, it, expect, beforeEach } from 'vitest'
import React from 'react'
import { render, cleanup } from '@testing-library/react'
import { Editor, rootCtx, defaultValueCtx, editorViewCtx } from '@milkdown/core'
import { commonmark, insertHrCommand, wrapInOrderedListCommand } from '@milkdown/preset-commonmark'
import { gfm } from '@milkdown/preset-gfm'
import { listener } from '@milkdown/plugin-listener'
import { history } from '@milkdown/plugin-history'
import { clipboard } from '@milkdown/plugin-clipboard'
import { Selection, TextSelection } from 'prosemirror-state'
import { gutterInsertPlugins } from '@/lib/milkdown-gutter-insert'
import { orbitHrPlugins } from '@/lib/milkdown-orbit-hr'
import { runCollapsedBlockCommand } from '@/lib/milkdown-collapse-selection'
import { WritingToolbar } from '@/components/writing/WritingToolbar'

type TestEditor = Awaited<ReturnType<typeof makeEditor>>

async function makeEditor(initial = '') {
  const root = document.createElement('div')
  root.className = 'writing-editor-root'
  document.body.appendChild(root)
  const editor = await Editor.make()
    .use(commonmark)
    .use(gfm)
    .use(listener)
    .use(history)
    .use(clipboard)
    .use(gutterInsertPlugins)
    .use(orbitHrPlugins)
    .config(ctx => {
      ctx.set(rootCtx, root)
      ctx.set(defaultValueCtx, initial)
    })
    .create()
  return editor
}

function docJSON(editor: TestEditor): any {
  return editor.action(ctx => ctx.get(editorViewCtx).state.doc.toJSON())
}

function rootDOM(editor: TestEditor): HTMLElement {
  return editor.action(ctx => ctx.get(editorViewCtx).dom.closest('.writing-editor-root') as HTMLElement)
}

function orbitHrCount(editor: TestEditor): number {
  return rootDOM(editor).querySelectorAll('.writing-orbit-hr').length
}

/** 等价于 WritingToolbar.insertHrBelow 的后半段:定位 selFrom 之后第一个 hr,
 *  若 hr 下方无内容则补空段落,并把光标落到 hr 下方空段落。 */
function positionCursorBelowHr(editor: TestEditor) {
  editor.action(ctx => {
    const view = ctx.get(editorViewCtx)
    const doc = view.state.doc
    const selFrom = view.state.selection.from
    let hrPos = -1
    doc.descendants((node: any, pos: number) => {
      if (node.type.name === 'hr' && pos >= selFrom && hrPos === -1) hrPos = pos
      return true
    })
    if (hrPos < 0) return
    const after = hrPos + 1
    const next = doc.nodeAt(after)
    let tr = view.state.tr
    let targetPos: number
    if (next) {
      targetPos = after + 1
    } else {
      tr = tr.replaceWith(after, after, view.state.schema.nodes.paragraph.create())
      targetPos = after + 1
    }
    try {
      tr.setSelection(TextSelection.create(tr.doc, targetPos))
    } catch {
      tr.setSelection(Selection.near(tr.doc.resolve(targetPos)))
    }
    view.dispatch(tr.scrollIntoView())
  })
}

function runOrderedList(editor: TestEditor): boolean {
  return editor.action(ctx => runCollapsedBlockCommand(wrapInOrderedListCommand.key)(ctx))
}

describe('hr 之后 gutter 有序列表(Milkdown 层)', () => {
  it('光标在 hr 下方空段落 → wrapInOrderedList 不抛错、hr 不重复、空段落被包成有序列表', async () => {
    const editor = await makeEditor('前文\n\n---\n')
    positionCursorBelowHr(editor)
    expect(orbitHrCount(editor)).toBe(1)

    expect(() => runOrderedList(editor)).not.toThrow()

    expect(orbitHrCount(editor)).toBe(1)

    const json = docJSON(editor)
    // hr 仍是顶层 hr,且只有一个
    const hrNodes = json.content.filter((n: any) => n.type === 'hr')
    expect(hrNodes).toHaveLength(1)
    // 空段落被包进 ordered_list/list_item
    const orderedListNodes = json.content.filter((n: any) => n.type === 'ordered_list')
    expect(orderedListNodes).toHaveLength(1)
    expect(orderedListNodes[0].content[0].type).toBe('list_item')
    expect(orderedListNodes[0].content[0].content[0].type).toBe('paragraph')
    expect(orderedListNodes[0].content[0].content[0].content?.[0]?.text ?? '').toBe('')
    // 前文不被影响
    expect(json.content.some((n: any) => n.type === 'paragraph' && n.content?.[0]?.text === '前文')).toBe(true)

    editor.destroy()
  })

  it('复现工具栏真实路径:insertHr 命令(光标在段尾)后 cursorBelowHr,再跑有序列表(等价于 E2E 按钮序列)', async () => {
    const editor = await makeEditor('前文\n')
    editor.action(ctx => {
      const view = ctx.get(editorViewCtx)
      const doc = view.state.doc
      let pos = -1
      doc.descendants((node: any, p: number) => {
        if (node.isText && node.text === '前文') pos = p + node.nodeSize
        return true
      })
      view.dispatch(view.state.tr.setSelection(TextSelection.create(doc, pos)))
    })

    // insertHrBelow 前半段:折叠选区后执行 insertHrCommand
    expect(() => editor.action(ctx => runCollapsedBlockCommand(insertHrCommand.key)(ctx))).not.toThrow()
    // insertHrBelow 后半段:定位 hr 下方并落光标
    positionCursorBelowHr(editor)
    expect(orbitHrCount(editor)).toBe(1)

    expect(() => runOrderedList(editor)).not.toThrow()
    expect(orbitHrCount(editor)).toBe(1)

    const json = docJSON(editor)
    expect(json.content.filter((n: any) => n.type === 'hr')).toHaveLength(1)
    expect(json.content.filter((n: any) => n.type === 'ordered_list')).toHaveLength(1)

    editor.destroy()
  })
})

describe('工具栏按钮不夺焦(WritingToolbar 层)', () => {
  beforeEach(() => cleanup())

  // 修复前:点击按钮后按钮持有焦点,再按 Enter/Space 会按浏览器按钮语义重新触发
  // 该按钮(分割线按钮被再次点击 → insertHrBelow 再次执行 → 文档出现重复 hr)。
  // 修复:mousedown preventDefault,按钮永不夺焦。
  it('分割线按钮 mousedown 必须 preventDefault(不夺焦)', () => {
    const { getByTestId } = render(React.createElement(WritingToolbar))
    const btn = getByTestId('writing-toolbar-hr')
    const ev = new MouseEvent('mousedown', { bubbles: true, cancelable: true })
    btn.dispatchEvent(ev)
    expect(ev.defaultPrevented).toBe(true)
  })

  it('引用按钮与标题按钮同样 preventDefault(同一焦点缺陷类)', () => {
    const { getByTestId } = render(React.createElement(WritingToolbar))
    for (const testid of ['writing-toolbar-blockquote', 'writing-toolbar-heading']) {
      const btn = getByTestId(testid)
      const ev = new MouseEvent('mousedown', { bubbles: true, cancelable: true })
      btn.dispatchEvent(ev)
      expect(ev.defaultPrevented).toBe(true)
    }
  })
})
