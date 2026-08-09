// 注意:本文件被渲染进程使用,禁止引入 node 内置模块(ipc-state §5)。
// 表格行列手柄 + 左上角 ⋯ 菜单(设计:docs/superpowers/specs/2026-08-09-writing-table-ui-design.md §②)。
// 光标在表格内时跟随光标所在单元格:行左侧 +/−(下方插行/删该行)、列顶部 +/−(右侧插列/
// 删该列)、左上角 ⋯(列对齐左/中/右、删除表格)。行列定位走 DOM(rowIndex/cellIndex),
// GFM 表格无跨行跨列,与 prosemirror-tables 的 grid 索引一致。
// 删行/列 = selectRow/selectCol → deleteSelectedCells(单元格多选态原生兼容)。
// 命令经 $prose 工厂闭包的 ctx 直调,不走 toolbar 的 writingEditorAction 代理。
// 按钮用 mousedown + preventDefault,避免点击夺走编辑器选区导致手柄自身隐藏。
import { $prose, callCommand } from '@milkdown/utils'
import { editorViewCtx } from '@milkdown/core'
import { Plugin, PluginKey, Selection, TextSelection } from '@milkdown/prose/state'
import {
  addRowAfterCommand,
  addColAfterCommand,
  selectRowCommand,
  selectColCommand,
  selectTableCommand,
  deleteSelectedCellsCommand,
  setAlignCommand,
} from '@milkdown/preset-gfm'
import type { MilkdownPlugin, Ctx } from '@milkdown/ctx'
import type { EditorView } from '@milkdown/prose/view'
import type { ResolvedPos } from '@milkdown/prose/model'

/** 光标祖先链上的表格节点 pos;不在表格内返回 null */
function findTablePos($from: ResolvedPos): number | null {
  for (let d = $from.depth; d > 0; d--) {
    if ($from.node(d).type.name === 'table') return $from.before(d)
  }
  return null
}

/** 光标所在单元格(table_cell/table_header 祖先)的 pos */
function findCellPos($from: ResolvedPos): number | null {
  for (let d = $from.depth; d > 0; d--) {
    const name = $from.node(d).type.name
    if (name === 'table_cell' || name === 'table_header') return $from.before(d)
  }
  return null
}

class TableHandlesView {
  private container: HTMLDivElement
  private popup: HTMLDivElement
  private row = 0
  private col = 0
  private tablePos: number | null = null
  private relayout = () => this.layout()
  private onDocClick = () => this.closeMenu()

