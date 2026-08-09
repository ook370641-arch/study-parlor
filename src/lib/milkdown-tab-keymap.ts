// 注意:本文件被渲染进程使用,禁止引入 node 内置模块(ipc-state §5)。
// Tab 缩进兜底:Tab 只在列表项(sink/lift, priority 50)和表格(跳格, priority 100)有绑定,
// 普通段落/代码块空档时焦点移出编辑器。本 keymap 以 priority 10 注册,
// KeymapManager 按优先级降序 chainCommands——列表 sink / 表格跳格先匹配,返回 true 时本 handler 不执行。
//   - code_block 内:Tab 插入两个半角空格;Shift-Tab 不处理(返回 false)
//   - 普通文本块(paragraph/heading):Tab 插入两个全角空格(中文写作惯例);
//     Shift-Tab 在光标前紧跟两个全角空格时删除它们(outdent),否则返回 false
//   - 列表项/表格单元格内(上级命令失配时,如首个列表项无法 sink):返回 false,不插空格
import { $useKeymap } from '@milkdown/utils'
import type { Command } from '@milkdown/prose/state'
import type { MilkdownPlugin } from '@milkdown/ctx'

const TEXT_INDENT = '　　' // 两个全角空格 U+3000
const CODE_INDENT = '  ' // 两个半角空格

/** 光标是否位于列表项或表格单元格内(这些上下文的 Tab 归上级 keymap 管,失配也不兜底) */
function inListOrTable($from: { depth: number; node: (d: number) => { type: { name: string } } }): boolean {
  for (let d = $from.depth; d > 0; d--) {
    const name = $from.node(d).type.name
    if (name === 'list_item' || name === 'table_cell' || name === 'table_header') return true
  }
  return false
}

const insertTabIndent: Command = (state, dispatch) => {
  const { $from, empty } = state.selection
  if (!empty || !$from.parent.isTextblock || inListOrTable($from)) return false
  const text = $from.parent.type.spec.code ? CODE_INDENT : TEXT_INDENT
  if (dispatch) dispatch(state.tr.insertText(text))
  return true
}

const removeTabIndent: Command = (state, dispatch) => {
  const { $from, empty } = state.selection
  if (!empty || !$from.parent.isTextblock) return false
  if ($from.parent.type.spec.code || inListOrTable($from)) return false
  if ($from.pos - $from.start() < TEXT_INDENT.length) return false
  if (state.doc.textBetween($from.pos - TEXT_INDENT.length, $from.pos) !== TEXT_INDENT) return false
  if (dispatch) dispatch(state.tr.delete($from.pos - TEXT_INDENT.length, $from.pos))
  return true
}

const tabKeymap = $useKeymap('tabIndent', {
  TabIndent: {
    shortcuts: 'Tab',
    priority: 10,
    command: () => insertTabIndent,
  },
  ShiftTabOutdent: {
    shortcuts: 'Shift-Tab',
    priority: 10,
    command: () => removeTabIndent,
  },
})

export const tabKeymapPlugins: MilkdownPlugin[] = tabKeymap.flat()
