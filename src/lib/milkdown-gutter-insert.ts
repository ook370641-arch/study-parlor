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
  private relayout = () => this.layout()
  private onDocClick = () => this.closeMenu()

  constructor(private view: EditorView, private ctx: Ctx, private root: HTMLElement) {
    this.plus = document.createElement('button')
    this.plus.dataset.testid = 'writing-gutter-plus'
    this.plus.textContent = '+'
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
        item.run(this.ctx)
        this.closeMenu()
      })
      this.menu.appendChild(b)
    }
    root.appendChild(this.menu)

    document.addEventListener('scroll', this.relayout, true)
    window.addEventListener('resize', this.relayout)
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
    // 代码块内隐藏;depth < 1 无顶层块可言
    let inCode = false
    for (let d = $from.depth; d > 0; d--) {
      if ($from.node(d).type.spec.code || $from.node(d).type.name === 'code_block') { inCode = true; break }
    }
    if (inCode || $from.depth < 1) {
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
    this.plus.remove()
    this.menu.remove()
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
