// 封面迭代记事板 —— src/pages/Cover.tsx + store.setCoverNotepad
// 链路：铅笔按钮开合面板 → textarea 受控于 store.coverNotepad →
// 输入防抖 300ms 经 ipc.patchState 落盘 state.json。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react'

const mockIpc = {
  patchState: vi.fn(() => Promise.resolve()),
}
vi.mock('@/lib/ipc', () => ({ ipc: new Proxy({}, { get: (_, k) => mockIpc[k as keyof typeof mockIpc] ?? (() => Promise.resolve()) }) }))

// 隔离封面其他 Chrome（画作层/换画/删除/语录），只测记事板
vi.mock('@/components/SurfaceBackground', () => ({ SurfaceBackground: () => null }))
vi.mock('@/components/SwapPaintingButton', () => ({ SwapPaintingButton: () => null }))
vi.mock('@/components/DeletePaintingButton', () => ({ DeletePaintingButton: () => null }))
vi.mock('@/components/Quote', () => ({ Quote: () => null }))

import { Cover } from '@/pages/Cover'
import { useStore } from '@/store'

beforeEach(() => {
  useStore.setState({ coverNotepad: '', profile: { name: '测试者', profile_text: '', preferred_topics: [] } })
  mockIpc.patchState.mockClear()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('封面迭代记事板', () => {
  it('默认收起，点铅笔按钮展开，再点收起', () => {
    render(<Cover />)
    expect(screen.queryByTestId('cover-notepad-textarea')).toBeNull()

    fireEvent.click(screen.getByTestId('cover-notepad-button'))
    expect(screen.getByTestId('cover-notepad-textarea')).toBeTruthy()

    fireEvent.click(screen.getByTestId('cover-notepad-button'))
    expect(screen.queryByTestId('cover-notepad-textarea')).toBeNull()
  })

  it('textarea 回显 store 里已有的记事内容（跨重启恢复）', () => {
    useStore.setState({ coverNotepad: '上次记下的迭代点' })
    render(<Cover />)
    fireEvent.click(screen.getByTestId('cover-notepad-button'))
    expect((screen.getByTestId('cover-notepad-textarea') as HTMLTextAreaElement).value).toBe('上次记下的迭代点')
  })

  it('输入更新 store，并防抖 300ms 后 patchState 落盘', () => {
    vi.useFakeTimers()
    render(<Cover />)
    fireEvent.click(screen.getByTestId('cover-notepad-button'))
    fireEvent.change(screen.getByTestId('cover-notepad-textarea'), { target: { value: '给简报加导出' } })

    expect(useStore.getState().coverNotepad).toBe('给简报加导出')
    expect(mockIpc.patchState).not.toHaveBeenCalled() // 防抖窗口内不落盘

    act(() => { vi.advanceTimersByTime(300) })
    expect(mockIpc.patchState).toHaveBeenCalledTimes(1)
    expect(mockIpc.patchState).toHaveBeenCalledWith({ coverNotepad: '给简报加导出' })
  })

  it('连续输入只落盘最后一次（防抖合并）', () => {
    vi.useFakeTimers()
    render(<Cover />)
    fireEvent.click(screen.getByTestId('cover-notepad-button'))
    const textarea = screen.getByTestId('cover-notepad-textarea')

    fireEvent.change(textarea, { target: { value: '第' } })
    act(() => { vi.advanceTimersByTime(100) })
    fireEvent.change(textarea, { target: { value: '第一' } })
    act(() => { vi.advanceTimersByTime(100) })
    fireEvent.change(textarea, { target: { value: '第一版' } })
    act(() => { vi.advanceTimersByTime(300) })

    expect(mockIpc.patchState).toHaveBeenCalledTimes(1)
    expect(mockIpc.patchState).toHaveBeenCalledWith({ coverNotepad: '第一版' })
  })
})
