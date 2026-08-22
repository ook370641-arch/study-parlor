// 注意:本文件被渲染进程使用,禁止引入 node 内置模块(ipc-state §5)。
// 空列表项 Backspace 退出列表(2026-08-22 用户反馈:列表吞并后文):
// Milkdown 默认 Backspace 走 liftFirstListItem → joinBackward,空项(空段落是
// list_item 唯一子块)上的退格会把空段落**并进上一项**,项内留下尾随空段落;
// 后续输入落进列表项,序列化成缩进续行(`  后文`),重新解析时被 CommonMark
// 列表延续规则永久吸回列表——「回车+删除退不出、之后所有内容都归列表管」。
// 本插件在空项上优先执行 liftListItem:空项抬出列表变顶层段落(嵌套则升一级)。
// 仅拦截空项;非空项行首/项内中部退格返回 false,交还 Milkdown 默认行为。
// priority 60 > 内置 listItemKeymap/baseKeymap(50),与 hr-backspace 同一惯例。
import { $useKeymap } from '@milkdown/utils'
import { liftListItem } from '@milkdown/prose/schema-list'
import type { Command } from '@milkdown/prose/state'
import type { MilkdownPlugin } from '@milkdown/ctx'

const liftEmptyListItem: Command = (state, dispatch) => {
  const { selection } = state
  if (!selection.empty) return false
  const { $from } = selection
  if ($from.depth < 2) return false // 必须在 list_item > paragraph 内
  const item = $from.node(-1)
  if (item.type.name !== 'list_item') return false
  if ($from.parent.content.size !== 0) return false // 只处理空段落
  if (item.childCount !== 1) return false // 空段落须为项的唯一子块(=空项)
  return liftListItem(item.type)(state, dispatch)
}

const listBackspaceKeymap = $useKeymap('listBackspace', {
  LiftEmptyListItem: {
    shortcuts: 'Backspace',
    priority: 60,
    command: () => liftEmptyListItem,
  },
})

export const listBackspacePlugins: MilkdownPlugin[] = listBackspaceKeymap.flat()