  constructor(private view: EditorView, private ctx: Ctx, private root: HTMLElement) {
    this.container = document.createElement('div')
    this.container.dataset.testid = 'writing-table-handles'
    this.container.style.display = 'none'
    root.appendChild(this.container)

    this.mkBtn('writing-table-row-add', '+', '下方插入行', () => this.call(addRowAfterCommand.key))
    this.mkBtn('writing-table-row-del', '−', '删除当前行(表头行删除后次行晋升表头)', () => {
      if (this.row === 0 && this.deleteHeaderWithPromotion()) return
      this.call(selectRowCommand.key, { index: this.row })
      this.call(deleteSelectedCellsCommand.key)
    })
    this.mkBtn('writing-table-col-add', '+', '右侧插入列', () => this.call(addColAfterCommand.key))
    this.mkBtn('writing-table-col-del', '−', '删除当前列', () => {
      this.call(selectColCommand.key, { index: this.col })
      this.call(deleteSelectedCellsCommand.key)
    })
    this.mkBtn('writing-table-menu', '⋯', '表格操作(列对齐/删除表格)', () => this.toggleMenu())

    // ⋯ 弹出菜单:列对齐 + 删除表格
    this.popup = document.createElement('div')
    this.popup.dataset.testid = 'writing-table-menu-popup'
    this.popup.className = 'writing-table-menu-popup'
    this.popup.style.display = 'none'
    this.popup.addEventListener('click', e => e.stopPropagation())
    for (const [label, align] of [['左对齐', 'left'], ['居中', 'center'], ['右对齐', 'right']] as const) {
      const b = document.createElement('button')
      b.dataset.testid = 'writing-table-align'
      b.dataset.align = align
      b.textContent = label
      b.addEventListener('mousedown', e => {
        e.preventDefault()
        // setCellAttr 对 TextSelection 只改当前单元格,而序列化只读表头行对齐;
        // 先选中光标所在整列(CellSelection),让对齐落到表头 + 该列全部单元格。
        this.call(selectColCommand.key, { index: this.col })
        this.call(setAlignCommand.key, align)
        // 对齐生效后折叠整列 CellSelection 回普通光标——
        // 选中态停留时敲字会替换该列首个单元格内容
        this.collapseCellSelection()
        this.closeMenu()
      })
      this.popup.appendChild(b)
    }
    const del = document.createElement('button')
    del.dataset.testid = 'writing-table-delete'
    del.textContent = '删除表格'
    del.addEventListener('mousedown', e => {
      e.preventDefault()
      // preset-gfm 7.x 无独立 deleteTableCommand;全选表格后 deleteSelectedCells
      // 内部 isRow && isCol 命中 deleteTable(prosemirror-tables)。
      this.call(selectTableCommand.key)
      this.call(deleteSelectedCellsCommand.key)
      this.closeMenu()
    })
    this.popup.appendChild(del)
    this.container.appendChild(this.popup)

    // capture 阶段监听任意滚动(编辑器容器/.tableWrapper 横滚),跟随重定位
    document.addEventListener('scroll', this.relayout, true)
    window.addEventListener('resize', this.relayout)
  }

  private call(cmd: any, payload?: any) {
    callCommand(cmd, payload)(this.ctx)
  }

  /** 删表头行 + 次行晋升表头(用户决策,不做禁用防护)。返回 false 表示无法处理(回退命令路径)。
   *  不能走 selectRow+deleteRow:PM 的 Transform.delete 会为 table 必填的 table_header_row
   *  自动合成空行(schema 保持),prosemirror-tables 的 fixTables 再补一行,产出幽灵行。
   *  也不能 setNodeMarkup 两遍(细胞先转 → table_row 校验拒绝;行先转 → content 校验拒绝)。
   *  故用次行单元格内容整行重建 table_header_row,一步 replaceWith 替换两行区间。
   *  单行表(只剩表头)无法晋升,返回 false——deleteRow 对唯一行本就是 no-op,行为不变。 */
  private deleteHeaderWithPromotion(): boolean {
    const tablePos = this.tablePos
    if (tablePos == null) return false
    const view = this.ctx.get(editorViewCtx)
    const table = view.state.doc.nodeAt(tablePos)
    if (!table || table.type.name !== 'table' || table.childCount < 2) return false
    const headerRowType = view.state.schema.nodes.table_header_row
    const headerType = view.state.schema.nodes.table_header
    if (!headerRowType || !headerType) return false
    const row0 = table.child(0)
    const row1 = table.child(1)
    const cells: Parameters<typeof headerRowType.create>[1] = []
    row1.forEach(cell => { (cells as any[]).push(headerType.create(cell.attrs, cell.content)) })
    const newHeaderRow = headerRowType.create(row1.attrs, cells)
    view.dispatch(
      view.state.tr.replaceWith(tablePos + 1, tablePos + 1 + row0.nodeSize + row1.nodeSize, newHeaderRow),
    )
    return true
  }

