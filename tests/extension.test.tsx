import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { Extension } from '@/pages/Extension'
import { ipc } from '@/lib/ipc'

vi.mock('@/lib/ipc', () => ({
  ipc: {
    getExtensionInfo: vi.fn(),
  }
}))

describe('Extension 页面', () => {
  beforeEach(() => {
    cleanup()
    vi.clearAllMocks()
    vi.mocked(ipc.getExtensionInfo).mockResolvedValue({ libraryPath: 'x', paintingCount: 0 })
  })

  it('报纸主题：页面根铺纸白背景', async () => {
    const { useStore } = await import('@/store')
    useStore.setState({ briefingTheme: 'newspaper' })
    render(<Extension />)
    expect(screen.getByTestId('extension-page').className).toContain('bg-[#f5f2ed]')
    expect(screen.queryByTestId('study-controls-swap-painting')).not.toBeInTheDocument()
    useStore.setState({ briefingTheme: 'academic' })
  })
})
