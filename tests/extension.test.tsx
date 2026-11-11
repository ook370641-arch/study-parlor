import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { Settings } from '@/pages/Settings'
import { ipc } from '@/lib/ipc'

vi.mock('@/lib/ipc', () => ({
  ipc: {
    getConfig: vi.fn(),
    searchCheckConfig: vi.fn(),
    llmConfigList: vi.fn(),
    getExtensionInfo: vi.fn(),
  }
}))

function renderExtension() {
  render(<Settings />)
  fireEvent.click(screen.getByTestId('settings-primary-extension'))
}

describe('Extension 页面', () => {
  beforeEach(() => {
    cleanup()
    vi.clearAllMocks()
    vi.mocked(ipc.getConfig).mockResolvedValue({
      apiKey: 'sk-kimi-test', baseUrl: 'https://api.kimi.com/coding/v1',
      model: 'kimi-k3', libraryPath: 'C:/test-library'
    })
    vi.mocked(ipc.searchCheckConfig).mockResolvedValue({ configured: false })
    vi.mocked(ipc.llmConfigList).mockResolvedValue({ configs: [], activeId: '' })
    vi.mocked(ipc.getExtensionInfo).mockResolvedValue({ libraryPath: 'x', paintingCount: 0 })
  })

  it('报纸主题：页面根铺纸白背景', async () => {
    const { useStore } = await import('@/store')
    useStore.setState({ briefingTheme: 'newspaper' })
    renderExtension()
    expect(screen.getByTestId('settings-page').className).toContain('bg-[#f5f2ed]')
    expect(screen.queryByTestId('study-controls-swap-painting')).not.toBeInTheDocument()
    useStore.setState({ briefingTheme: 'academic' })
  })

  it('在设置中保留术语、配图和本地 Agent 子页', () => {
    renderExtension()
    expect(screen.getByTestId('terminology-panel')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('settings-extension-agent'))
    expect(screen.getByTestId('extension-local-agent-card')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('settings-extension-paintings'))
    expect(screen.getByTestId('extension-custom-pictures-card')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('settings-extension-terminology'))
    expect(screen.getByTestId('terminology-panel')).toBeInTheDocument()
  })
})