  /** 把 CellSelection 折叠回普通文本光标(head 位置不合法时退化为 Selection.near) */
  private collapseCellSelection() {
    const view = this.ctx.get(editorViewCtx)
    const sel = view.state.selection
    if (sel.empty) return
    try {
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, sel.head)))
    } catch {
      try {
        view.dispatch(view.state.tr.setSelection(Selection.near(view.state.doc.resolve(sel.head))))
      } catch { /* 选区已失效,忽略 */ }
    }
  }

  private mkBtn(testid: string, text: string, title: string, onDown: () => void): HTMLButtonElement {
    const b = document.createElement('button')
    b.dataset.testid = testid
    b.textContent = text
    b.title = title
    b.className = 'writing-handle-btn'
    b.addEventListener('mousedown', e => { e.preventDefault(); onDown() })
    b.addEventListener('click', e => e.stopPropagation())
    this.container.appendChild(b)
    return b
  }

  private toggleMenu() {
    const open = this.popup.style.display !== 'none'
    if (open) return this.closeMenu()
    this.popup.style.display = 'block'
    document.addEventListener('click', this.onDocClick)
  }

  private closeMenu() {
    this.popup.style.display = 'none'
    document.removeEventListener('click', this.onDocClick)
  }

  private place(testid: string, left: number, top: number) {
    const b = this.container.querySelector<HTMLElement>(`[data-testid="${testid}"]`)!
    b.style.left = `${Math.round(left)}px`
    b.style.top = `${Math.round(top)}px`
  }

  private layout() {
    const { $from } = this.view.state.selection
    const tablePos = findTablePos($from)
    const cellPos = tablePos != null ? findCellPos($from) : null
    if (tablePos == null || cellPos == null) {
      this.container.style.display = 'none'
      this.closeMenu()
      return
    }
    const tableDOM = this.view.nodeDOM(tablePos) as HTMLElement | null
    const cellDOM = this.view.nodeDOM(cellPos) as HTMLTableCellElement | null
    const rootRect = this.root.getBoundingClientRect()
    const tableRect = tableDOM?.getBoundingClientRect()
    // 几何失败(表格滚出视口/未渲染)→ 隐藏,不抛错
    if (!tableDOM || !cellDOM || !tableRect || tableRect.width === 0) {
      this.container.style.display = 'none'
      this.closeMenu()
      return
    }
    const cellRect = cellDOM.getBoundingClientRect()
    this.row = (cellDOM.parentElement as HTMLTableRowElement).rowIndex
    this.col = cellDOM.cellIndex
    this.tablePos = tablePos

    const t = (r: DOMRect) => r.top - rootRect.top
    const l = (r: DOMRect) => r.left - rootRect.left
    this.container.style.display = 'block'

    // 行手柄:表格左侧车道,竖排居中于光标所在行
    const rowX = l(tableRect) - 24
    const rowMidY = t(cellRect) + cellRect.height / 2
    this.place('writing-table-row-add', rowX, rowMidY - 19)
    this.place('writing-table-row-del', rowX, rowMidY + 1)
    // 列手柄:表格上方,横排对齐光标所在列左缘(顶部越界时压到 0)
    const colY = Math.max(t(tableRect) - 24, 0)
    this.place('writing-table-col-add', l(cellRect), colY)
    this.place('writing-table-col-del', l(cellRect) + 20, colY)
    // ⋯:表格左上角车道位
    this.place('writing-table-menu', l(tableRect) - 24, colY)
    this.popup.style.left = `${Math.round(l(tableRect) - 24)}px`
    this.popup.style.top = `${Math.round(colY + 22)}px`
  }

  update(view: EditorView) {
    this.view = view
    this.layout()
  }

  destroy() {
    document.removeEventListener('scroll', this.relayout, true)
    window.removeEventListener('resize', this.relayout)
    document.removeEventListener('click', this.onDocClick)
    this.container.remove()
  }
}

const tableHandles = $prose(
  (ctx) =>
    new Plugin({
      key: new PluginKey('STUDY_PARLOR_TABLE_HANDLES'),
      view: (view) => {
        const root = view.dom.closest('.writing-editor-root') as HTMLElement | null
        if (!root) return { update: () => {}, destroy: () => {} }
        return new TableHandlesView(view, ctx, root)
      },
    }),
)

export const tableHandlesPlugins: MilkdownPlugin[] = [tableHandles]
