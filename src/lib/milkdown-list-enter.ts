// 注意:本文件被渲染进程使用,禁止引入 node 内置模块(ipc-state §5)。
// 伪空列表项 Enter 退出列表(2026-08-30 用户反馈:回车退不出列表、连按裂出
// 多个空 bullet,时好时坏):
// 列表项可见文本后可能藏一串不可见字符(U+00A0 不间断空格,粘贴/排版残留,
// 实例:简历整体与自我介绍.md「精准学…」行尾 ~150 连 nbsp)。光标点击「行尾」
// 实际落在 nbsp 串中间/前面,第一次 Enter 时 splitListItem 把 nbsp 尾巴带进
// 新项——新项看着是空的,但 paragraph.content.size != 0,splitListItem 的空项
// 抬出分支(→liftEmptyBlock)永不命中,之后每次 Enter 都只會再裂一个 bullet。
// 落点在 nbsp 串之后则一切正常,这就是「不稳定」的来源。
// 本插件在「项内唯一子块是 textContent 纯空白(含 U+00A0/零宽)的段落」时,
// 先清掉不可见空白再 liftListItem:伪空项与真空项行为一致(退出列表/升一级)。
// 真空项(content.size == 0)不拦截,交还默认链(splitListItem→liftEmptyBlock)。
// priority 60 > 内置 listItemKeymap(50),与 list-backspace 同一惯例。
import { $useKeymap } from '@milkdown/utils'
import { liftListItem } from '@milkdown/prose/schema-list'
import type { Command } from '@milkdown/prose/state'
import type { MilkdownPlugin } from '@milkdown/ctx'

// JS \s 已含 U+00A0 等空白;另补零宽空格 U+200B 与 BOM U+FEFF
const WHITESPACE_ONLY = /^[\s\u200B\uFEFF]*$/

const exitPseudoEmptyListItem: Command = (state, dispatch, view) => {
  const { selection } = state
  if (!selection.empty) return false
  const { $from } = selection
  if ($from.depth < 2) return false // 必须在 list_item > paragraph 内
  const item = $from.node(-1)
  if (item.type.name !== 'list_item') return false
  if ($from.parent.type.name !== 'paragraph') return false
  if (item.childCount !== 1) return false // 唯一子块才是伪空项
  if ($from.parent.content.size === 0) return false // 真空项走默认链
  if (!WHITESPACE_ONLY.test($from.parent.textContent)) return false
  if (!dispatch || !view) return true
  // 先清掉不可见空白(独立 dispatch,抬出基于清理后的 state),
  // 让抬出的段落是真空段——不清理则空白会留在顶层段落里
  view.dispatch(state.tr.delete($from.start(), $from.end()))
  return liftListItem(item.type)(view.state, view.dispatch)
}

const listEnterKeymap = $useKeymap('listEnter', {
  ExitPseudoEmptyListItem: {
    shortcuts: 'Enter',
    priority: 60,
    command: () => exitPseudoEmptyListItem,
  },
})

export const listEnterPlugins: MilkdownPlugin[] = listEnterKeymap.flat()
