// 注意:本文件被渲染进程使用,禁止引入 node 内置模块(ipc-state §5)。
// 段中 Enter = 硬换行(单行),段尾/段首/空段/列表/代码块交还默认(设计:2026-08-11-... §F)。
import { $prose } from '@milkdown/utils'
import { keymap } from '@milkdown/prose/keymap'
import type { MilkdownPlugin } from '@milkdown/ctx'

export const smartEnterPlugins: MilkdownPlugin[] = [
  $prose(() =>
    keymap({
      Enter: (state, dispatch) => {
        if (!dispatch || !state.selection.empty) return false
        const { $from } = state.selection
        const parent = $from.parent
        if (parent.type.name !== 'paragraph') return false
        if (parent.textContent.length === 0) return false
        const before = parent.textBetween(0, $from.parentOffset)
        const after = parent.textBetween($from.parentOffset, parent.nodeSize - 2)
        if (before.trim().length === 0 || after.trim().length === 0) return false
        const tr = state.tr.replaceSelectionWith(state.schema.nodes.hardbreak.create())
        dispatch(tr.scrollIntoView())
        return true
      },
    }),
  ),
]
