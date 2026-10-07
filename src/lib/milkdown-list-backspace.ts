// 注意:本文件被渲染进程使用,禁止引入 node 内置模块(ipc-state §5)。
// 空/伪空列表项 Backspace 退出列表(2026-08-22 用户反馈:列表吞并后文;
// 2026-09-22 补充伪空边界:building effective agents 编辑中「删列表后无法缩进/
// 无新行/无加号」):
// Milkdown 默认 Backspace 走 liftFirstListItem → joinBackward,空项(空段落是
// list_item 唯一子块)上的退格会把空段落**并进上一项**,项内留下尾随空段落;
// 后续输入落进列表项,序列化成缩进续行(`  后文`),重新解析时被 CommonMark
// 列表延续规则永久吸回列表——「回车+删除退不出、之后所有内容都归列表管」。
// 伪空项(可见文字删净但残留 U+00A0/零宽,粘贴/排版残留)同样中招:光标困在
// 项内尾随段落里——行无 bullet、gutter 加号锚在项首行(看着没有加号)、
// Tab sink 失败无法缩进。
// 本插件:
//   1. 单子块空项 → liftListItem 抬出列表(原有行为);
//   2. 单子块伪空项(行首) → 清不可见空白后 liftListItem;
//   3. 多子块项内伪空段落(行首,即已形成的尾随段落) → 清不可见空白后
//      joinBackward:空段落被删、光标并入项内上一段末尾,上一段文本不被 nbsp 污染。
// 多子块真空段落不拦截——默认 joinBackward 本就能自愈(删空段并入上一段)。
// 空白串中段退格不拦截——默认逐字符删除。
// priority 60 > 内置 listItemKeymap/baseKeymap(50),与 hr-backspace 同一惯例。
import { $useKeymap } from '@milkdown/utils'
import { liftListItem } from '@milkdown/prose/schema-list'
import { joinBackward } from '@milkdown/prose/commands'
import type { Command } from '@milkdown/prose/state'
import type { MilkdownPlugin } from '@milkdown/ctx'

// 与 milkdown-list-enter.ts 同一约定:JS \s 已含 U+00A0;另补零宽空格 U+200B 与 BOM U+FEFF
// (不可见字符一律用转义,不写字面量——字面量在工具链中会被非确定性规范化)
const WHITESPACE_ONLY = /^[\s\u200B\uFEFF]*$/

const liftEmptyListItem: Command = (state, dispatch, view) => {
  const { selection } = state
  if (!selection.empty) return false
  const { $from } = selection
  if ($from.depth < 2) return false // 必须在 list_item > paragraph 内
  const item = $from.node(-1)
  if (item.type.name !== 'list_item') return false
  if ($from.parent.type.name !== 'paragraph') return false

  // 真空项:只处理「空段落是项的唯一子块」,交抬出(原有行为)
  if ($from.parent.content.size === 0) {
    if (item.childCount !== 1) return false // 项内尾随真空段落:默认链自愈
    return liftListItem(item.type)(state, dispatch)
  }

  // 以下为伪空(空白残留)分支,只拦截段落行首;空白串中段退格交默认逐字符删除
  if ($from.parentOffset !== 0) return false
  if (!WHITESPACE_ONLY.test($from.parent.textContent)) return false
  if (!dispatch || !view) return true

  // 先清掉不可见空白(独立 dispatch,后续命令基于清理后的 state)
  view.dispatch(state.tr.delete($from.start(), $from.end()))
  if (item.childCount === 1) {
    // 单子块伪空项 → 抬出列表(与 list-enter 插件同构)
    return liftListItem(item.type)(view.state, view.dispatch)
  }
  // 多子块项内伪空段落(损坏态尾随段落) → 真空段落 joinBackward:
  // 删除空段、光标并入项内上一段末尾
  return joinBackward(view.state, view.dispatch)
}

const listBackspaceKeymap = $useKeymap('listBackspace', {
  LiftEmptyListItem: {
    shortcuts: 'Backspace',
    priority: 60,
    command: () => liftEmptyListItem,
  },
})

export const listBackspacePlugins: MilkdownPlugin[] = listBackspaceKeymap.flat()
