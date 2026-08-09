// 块级 wrap 命令(标题/引用/列表)在 ProseMirror 层作用于选区内所有文本块。
// 用户带着非空选区点击工具栏会铲平整个选区(全文变标题、代码块围栏丢失)。
// 本模块提供统一入口:执行前把非空选区折叠到 selection.head,再执行原命令;
// 代码块内禁止执行(返回 false,由调用方给用户提示)。
// 注意:inline mark 命令(加粗/斜体/删除线/颜色)语义上需要选区,不要走这里。
import { editorViewCtx } from '@milkdown/core'
import type { Ctx } from '@milkdown/ctx'
import { Selection, TextSelection } from '@milkdown/prose/state'
import { callCommand } from '@milkdown/utils'

/** head 位置未必能放文本光标(如节点边界),TextSelection.create 可能抛错,退化为 Selection.near */
function collapsedAt(doc: any, head: number): Selection {
  try {
    return TextSelection.create(doc, head)
  } catch {
    return Selection.near(doc.resolve(head))
  }
}

/**
 * 包装一个块级命令:先折叠选区到 head,再在折叠后的光标位置执行。
 * 返回 (ctx) => boolean,用法与 callCommand 一致(editor.action / act 均可)。
 * 代码块内直接返回 false,不修改文档。
 */
export function runCollapsedBlockCommand(cmd: any, payload?: any) {
  return (ctx: Ctx): boolean => {
    const view = ctx.get(editorViewCtx)
    const sel = view.state.selection
    if (!sel.empty) {
      view.dispatch(view.state.tr.setSelection(collapsedAt(view.state.doc, sel.head)))
    }
    if (view.state.selection.$from.parent.type.name === 'code_block') return false
    return callCommand(cmd, payload)(ctx)
  }
}
