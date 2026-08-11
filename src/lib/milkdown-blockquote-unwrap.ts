// 注意:本文件被渲染进程使用,禁止引入 node 内置模块(ipc-state §5)。
// 行首退格解除引用(设计 2026-08-12 §5):光标在引用内第一段行首按退格时,
// 直接把 blockquote 替换为其内容(取消引用包裹、不缩进),解决「文章开头引用删不掉」。
// 仅引用内第一段触发(后续段落退格交还默认 join);priority 60 > 基础 keymap(50)。
import { $useKeymap } from '@milkdown/utils'
import { Slice } from '@milkdown/prose/model'
import { TextSelection } from '@milkdown/prose/state'
import type { Command } from '@milkdown/prose/state'
import type { MilkdownPlugin } from '@milkdown/ctx'

const unwrapBlockquoteOnBackspace: Command = (state, dispatch) => {
  const { selection } = state
  if (!selection.empty) return false
  const { $from } = selection
  if ($from.parentOffset !== 0) return false // 必须行首
  const quoteDepth = $from.depth - 1
  if (quoteDepth < 1) return false // 必须在外层包裹内
  if ($from.node(quoteDepth).type.name !== 'blockquote') return false
  if ($from.index() !== 0) return false // 仅引用内第一段(后续段落交还默认 join)
  const bq = $from.node(quoteDepth)
  const bqStart = $from.before(quoteDepth)
  const bqEnd = $from.after(quoteDepth)
  if (dispatch) {
    let tr = state.tr.replace(bqStart, bqEnd, new Slice(bq.content, 0, 0))
    tr = tr.setSelection(TextSelection.near(tr.doc.resolve(bqStart)))
    dispatch(tr.scrollIntoView())
  }
  return true
}

const blockquoteUnwrapKeymap = $useKeymap('blockquoteUnwrap', {
  UnwrapBlockquote: {
    shortcuts: 'Backspace',
    priority: 60,
    command: () => unwrapBlockquoteOnBackspace,
  },
})

export const blockquoteUnwrapPlugins: MilkdownPlugin[] = blockquoteUnwrapKeymap.flat()
