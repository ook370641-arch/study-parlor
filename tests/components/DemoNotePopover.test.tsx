import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { createRef } from 'react'

// 编辑提交会落盘到 state.json；组件测试里只关心「有没有写」，不真的走 IPC。
const { patchState } = vi.hoisted(() => ({ patchState: vi.fn(async () => undefined) }))
vi.mock('@/lib/ipc', () => ({ ipc: { patchState } }))

import { DemoInfoButton, DemoNotePopover } from '@/components/demo/DemoNotePopover'
import { DEMO_NOTES } from '@/lib/demo-notes'
import { useStore } from '@/store'

// 本仓库未开 vitest globals，@testing-library 的自动 cleanup 不会注册；
// 手动卸载，否则同 testid 会在用例间残留导致 getByTestId 命中多个。
afterEach(cleanup)

beforeEach(() => {
  useStore.setState({ demoNoteOverrides: {} })
  patchState.mockClear()
})

describe('DemoNotePopover', () => {
  it('noteId 为 null 时不渲染任何内容', () => {
    const ref = createRef<HTMLSpanElement>()
    const { container } = render(
      <DemoNotePopover noteId={null} anchorRef={ref} onClose={() => {}} />
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('打开书籍来源说明：渲染标题、结论句与「失败/边界」小节', () => {
    const ref = createRef<HTMLSpanElement>()
    render(
      <>
        <span ref={ref} />
        <DemoNotePopover noteId="book-source" anchorRef={ref} onClose={() => {}} />
      </>
    )
    const panel = screen.getByTestId('demo-note-popover-book-source')
    expect(panel).toHaveTextContent(DEMO_NOTES['book-source'].title)
    expect(panel).toHaveTextContent(DEMO_NOTES['book-source'].thesis)
    expect(panel).toHaveTextContent('需求与缺陷（必须主动说）')
    expect(panel).toHaveTextContent('技术选型：为什么是 PDF.js')
  })

  it('每个入口都自带「不做 / 失败」与「怎么验证」的段落，避免只讲优点', () => {
    for (const id of Object.keys(DEMO_NOTES) as Array<keyof typeof DEMO_NOTES>) {
      const headings = DEMO_NOTES[id].sections.map((s) => s.heading).join('|')
      const haystack = headings + (DEMO_NOTES[id].qa ?? []).map((q) => q.q).join('|')
      expect(haystack).toMatch(/失败|边界|缺陷|追问|验证|局限/)
    }
  })

  it('渲染到 body 下，脱离父级 transform/overflow 裁剪', () => {
    const ref = createRef<HTMLSpanElement>()
    render(
      <div data-testid="clip-container" style={{ transform: 'translateZ(0)', overflow: 'hidden' }}>
        <span ref={ref} />
        <DemoNotePopover noteId="docflow" anchorRef={ref} onClose={() => {}} />
      </div>
    )
    const panel = screen.getByTestId('demo-note-popover-docflow')
    // portal 后弹层不在这层带 transform 的容器里，而是 body 的直接子元素
    expect(panel.parentElement).toBe(document.body)
    expect(screen.getByTestId('clip-container')).not.toContainElement(panel)
    expect(panel.className).toContain('z-[9999]')
  })

  it('关闭按钮触发 onClose，Esc 也触发', () => {
    const ref = createRef<HTMLSpanElement>()
    const onClose = vi.fn()
    render(
      <>
        <span ref={ref} />
        <DemoNotePopover noteId="guide" anchorRef={ref} onClose={onClose} />
      </>
    )
    fireEvent.click(screen.getByTestId('demo-note-close'))
    expect(onClose).toHaveBeenCalledTimes(1)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(2)
  })
})

describe('DemoNotePopover 编辑模式', () => {
  function renderGuide(onClose = vi.fn()) {
    const ref = createRef<HTMLSpanElement>()
    render(
      <>
        <span ref={ref} />
        <DemoNotePopover noteId="guide" anchorRef={ref} onClose={onClose} />
      </>
    )
    return { onClose, panel: screen.getByTestId('demo-note-popover-guide') }
  }

  it('双击进入编辑模式，文本块变为可编辑', () => {
    const { panel } = renderGuide()
    expect(screen.queryByTestId('demo-note-edit-hint')).toBeNull()
    expect(screen.getByTestId('demo-note-edit-thesis')).toHaveAttribute('contenteditable', 'false')

    fireEvent.doubleClick(panel)

    expect(screen.getByTestId('demo-note-edit-hint')).toHaveTextContent('编辑中')
    expect(screen.getByTestId('demo-note-edit-thesis')).toHaveAttribute('contenteditable', 'true')
    expect(screen.getByTestId('demo-note-edit-s0.p0')).toHaveAttribute('contenteditable', 'true')
  })

  it('失焦写回 store 并落盘，面板立刻显示新文案', () => {
    const { panel } = renderGuide()
    fireEvent.doubleClick(panel)

    const thesis = screen.getByTestId('demo-note-edit-thesis')
    thesis.textContent = '我改写过的结论句'
    fireEvent.blur(thesis)

    expect(useStore.getState().demoNoteOverrides.guide?.thesis).toBe('我改写过的结论句')
    expect(patchState).toHaveBeenCalledWith({
      demoNoteOverrides: { guide: { thesis: '我改写过的结论句' } },
    })
    expect(panel).toHaveTextContent('我改写过的结论句')
  })

  it('清空内容等于回退默认，不留下空白段', () => {
    const { panel } = renderGuide()
    fireEvent.doubleClick(panel)

    const thesis = screen.getByTestId('demo-note-edit-thesis')
    thesis.textContent = '   '
    fireEvent.blur(thesis)

    expect(useStore.getState().demoNoteOverrides.guide).toBeUndefined()
    expect(panel).toHaveTextContent(DEMO_NOTES['guide'].thesis)
  })

  it('已有的改写会在打开时直接渲染', () => {
    useStore.setState({ demoNoteOverrides: { guide: { thesis: '上次改的' } } })
    const { panel } = renderGuide()
    expect(panel).toHaveTextContent('上次改的')
    expect(screen.getByTestId('demo-note-edit-thesis')).toHaveTextContent('上次改的')
  })

  it('「恢复默认」清掉该条目的全部改写', () => {
    useStore.setState({ demoNoteOverrides: { guide: { thesis: 'X', 's0.p0': 'Y' } } })
    const { panel } = renderGuide()
    fireEvent.doubleClick(panel)
    fireEvent.click(screen.getByTestId('demo-note-reset'))

    expect(useStore.getState().demoNoteOverrides.guide).toBeUndefined()
    expect(panel).toHaveTextContent(DEMO_NOTES['guide'].thesis)
  })

  it('编辑态按 Esc 只退出编辑，不关闭弹层', () => {
    const { panel, onClose } = renderGuide()
    fireEvent.doubleClick(panel)
    expect(screen.getByTestId('demo-note-edit-hint')).toBeInTheDocument()

    fireEvent.keyDown(window, { key: 'Escape' })

    expect(onClose).not.toHaveBeenCalled()
    expect(screen.queryByTestId('demo-note-edit-hint')).toBeNull()
  })
})

describe('DemoInfoButton', () => {
  it('aria-pressed 反映当前是否展开', () => {
    const onClick = vi.fn()
    const { rerender } = render(
      <DemoInfoButton testId="demo-info-x" active={false} onClick={onClick} />
    )
    const btn = screen.getByTestId('demo-info-x')
    expect(btn).toHaveAttribute('aria-pressed', 'false')
    expect(btn).toHaveTextContent('i')
    fireEvent.click(btn)
    expect(onClick).toHaveBeenCalled()

    rerender(<DemoInfoButton testId="demo-info-x" active onClick={onClick} />)
    expect(screen.getByTestId('demo-info-x')).toHaveAttribute('aria-pressed', 'true')
  })
})
