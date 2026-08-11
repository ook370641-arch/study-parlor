// 注意:本文件被渲染进程使用,禁止引入 node 内置模块(ipc-state §5)。
// 选中文字悬浮格式栏(设计:2026-08-11-... §B)。复用 milkdown-table-handles 的
// DOM 挂载/定位/滚动跟随模式;点击按钮不隐藏(可连续改色+加粗),外点/Esc/失焦隐藏。
import { $prose, callCommand } from '@milkdown/utils'
import { Plugin, PluginKey } from '@milkdown/prose/state'
import { toggleStrongCommand, toggleEmphasisCommand } from '@milkdown/preset-commonmark'
import { toggleStrikethroughCommand } from '@milkdown/preset-gfm'
import { textColorCommand, TEXT_COLOR_PALETTE } from './milkdown-text-color'
import type { MilkdownPlugin, Ctx } from '@milkdown/ctx'
import type { EditorView } from '@milkdown/prose/view'

export function shouldShowBubble(selection: any, editable: boolean): boolean {
  if (!editable || selection.empty) return false
  const { $from } = selection
  for (let d = $from.depth; d > 0; d--) {
    if ($from.node(d).type.name === 'code_block') return false
  }
  return true
}

class SelectionBubbleView {
  private container: HTMLDivElement
  private swatches: HTMLDivElement
  private relayout = () => this.layout()
  private onDocClick = () => this.hide(true)
  private onKeydown = (e: KeyboardEvent) => { if (e.key === 'Escape') this.hide(true) }
  private dismissed = false
  private lastSelection: any = null

  constructor(private view: EditorView, private ctx: Ctx, private root: HTMLElement) {
    this.container = document.createElement('div')
    this.container.dataset.testid = 'writing-format-bubble'
    this.container.className = 'writing-format-bubble'
    this.container.style.display = 'none'
    this.container.addEventListener('mousedown', e => e.preventDefault())
    this.container.addEventListener('click', e => e.stopPropagation())
    root.appendChild(this.container)

    this.mkBtn('writing-bubble-bold', 'B', () => this.call(toggleStrongCommand.key), { fontWeight: '700' })
    this.mkBtn('writing-bubble-italic', 'I', () => this.call(toggleEmphasisCommand.key), { fontStyle: 'italic' })
    this.mkBtn('writing-bubble-strikethrough', 'S', () => this.call(toggleStrikethroughCommand.key), { textDecoration: 'line-through' })

    const colorBtn = this.mkBtn('writing-bubble-color', 'A▾', () => this.toggleSwatches(), {})
    colorBtn.style.color = '#d97757'

    this.swatches = document.createElement('div')
    this.swatches.dataset.testid = 'writing-bubble-swatches'
    this.swatches.className = 'writing-bubble-swatches'
    this.swatches.style.display = 'none'
    for (const c of TEXT_COLOR_PALETTE) {
      const s = document.createElement('button')
      s.dataset.testid = 'writing-bubble-color-option'
      s.dataset.color = c.value ?? ''
      s.title = c.label
      s.className = 'writing-bubble-swatch'
      s.style.background = c.value ?? 'transparent'
      s.addEventListener('mousedown', e => e.preventDefault())
      s.addEventListener('click', e => {
        e.stopPropagation()
        this.call(textColorCommand.key, { color: c.value })
        this.swatches.style.display = 'none' // 选色后收起色板,悬浮栏本体保持
      })
      this.swatches.appendChild(s)
    }
    this.container.appendChild(this.swatches)

    document.addEventListener('scroll', this.relayout, true)
    window.addEventListener('resize', this.relayout)
    document.addEventListener('click', this.onDocClick)
    document.addEventListener('keydown', this.onKeydown)
  }

  private call(cmd: any, payload?: any) { callCommand(cmd, payload)(this.ctx) }

  private mkBtn(testid: string, text: string, onClick: () => void, style: Record<string, string>): HTMLButtonElement {
    const b = document.createElement('button')
    b.dataset.testid = testid
    b.textContent = text
    Object.assign(b.style, style)
    b.addEventListener('mousedown', e => e.preventDefault()) // 保住编辑器选区
    b.addEventListener('click', e => { e.stopPropagation(); onClick() }) // 点击后悬浮栏保持
    this.container.appendChild(b)
    return b
  }

  private toggleSwatches() {
    this.swatches.style.display = this.swatches.style.display === 'none' ? 'block' : 'none'
  }

  private hide(dismiss = false) {
    if (dismiss) this.dismissed = true
    this.container.style.display = 'none'
    this.swatches.style.display = 'none'
  }

  private layout() {
    if (this.dismissed) return this.hide()
    const view = this.view
    const { selection } = view.state
    const editable = view.props.editable?.(view.state) ?? true
    if (!shouldShowBubble(selection, editable) || !view.hasFocus()) return this.hide()
    const domSel = window.getSelection()
    const range = domSel && domSel.rangeCount > 0 ? domSel.getRangeAt(0) : null
    const rect = range ? range.getBoundingClientRect() : null
    if (!rect || rect.width === 0 || rect.height === 0) return this.hide()
    const rootRect = this.root.getBoundingClientRect()
    this.container.style.display = 'block'
    const bw = this.container.offsetWidth
    const left = Math.max(8, Math.min(rect.left - rootRect.left + rect.width / 2 - bw / 2, rootRect.width - bw - 8))
    const topAbove = rect.top - rootRect.top - this.container.offsetHeight - 8
    const top = topAbove >= 0 ? topAbove : rect.bottom - rootRect.top + 8
    this.container.style.left = `${Math.round(left)}px`
    this.container.style.top = `${Math.round(top)}px`
  }

  update(view: EditorView) {
    this.view = view
    if (this.lastSelection && !view.state.selection.eq(this.lastSelection)) {
      this.dismissed = false
    }
    this.lastSelection = view.state.selection
    this.layout()
  }

  destroy() {
    document.removeEventListener('scroll', this.relayout, true)
    window.removeEventListener('resize', this.relayout)
    document.removeEventListener('click', this.onDocClick)
    document.removeEventListener('keydown', this.onKeydown)
    this.container.remove()
  }
}

export const selectionBubblePlugins: MilkdownPlugin[] = [
  $prose((ctx: Ctx) =>
    new Plugin({
      key: new PluginKey('STUDY_PARLOR_SELECTION_BUBBLE'),
      view: (view: EditorView) => {
        const root = view.dom.closest('.writing-editor-root') as HTMLElement | null
        if (!root) return { update: () => {}, destroy: () => {} }
        return new SelectionBubbleView(view, ctx, root)
      },
    }),
  ),
]
