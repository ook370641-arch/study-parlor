// 注意:本文件被渲染进程使用,禁止引入 node 内置模块(ipc-state §5)。
//
// 代码块 Enter 退出(Typora 惯例)——修复"文末不可见空代码块吞掉 Enter"的问题:
// baseKeymap 的 newlineInCode 在代码块内只插入 \n、不产生新段落,光标落入文末
// 空代码块后按 Enter 看似失灵(退出需无提示的 Mod-Enter)。
//
// 本插件在代码块**最后一个空行**上按 Enter 时退出代码块:在代码块下方新建空段落
// 并把光标放进去。精确触发条件(全部满足,否则返回 false 放行 newlineInCode):
//   1. selection 为空(光标,非选区)
//   2. 直接父节点是 code_block
//   3. 光标在 code_block 内容末尾
//   4. 光标所在行(同一 code_block 内上一个 '\n' 到光标之间)为空
//
// 优先级说明:Milkdown 把 $prose 插件放在 plugins 数组前段,内置 keymap
// (含 baseKeymap/newlineInCode)固定在数组末尾;ProseMirror 的 someProp 按数组
// 顺序分发 handleKeyDown,因此本 keymap 天然先于 newlineInCode 被调用,
// 无需显式 priority(已由 tests/writing-codeblock-enter.test.ts 实测验证)。
import { $prose } from '@milkdown/utils'
import type { MilkdownPlugin } from '@milkdown/ctx'
import { keymap } from '@milkdown/prose/keymap'
import { TextSelection } from '@milkdown/prose/state'
import type { Command } from '@milkdown/prose/state'

const exitCodeBlockOnLastEmptyLine: Command = (state, dispatch) => {
  const { selection } = state
  if (!selection.empty) return false
  const { $from } = selection
  const codeBlock = state.schema.nodes.code_block
  if (!codeBlock || $from.parent.type !== codeBlock) return false
  // 光标必须位于 code_block 内容末尾
  if ($from.pos !== $from.end()) return false
  // 光标所在行(同一 code_block 内上一个 '\n' 之后到光标)必须为空;
  // 空代码块(textContent === '')时 currentLine 也为 '',同样触发退出。
  const text = $from.parent.textContent
  const currentLine = text.slice(text.lastIndexOf('\n') + 1)
  if (currentLine.length > 0) return false
  if (dispatch) {
    const after = $from.after()
    const paragraph = state.schema.nodes.paragraph.create()
    const tr = state.tr.insert(after, paragraph)
    tr.setSelection(TextSelection.create(tr.doc, after + 1)).scrollIntoView()
    dispatch(tr)
  }
  return true
}

const codeblockEnterKeymap = $prose(() => keymap({ Enter: exitCodeBlockOnLastEmptyLine }))

export const codeblockEnterPlugins: MilkdownPlugin[] = [codeblockEnterKeymap]
