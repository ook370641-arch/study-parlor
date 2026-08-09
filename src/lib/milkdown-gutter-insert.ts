// 注意:本文件被渲染进程使用,禁止引入 node 内置模块(ipc-state §5)。
// 块级 gutter「+」插入菜单(设计:docs/superpowers/specs/2026-08-09-writing-table-ui-design.md §③)。
// 常驻跟随光标所在顶层块(depth 1),点击展开菜单:无序/有序列表、表格、H1-H3。
// wrap 类命令复用 toolbar 的 runCollapsedBlockCommand(防非空选区被铲平);
// 代码块内隐藏(wrap 在代码块无意义);命令 when 不满足返回 false → 静默关闭,文档不变。
import { $prose, callCommand } from '@milkdown/utils'
import { Plugin, PluginKey } from '@milkdown/prose/state'
import {
  wrapInBulletListCommand,
  wrapInOrderedListCommand,
  wrapInHeadingCommand,
} from '@milkdown/preset-commonmark'
import { insertTableCommand } from '@milkdown/preset-gfm'
import { runCollapsedBlockCommand } from './milkdown-collapse-selection'
import type { MilkdownPlugin, Ctx } from '@milkdown/ctx'
import type { EditorView } from '@milkdown/prose/view'

const ITEMS: { type: string; label: string; run: (ctx: Ctx) => unknown }[] = [
  { type: 'bullet', label: '无序列表', run: ctx => runCollapsedBlockCommand(wrapInBulletListCommand.key)(ctx) },
  { type: 'ordered', label: '有序列表', run: ctx => runCollapsedBlockCommand(wrapInOrderedListCommand.key)(ctx) },
  { type: 'table', label: '表格', run: ctx => callCommand(insertTableCommand.key)(ctx) },
  { type: 'h1', label: 'H1', run: ctx => runCollapsedBlockCommand(wrapInHeadingCommand.key, 1)(ctx) },
  { type: 'h2', label: 'H2', run: ctx => runCollapsedBlockCommand(wrapInHeadingCommand.key, 2)(ctx) },
  { type: 'h3', label: 'H3', run: ctx => runCollapsedBlockCommand(wrapInHeadingCommand.key, 3)(ctx) },
]

class GutterInsertView {
  private plus: HTMLButtonElement
  private menu: HTMLDivElement
  private hint: HTMLSpanElement
  private hintTimer: ReturnType<typeof setTimeout> | null = null
  private relayout = () => this.layout()
  private onDocClick = () => this.closeMenu()

  constructor(private view: EditorView, private ctx: Ctx, private root: HTMLElement) {
    this.plus = document.createElement('button')
    this.plus.dataset.testid = 'writing-gutter-plus'
    this.plus.textContent = '+'
    this.plus.title = '插入块(列表/表格/标题)'
    this.plus.className = 'writing-handle-btn'
    this.plus.style.display = 'none'
    this.plus.addEventListener('mousedown', e => { e.preventDefault(); this.toggleMenu() })
    this.plus.addEventListener('click', e => e.stopPropagation())
    root.appendChild(this.plus)

    this.menu = document.createElement('div')
    this.menu.dataset.testid = 'writing-gutter-menu'
    this.menu.className = 'writing-gutter-menu'
    this.menu.style.display = 'none'
    this.menu.addEventListener('click', e => e.stopPropagation())
    for (const item of ITEMS) {
      const b = document.createElement('button')
      b.dataset.testid = 'writing-gutter-item'
      b.dataset.type = item.type
      b.textContent = item.label
      b.addEventListener('mousedown', e => {
        e.preventDefault()
        const ok = item.run(this.ctx)
        this.closeMenu()
        // 命令 when 不满足返回 false(如 li 内点标题)——文档不变是预期,
        // 但需给出与工具栏一致的失败提示,不能静默(用户以为按钮坏了)
        if (ok === false) this.showHint()
      })
      this.menu.appendChild(b)
    }
    root.appendChild(this.menu)

    this.hint = document.createElement('span')
    this.hint.dataset.testid = 'writing-gutter-hint'
    this.hint.className = 'writing-gutter-hint'
    this.hint.textContent = '当前位置不支持该操作'
    this.hint.style.display = 'none'
    root.appendChild(this.hint)

    document.addEventListener('scroll', this.relayout, true)
    window.addEventListener('resize', this.relayout)
  }

  private showHint() {
    // 定位在「+」右侧(与菜单位置一致)
    this.hint.style.left = '24px'
    this.hint.style.top = this.plus.style.top
    this.hint.style.display = 'block'
    if (this.hintTimer !== null) clearTimeout(this.hintTimer)
    this.hintTimer = setTimeout(() => {
      this.hint.style.display = 'none'
      this.hintTimer = null
    }, 2500)
  }

  private toggleMenu() {
    const open = this.menu.style.display !== 'none'
    if (open) return this.closeMenu()
    this.menu.style.display = 'block'
    document.addEventListener('click', this.onDocClick)
  }

  private closeMenu() {
    this.menu.style.display = 'none'
    document.removeEventListener('click', this.onDocClick)
  }

  private layout() {
    const { $from } = this.view.state.selection
    // 代码块内隐藏;depth < 1 无顶层块可言;表格内隐藏——表格已有自己的行列手柄组
    // (x 坐标与 gutter 重叠),且 gutter 六项 wrap/setBlockType 在 table_cell 内静默失败无意义
    let inCode = false
    for (let d = $from.depth; d > 0; d--) {
      if ($from.node(d).type.spec.code || $from.node(d).type.name === 'code_block') { inCode = true; break }
    }
    const inTable = $from.depth >= 1 && $from.node(1).type.name === 'table'
    if (inCode || inTable || $from.depth < 1) {
      this.plus.style.display = 'none'
      this.closeMenu()
      return
    }
    const rootRect = this.root.getBoundingClientRect()
    const coords = this.view.coordsAtPos($from.before(1))
    this.plus.style.display = 'block'
    this.plus.style.left = '2px'
    this.plus.style.top = `${Math.round(coords.top - rootRect.top + 2)}px`
    this.menu.style.left = '24px'
    this.menu.style.top = `${Math.round(coords.top - rootRect.top + 22)}px`
  }

  update(view: EditorView) {
    this.view = view
    this.layout()
  }

  destroy() {
    document.removeEventListener('scroll', this.relayout, true)
    window.removeEventListener('resize', this.relayout)
    document.removeEventListener('click', this.onDocClick)
    if (this.hintTimer !== null) clearTimeout(this.hintTimer)
    this.plus.remove()
    this.menu.remove()
    this.hint.remove()
  }
}

const gutterInsert = $prose(
  (ctx) =>
    new Plugin({
      key: new PluginKey('STUDY_PARLOR_GUTTER_INSERT'),
      view: (view) => {
        const root = view.dom.closest('.writing-editor-root') as HTMLElement | null
        if (!root) return { update: () => {}, destroy: () => {} }
        return new GutterInsertView(view, ctx, root)
      },
    }),
)

export const gutterInsertPlugins: MilkdownPlugin[] = [gutterInsert]
