import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, act } from '@testing-library/react'

vi.mock('@/lib/ipc', () => ({ ipc: { patchState: vi.fn(), getState: vi.fn() } }))
const mockManifest = vi.hoisted(() => [] as { id: string; painter: string; title: string; url: string; focus?: string }[])
vi.mock('@/lib/paintings', () => ({
  manifest: mockManifest,
  pickRandom: vi.fn(() => null),
  paintingPool: vi.fn((_hidden: string[], pool?: unknown[]) => pool ?? mockManifest),
  preloadPaintings: vi.fn(),
  formatAttribution: vi.fn((p: { painter: string; title: string }) => `${p.painter} · ${p.title}`),
}))

import { useStore } from '@/store'
import { pickRandom } from '@/lib/paintings'
import { SurfaceBackground } from '@/components/SurfaceBackground'
import { SwapPaintingButton } from '@/components/SwapPaintingButton'

const PAINT_A = { id: 'a', painter: 'Mark Rothko', title: 'A', url: 'paintings/a.jpg' }
const PAINT_B = { id: 'b', painter: 'Guy Billout', title: 'B', url: 'paintings/b.jpg' }
const PAINT_FOCUSED = { id: 'c', painter: 'Vermeer', title: 'C', url: 'paintings/c.jpg', focus: '50% 24%' }

function seedPaintings(p: typeof PAINT_A | null) {
  useStore.setState({
    currentPaintings: { cover: null, home: null, study: null, briefing: p },
  })
}

describe('SurfaceBackground weight grammar', () => {
  beforeEach(() => { cleanup(); vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('first mount shows the painting immediately with no swap animation', () => {
    seedPaintings(PAINT_A)
    render(<SurfaceBackground surface="briefing" />)
    const bg = screen.getByTestId('surface-background')
    expect(bg.getAttribute('data-swapping')).toBeNull()
    const img = bg.querySelector('img')!
    expect(img.getAttribute('src')).toBe('paintings/a.jpg')
    expect(img.className).not.toContain('painting-drop-in')
  })

  it('swap: old falls out, new drops in delayed, settles after 850ms', () => {
    seedPaintings(PAINT_A)
    render(<SurfaceBackground surface="briefing" />)
    act(() => { seedPaintings(PAINT_B) })

    const bg = screen.getByTestId('surface-background')
    expect(bg.getAttribute('data-swapping')).toBe('')
    const imgs = bg.querySelectorAll('img')
    expect(imgs.length).toBe(2)
    expect(imgs[0].className).toContain('painting-fall-out')
    expect(imgs[1].className).toContain('painting-drop-in')
    expect(imgs[1].style.animationDelay).toBe('240ms')

    act(() => { vi.advanceTimersByTime(900) })
    expect(bg.getAttribute('data-swapping')).toBeNull()
    const settled = bg.querySelectorAll('img')
    expect(settled.length).toBe(1)
    expect(settled[0].getAttribute('src')).toBe('paintings/b.jpg')
    expect(settled[0].className).not.toContain('painting-drop-in')
  })

  it('renders vignette darkening even when no painting is set (dev HMR resilience)', () => {
    // SurfaceBackground must render the vignette overlay even if currentPaintings
    // is null — otherwise dev-mode timing / HMR reload / Strict Mode remounting
    // can leave the page without darkening, making text unreadable over bright art.
    seedPaintings(null)
    render(<SurfaceBackground surface="briefing" />)
    const bg = screen.getByTestId('surface-background')
    // Should still render with vignette div
    expect(bg.querySelectorAll('img').length).toBe(0)
    const vignetteEl = bg.children[0] as HTMLElement
    expect(vignetteEl.tagName).toBe('DIV')
    expect(vignetteEl.style.background).toContain('radial-gradient')
  })

  it('swap: outgoing image keeps its custom focus (no snap to center)', () => {
    // 回归：裁剪改过焦点的画作被换掉时，坠出的旧图必须保持原 object-position，
    // 否则焦点偏离居中的画会在换画瞬间跳回 50% 50%，表现为画面大幅跳动。
    mockManifest.push(PAINT_FOCUSED)
    seedPaintings(PAINT_FOCUSED)
    render(<SurfaceBackground surface="briefing" />)
    act(() => { seedPaintings(PAINT_B) })

    const outgoing = screen.getByTestId('surface-background').querySelector('img.painting-fall-out')! as HTMLImageElement
    expect(outgoing.getAttribute('src')).toBe('paintings/c.jpg')
    expect(outgoing.style.objectPosition).toBe('50% 24%')
  })

  it('swap pass-1: 旧图保持自己的焦点，不穿新画焦点（闪帧回归）', async () => {
    // 回归：store 更新后 pass-1 会真实 commit 一帧「src=旧画 + objectPosition=?」，
    // pass-2（坠出/落入）在宏任务后才到。修复前 pass-1 错读新画 B 的焦点，
    // object-cover 裁切下 A 的另一区域闪上一屏（用户感知"混入其他画面"）。
    // 裸 dispatchEvent + 只 drain 微任务，把 DOM 停在 pass-1（act/fireEvent 会冲到 pass-2）。
    const A_F = { id: 'a2', painter: 'A', title: 'A2', url: 'paintings/a2.jpg', focus: '50% 20%' }
    const B_F = { id: 'b2', painter: 'B', title: 'B2', url: 'paintings/b2.jpg', focus: '50% 80%' }
    mockManifest.push(A_F, B_F)
    seedPaintings(A_F)
    render(
      <>
        <SurfaceBackground surface="briefing" />
        <SwapPaintingButton surface="briefing" />
      </>
    )
    vi.mocked(pickRandom).mockReturnValue(B_F as never)

    screen.getByRole('button', { name: '换一幅画' }).dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await null // 微任务 drain 完：pass-1 已 commit、effect 已同步 flush、pass-2 宏任务未跑

    const imgs = screen.getByTestId('surface-background').querySelectorAll('img')
    expect(imgs.length).toBe(1) // 坠出/落入层尚未挂载
    expect(imgs[0].getAttribute('src')).toBe('paintings/a2.jpg')
    expect(imgs[0].style.objectPosition).toBe('50% 20%')

    act(() => { vi.advanceTimersByTime(900) }) // 收尾，清 swap 定时器
  })

  it('裁剪实时预览契约：同 url 焦点变更立即反映到 settled img', () => {
    // 该契约修复前后都应通过——锁定「焦点按显示中的 url 查表」不破坏裁剪联动。
    const A_F = { id: 'a3', painter: 'A', title: 'A3', url: 'paintings/a3.jpg', focus: '50% 50%' }
    mockManifest.push(A_F)
    seedPaintings(A_F)
    render(<SurfaceBackground surface="briefing" />)
    act(() => { useStore.getState().setPaintingFocus('briefing', '50% 66%') })
    const img = screen.getByTestId('surface-background').querySelector('img')!
    expect(img.style.objectPosition).toBe('50% 66%')
  })

  it('CRT grain overlay activates during swap', () => {
    seedPaintings(PAINT_A)
    render(<SurfaceBackground surface="briefing" />)
    act(() => { seedPaintings(PAINT_B) })
    const crt = screen.getByTestId('surface-background').querySelector('.painting-crt')!
    expect(crt.className).toContain('on')
  })
})
