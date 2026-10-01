// 注意:本文件被渲染进程使用,禁止引入 node 内置模块(ipc-state §5)。
// 分割线插入后光标落到下一行(设计 spec §E / 2026-08-12 §4)。
// 不再用 preset-commonmark 的 insertHrCommand(其 .insert(from, 空段) 会多塞一个
// 空段落,产生「文字 → 空行 → 分隔线」);改用自建 insertHrCleanCommand(只
// replaceSelectionWith(hr))。仍复用 runCollapsedBlockCommand 折叠选区+代码块守卫。
// 光标定位:hr 前若是空段落(插入点在段首的 split 前段)则删掉避免前导空行;
// hr 下方已有内容 → 放其行首,否则补一个空段落并放光标。
// 供 WritingToolbar 与两个对照编辑器宿主(CompanionBoard/ArticleCompanionBoard)共用。
import { editorViewCtx } from '@milkdown/core'
import { Selection, TextSelection } from '@milkdown/prose/state'
import { runCollapsedBlockCommand } from './milkdown-collapse-selection'
import { insertHrCleanCommand } from './milkdown-orbit-hr'

export function insertHrBelow(ctx: any): boolean {
  const view = ctx.get(editorViewCtx)
  const insertAt = view.state.selection.head // 折叠后的插入点(runCollapsedBlockCommand 折叠到 head)
  const ok = runCollapsedBlockCommand(insertHrCleanCommand.key)(ctx)
  if (ok === false) return false
  const doc = view.state.doc
  let hrPos = -1
  doc.descendants((node: any, pos: number) => {
    if (node.type.name === 'hr' && pos >= insertAt && hrPos === -1) hrPos = pos
    return true
  })
  if (hrPos < 0) return true // 没找到新 hr,不动光标
  let tr = view.state.tr
  let hrStart = hrPos
  // hr 前若是空段落(插入点在段首的 split 前段),一并删除避免前导空行
  const prev = doc.nodeAt(hrPos - 1)
  if (prev && prev.type.name === 'paragraph' && prev.textContent.length === 0) {
    tr = tr.delete(hrPos - 1, hrPos)
    hrStart = hrPos - 1
  }
  const after = hrStart + 1 // hr nodeSize === 1 → after = hr 之后的位置
  const next = tr.doc.nodeAt(after) // hr 下方原本的节点
  let targetPos: number
  if (next) {
    targetPos = after + 1 // 下一块内容行首
  } else {
    tr = tr.replaceWith(after, after, view.state.schema.nodes.paragraph.create())
    targetPos = after + 1
  }
  try {
    tr.setSelection(TextSelection.create(tr.doc, targetPos))
  } catch {
    tr.setSelection(Selection.near(tr.doc.resolve(targetPos)))
  }
  view.dispatch(tr.scrollIntoView())
  return true
}
