// 注意:本文件被渲染进程使用,禁止引入 node 内置模块(ipc-state §5)。
// 行首退格删除分隔线(设计 2026-08-12 §2):光标塌缩在段落行首、前一节点是 hr 时,
// 一步删除分隔线——避免 ProseMirror 默认 selectNodeBackward 先选中节点、第二次才删。
// 仅在 paragraph 内生效(标题/列表等交还各自 keymap);priority 60 > 基础 keymap(50)。
import { $useKeymap } from '@milkdown/utils'
import { Selection } from '@milkdown/prose/state'
import type { Command } from '@milkdown/prose/state'
import type { MilkdownPlugin } from '@milkdown/ctx'

const deleteHrBefore: Command = (state, dispatch) => {
  const { selection } = state
  if (!selection.empty) return false
  const { $from } = selection
  if ($from.parent.type.name !== 'paragraph') return false // 只处理段落,标题/列表交还默认
  if ($from.parentOffset !== 0) return false // 必须行首
  const posBefore = $from.before()
  const prevPos = posBefore - 1
  if (prevPos < 0) return false // hr 在文档第一行,保护
  const prev = state.doc.nodeAt(prevPos)
  if (!prev || prev.type.name !== 'hr') return false
  if (dispatch) {
    const tr = state.tr.delete(prevPos, posBefore)
    const sel = Selection.near(tr.doc.resolve(prevPos))
    dispatch(tr.setSelection(sel).scrollIntoView())
  }
  return true
}

const hrBackspaceKeymap = $useKeymap('hrBackspace', {
  DeleteHrBefore: {
    shortcuts: 'Backspace',
    priority: 60,
    command: () => deleteHrBefore,
  },
})

export const hrBackspacePlugins: MilkdownPlugin[] = hrBackspaceKeymap.flat()
