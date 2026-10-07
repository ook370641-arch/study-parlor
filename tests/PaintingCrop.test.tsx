// tests/PaintingCrop.test.tsx
// 封面裁剪：入口显隐 → 面板开合（按钮/Esc/点外部）→ 拖拽联动 store → 松手落盘 → 重置 → 失败提示。
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react'

const mockIpc = {
  paintingsCanEdit: vi.fn(() => Promise.resolve(true)),
  paintingsSetFocus: vi.fn(() => Promise.resolve({ ok: true as const })),
}
vi.mock('@/lib/ipc', () => ({ ipc: new Proxy({}, { get: (_, k) => mockIpc[k as keyof typeof mockIpc] ?? (() => Promise.resolve()) }) }))

import { PaintingCropButton } from '@/components/PaintingCropButton'
import { useStore } from '@/store'

const PAINTING = { id: 'p1', painter: '莫奈', title: '睡莲', url: 'paintings/x.jpg', focus: '50% 50%' }

function seed(editable = true) {
  useStore.setState({
    paintingsEditable: editable,
    currentPaintings: { cover: { ...PAINTING }, home: null, study: null, briefing: null },
  })
}

// jsdom 无布局与图片解码：mock 原图尺寸 + 舞台尺寸
beforeAll(() => {
  Object.defineProperty(HTMLImageElement.prototype, 'naturalWidth', { configurable: true, get() { return 2000 } })
  Object.defineProperty(HTMLImageElement.prototype, 'naturalHeight', { configurable: true, get() { return 1000 } })
})

beforeEach(() => {
  vi.clearAllMocks()
  seed()
})

afterEach(() => {
  cleanup()
})

// jsdom 视口默认 1024x768：k=max(0.512,0.768)=0.768 → cw=1333.3, ch=1000
// 舞台 320x160：s=0.16 → rangeX=(2000-1333.3)*0.16≈106.67，rangeY=0
async function openPanelWithGeo() {
  render(<PaintingCropButton />)
  fireEvent.click(screen.getByTestId('cover-crop-button'))
  const stage = screen.getByTestId('cover-crop-stage')
  Object.defineProperty(stage, 'clientWidth', { configurable: true, value: 320 })
  Object.defineProperty(stage, 'clientHeight', { configurable: true, value: 160 })
  fireEvent.load(stage.querySelector('img')!)
  await act(async () => { fireEvent(window, new Event('resize')) })
  return screen.getByTestId('cover-crop-rect')
}

describe('封面画作裁剪', () => {
  it('paintingsEditable=false 或无画作时不渲染入口', () => {
    seed(false)
    const { unmount } = render(<PaintingCropButton />)
    expect(screen.queryByTestId('cover-crop-button')).toBeNull()
    unmount()
    useStore.setState({ currentPaintings: { cover: null, home: null, study: null, briefing: null } })
    render(<PaintingCropButton />)
    expect(screen.queryByTestId('cover-crop-button')).toBeNull()
  })

  it('按钮开合面板，Esc 与点击外部关闭', async () => {
    render(<PaintingCropButton />)
    expect(screen.queryByTestId('cover-crop-panel')).toBeNull()
    fireEvent.click(screen.getByTestId('cover-crop-button'))
    expect(screen.getByTestId('cover-crop-panel')).toBeTruthy()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByTestId('cover-crop-panel')).toBeNull()
    fireEvent.click(screen.getByTestId('cover-crop-button'))
    fireEvent.click(screen.getByTestId('cover-crop-overlay'))
    expect(screen.queryByTestId('cover-crop-panel')).toBeNull()
  })

  it('拖拽裁剪框实时更新 store 焦点，松手写回 index.json', async () => {
    const rect = await openPanelWithGeo()
    expect(screen.getByTestId('cover-crop-readout').textContent).toContain('50% 50%')

    fireEvent.pointerDown(rect, { clientX: 50, clientY: 50 })
    fireEvent.pointerMove(window, { clientX: 250, clientY: 50 }) // +200 超出 rangeX → clamp 到 100%
    expect(useStore.getState().currentPaintings.cover?.focus).toBe('100% 50%')
    expect(screen.getByTestId('cover-crop-readout').textContent).toContain('100% 50%')
    expect(mockIpc.paintingsSetFocus).not.toHaveBeenCalled() // 拖动中不落盘

    await act(async () => { fireEvent.pointerUp(window) })
    expect(mockIpc.paintingsSetFocus).toHaveBeenCalledWith({ id: 'p1', focus: '100% 50%' })
  })

  it('重置恢复面板打开时的焦点并落盘', async () => {
    const rect = await openPanelWithGeo()
    fireEvent.pointerDown(rect, { clientX: 50, clientY: 50 })
    fireEvent.pointerMove(window, { clientX: 250, clientY: 50 })
    await act(async () => { fireEvent.pointerUp(window) })
    expect(useStore.getState().currentPaintings.cover?.focus).toBe('100% 50%')

    await act(async () => { fireEvent.click(screen.getByTestId('cover-crop-reset')) })
    expect(useStore.getState().currentPaintings.cover?.focus).toBe('50% 50%')
    expect(mockIpc.paintingsSetFocus).toHaveBeenLastCalledWith({ id: 'p1', focus: '50% 50%' })
  })

  it('保存失败显示错误文案，store 不回滚', async () => {
    mockIpc.paintingsSetFocus.mockResolvedValue({ ok: false, code: 'WRITE_FAILED', message: 'index.json 写入失败' } as never)
    const rect = await openPanelWithGeo()
    fireEvent.pointerDown(rect, { clientX: 50, clientY: 50 })
    fireEvent.pointerMove(window, { clientX: 250, clientY: 50 })
    await act(async () => { fireEvent.pointerUp(window) })
    expect(screen.getByTestId('cover-crop-error').textContent).toContain('index.json 写入失败')
    expect(useStore.getState().currentPaintings.cover?.focus).toBe('100% 50%')
  })
})
