// 注意:本文件被渲染进程使用,禁止引入 node 内置模块(ipc-state §5)。
// 分隔线光标导航(2026-08-17 用户反馈):
// 1) cursorBelowHrCommand — 把光标落到 hr 下一行:下方已有内容放其行首,
//    否则补一个空段落(与 WritingToolbar.insertHrBelow 的落点逻辑一致)。
// 2) ArrowDown keymap — 光标在 hr 上一段的段末按 ↓ 时跳过分隔线。
//    不修的话 PM 默认 arrowHandler 会对 hr 创建 NodeSelection,Chrome 渲染成
//    一个高亮框,看起来像"分隔线的文本编辑框",对 hr 毫无意义。
// priority 60 > 基础 keymap(50);条件不满足 return false 交还默认行为。
import { $useKeymap } from '@milkdown/utils'
import { Selection, TextSelection } from '@milkdown/prose/state'
import type { Command } from '@milkdown/prose/state'
import type { MilkdownPlugin } from '@milkdown/ctx'

export function cursorBelowHrCommand(hrPos: number): Command {
  return (state, dispatch) => {
    if (!dispatch) return true
    dispatch(trCursorBelowHr(state, hrPos))
    return true
  }
}

/** 产出「光标落到 hr 下一行」的 tr:下方已有内容放其行首,否则补一个空段落 */
export function trCursorBelowHr(state: Parameters<Command>[0], hrPos: number) {
  let tr = state.tr
  const after = hrPos + 1 // hr 是叶子节点,nodeSize === 1 → after = hr 之后的位置
  const next = tr.doc.nodeAt(after) // hr 下方原本的节点
  let targetPos: number
  if (next) {
    targetPos = after + 1 // 下一块内容行首
  } else {
    tr = tr.replaceWith(after, after, state.schema.nodes.paragraph.create())
    targetPos = after + 1
  }
  try {
    tr.setSelection(TextSelection.create(tr.doc, targetPos))
  } catch {
    tr.setSelection(Selection.near(tr.doc.resolve(targetPos)))
  }
  return tr.scrollIntoView()
}

const skipHrOnArrowDown: Command = (state, dispatch) => {
  const { selection } = state
  if (!selection.empty) return false
  const { $from } = selection
  if ($from.depth !== 1) return false // 只处理顶层块,列表/引用内交还默认
  if ($from.parent.type.name !== 'paragraph') return false
  if ($from.parentOffset !== $from.parent.content.size) return false // 必须段末
  const after = $from.after()
  const next = state.doc.nodeAt(after)
  if (!next || next.type.name !== 'hr') return false
  return cursorBelowHrCommand(after)(state, dispatch)
}

const hrArrowDownKeymap = $useKeymap('hrArrowDown', {
  SkipHrOnArrowDown: {
    shortcuts: 'ArrowDown',
    priority: 60,
    command: () => skipHrOnArrowDown,
  },
})

export const hrArrowDownPlugins: MilkdownPlugin[] = hrArrowDownKeymap.flat()
