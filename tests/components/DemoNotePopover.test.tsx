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

  it('打开书籍来源说明：渲染标题、结论句、定位段与「技术取舍」小节', () => {
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
    // 给第一次看这个应用的人定位：「你现在看到的是什么」
    expect(panel).toHaveTextContent('你现在看到的是什么')
    expect(panel).toHaveTextContent(DEMO_NOTES['book-source'].context!)
    expect(panel).toHaveTextContent('场景与问题')
    expect(panel).toHaveTextContent('技术取舍')
  })

  it('五个入口都写给第一次看的人：有定位段、场景段与指标', () => {
    for (const note of Object.values(DEMO_NOTES)) {
      expect(note.context?.trim().length ?? 0).toBeGreaterThan(0)
      const headings = note.sections.map((s) => s.heading)
      expect(headings).toContain('场景与问题')
      expect(note.metrics?.length ?? 0).toBeGreaterThan(0)
    }
  })

  it('有工作流链路的入口渲染编号步骤，且步骤数不超过 6', () => {
    const ref = createRef<HTMLSpanElement>()
    render(
      <>
        <span ref={ref} />
        <DemoNotePopover noteId="external-materials" anchorRef={ref} onClose={() => {}} />
      </>
    )
    const panel = screen.getByTestId('demo-note-popover-external-materials')
    expect(panel).toHaveTextContent('它怎么跑')
    const steps = DEMO_NOTES['external-materials'].steps!
    expect(steps.length).toBeGreaterThan(0)
    expect(steps.length).toBeLessThanOrEqual(6)
    for (const step of steps) expect(panel).toHaveTextContent(step.title)
  })

  it('指标区按「名称 + 口径」成对渲染', () => {
    const ref = createRef<HTMLSpanElement>()
    render(
      <>
        <span ref={ref} />
        <DemoNotePopover noteId="review" anchorRef={ref} onClose={() => {}} />
      </>
    )
    const panel = screen.getByTestId('demo-note-popover-review')
    expect(panel).toHaveTextContent('怎么判断有没有价值')
    for (const metric of DEMO_NOTES.review.metrics!) {
      expect(panel).toHaveTextContent(metric.label)
      expect(panel).toHaveTextContent(metric.detail)
    }
  })

  it('每个入口都自带边界与追问，避免只讲优点', () => {
    for (const id of Object.keys(DEMO_NOTES) as Array<keyof typeof DEMO_NOTES>) {
      const headings = DEMO_NOTES[id].sections.map((s) => s.heading).join('|')
      const haystack = headings + (DEMO_NOTES[id].qa ?? []).map((q) => q.q).join('|')
      expect(haystack).toMatch(/边界|取舍|代价/)
    }
  })

  it('渲染到 body 下，脱离父级 transform/overflow 裁剪', () => {
    const ref = createRef<HTMLSpanElement>()
    render(
      <div data-testid="clip-container" style={{ transform: 'translateZ(0)', overflow: 'hidden' }}>
        <span ref={ref} />
        <DemoNotePopover noteId="book-source" anchorRef={ref} onClose={() => {}} />
      </div>
    )
    const panel = screen.getByTestId('demo-note-popover-book-source')
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

describe('DemoNotePopover 字号与尺寸调节', () => {
  beforeEach(() => {
    useStore.setState({ demoNoteFontSize: 'base' })
  })

  function renderOpen(noteId: keyof typeof DEMO_NOTES = 'book-source') {
    const ref = createRef<HTMLSpanElement>()
    render(
      <>
        <span ref={ref} />
        <DemoNotePopover noteId={noteId} anchorRef={ref} onClose={() => {}} />
      </>
    )
    return screen.getByTestId(`demo-note-popover-${noteId}`)
  }

  it('头部有字号 −/+ 按钮：点击升档并写入 state.json', () => {
    const panel = renderOpen()
    const zoomWrap = panel.firstElementChild as HTMLElement
    expect(zoomWrap.style.zoom).toBe('1')
    fireEvent.click(screen.getByTestId('demo-note-font-inc'))
    expect(useStore.getState().demoNoteFontSize).toBe('lg')
    expect(patchState).toHaveBeenCalledWith({ demoNoteFontSize: 'lg' })
  })

  it('最小档禁用 −，最大档禁用 ＋', () => {
    renderOpen()
    fireEvent.click(screen.getByTestId('demo-note-font-dec'))
    expect(useStore.getState().demoNoteFontSize).toBe('sm')
    expect((screen.getByTestId('demo-note-font-dec') as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByTestId('demo-note-font-inc'))
    fireEvent.click(screen.getByTestId('demo-note-font-inc'))
    expect(useStore.getState().demoNoteFontSize).toBe('lg')
    expect((screen.getByTestId('demo-note-font-inc') as HTMLButtonElement).disabled).toBe(true)
  })

  it('渲染右缘 / 下缘 / 右下角三个拖拽手柄', () => {
    renderOpen()
    expect(screen.getByTestId('demo-note-resize-e')).toBeTruthy()
    expect(screen.getByTestId('demo-note-resize-s')).toBeTruthy()
    expect(screen.getByTestId('demo-note-resize-se')).toBeTruthy()
  })

  it('拖右下角同时改宽高，松手后写入面板 style', () => {
    const panel = renderOpen()
    const handle = screen.getByTestId('demo-note-resize-se')
    fireEvent.pointerDown(handle, { pointerId: 1, clientX: 800, clientY: 600 })
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 980, clientY: 760 })
    fireEvent.pointerUp(handle, { pointerId: 1, clientX: 980, clientY: 760 })
    expect(panel.style.width).toBe('640px') // 460 + Δ180
    // jsdom 里起始高为 0，被最小高度夹到 220
    expect(panel.style.height).toBe('220px')
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
