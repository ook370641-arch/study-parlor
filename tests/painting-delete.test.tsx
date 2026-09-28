import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'

const { P1, P2, P3 } = vi.hoisted(() => ({
  P1: { id: 'p1', painter: 'Mark Rothko', title: 'One', url: 'paintings/p1.jpg' },
  P2: { id: 'p2', painter: 'Guy Billout', title: 'Two', url: 'paintings/p2.jpg' },
  P3: { id: 'p3', painter: 'Sofia Coppola', title: 'Lost in Translation', url: 'paintings/p3.jpg', year: 2003 },
}))

vi.mock('@/lib/ipc', () => ({ ipc: { patchState: vi.fn(() => Promise.resolve()), getState: vi.fn() } }))
vi.mock('@/lib/paintings', async () => {
  const actual = await vi.importActual('@/lib/paintings') as {
    pickRandom: (pool: unknown[], excludeId: string | null) => unknown
    paintingPool: (hidden: string[], pool?: unknown[]) => unknown[]
  }
  const manifest = [P1, P2, P3]
  return {
    ...actual,
    manifest,
    // 委托真实实现，但默认池换成假 manifest（模块级闭包无法通过覆盖导出改变）
    pickRandom: (pool: unknown[], excludeId: string | null) => actual.pickRandom(pool, excludeId),
    paintingPool: (hidden: string[], pool: unknown[] = manifest) => actual.paintingPool(hidden, pool),
  }
})

import { ipc } from '@/lib/ipc'
import { useStore } from '@/store'
import { paintingPool } from '@/lib/paintings'
import { DeletePaintingButton } from '@/components/DeletePaintingButton'
import { Cover } from '@/pages/Cover'

describe('paintingPool', () => {
  it('returns full manifest when hidden list is empty', () => {
    expect(paintingPool([])).toHaveLength(3)
  })

  it('filters hidden ids; empty pool stays empty', () => {
    expect(paintingPool(['p1', 'p3']).map(p => p.id)).toEqual(['p2'])
    expect(paintingPool(['p1', 'p2', 'p3'])).toEqual([])
  })

  it('tolerates ids no longer in manifest (files removed)', () => {
    expect(paintingPool(['ghost-id', 'p1']).map(p => p.id)).toEqual(['p2', 'p3'])
  })
})

describe('hidePainting', () => {
  beforeEach(() => {
    cleanup()
    vi.clearAllMocks()
    useStore.setState({
      currentPaintings: { cover: P1, home: null, study: null, briefing: null },
      hiddenPaintings: [],
    })
  })

  it('appends current id, persists, and swaps to another painting', async () => {
    await useStore.getState().hidePainting('cover')
    const s = useStore.getState()
    expect(s.hiddenPaintings).toEqual(['p1'])
    expect(ipc.patchState).toHaveBeenCalledWith({ hiddenPaintings: ['p1'] })
    expect(s.currentPaintings.cover?.id).not.toBe('p1')
    expect(s.currentPaintings.cover?.id).toMatch(/p2|p3/)
  })

  it('dedupes when hiding an already-hidden id', async () => {
    useStore.setState({ hiddenPaintings: ['p1'] })
    await useStore.getState().hidePainting('cover')
    expect(useStore.getState().hiddenPaintings).toEqual(['p1'])
  })

  it('is a no-op when the surface has no painting', async () => {
    await useStore.getState().hidePainting('home')
    expect(useStore.getState().hiddenPaintings).toEqual([])
    expect(ipc.patchState).not.toHaveBeenCalled()
  })

  it('swapPainting never picks hidden paintings', () => {
    useStore.setState({ currentPaintings: { cover: P2, home: null, study: null, briefing: null }, hiddenPaintings: ['p1', 'p3'] })
    useStore.getState().swapPainting('cover')
    // 池中只剩 p1 已隐藏、p3 已隐藏、p2 被 exclude → 无可换，保持 p2
    expect(useStore.getState().currentPaintings.cover?.id).toBe('p2')
  })
})

describe('DeletePaintingButton', () => {
  beforeEach(() => {
    cleanup()
    useStore.setState({ currentPaintings: { cover: P1, home: null, study: null, briefing: null }, hiddenPaintings: [] })
  })

  it('click hides the current painting', async () => {
    render(<DeletePaintingButton surface="cover" />)
    fireEvent.click(screen.getByTestId('painting-delete-button'))
    await waitFor(() => expect(useStore.getState().hiddenPaintings).toEqual(['p1']))
  })

  it('is disabled when nothing is showing', () => {
    useStore.setState({ currentPaintings: { cover: null, home: null, study: null, briefing: null } })
    render(<DeletePaintingButton surface="cover" />)
    expect(screen.getByTestId('painting-delete-button')).toBeDisabled()
  })
})

describe('Cover 删除按钮门控', () => {
  beforeEach(() => {
    cleanup()
    useStore.setState({ currentPaintings: { cover: P1, home: null, study: null, briefing: null }, hiddenPaintings: [] })
  })

  it('paintingDeleteEnabled=true 时按钮出现', () => {
    useStore.setState({ paintingDeleteEnabled: true })
    render(<Cover />)
    expect(screen.getByTestId('painting-delete-button')).toBeInTheDocument()
  })

  it('paintingDeleteEnabled=false 时按钮不出现', () => {
    useStore.setState({ paintingDeleteEnabled: false })
    render(<Cover />)
    expect(screen.queryByTestId('painting-delete-button')).toBeNull()
  })
})
