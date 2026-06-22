import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { Settings } from '@/pages/Settings'
import { ipc } from '@/lib/ipc'

vi.mock('@/lib/ipc', () => ({
  ipc: {
    getConfig: vi.fn(),
    writeConfig: vi.fn(),
    setupProbeKey: vi.fn(),
    setupSelectDirectory: vi.fn(),
    searchCheckConfig: vi.fn(),
    setSearchApiKey: vi.fn()
  }
}))

describe('Settings', () => {
  beforeEach(() => {
    cleanup()
    vi.mocked(ipc.getConfig).mockResolvedValue({
      apiKey: 'sk-kimi-test',
      baseUrl: 'https://api.kimi.com/coding/v1',
      model: 'kimi-k2.6',
      libraryPath: 'C:/test-library'
    })
    vi.mocked(ipc.writeConfig).mockResolvedValue(undefined)
    vi.mocked(ipc.setupProbeKey).mockResolvedValue({ ok: true })
    vi.mocked(ipc.setupSelectDirectory).mockResolvedValue({ canceled: true, path: null })
    vi.mocked(ipc.searchCheckConfig).mockResolvedValue({ configured: false })
    vi.mocked(ipc.setSearchApiKey).mockResolvedValue(undefined)
  })

  it('renders current config values', async () => {
    render(<Settings />)
    await waitFor(() => expect(screen.getByDisplayValue('C:/test-library')).toBeInTheDocument())
    expect(screen.getByDisplayValue('https://api.kimi.com/coding/v1')).toBeInTheDocument()
    expect(screen.getByDisplayValue('kimi-k2.6')).toBeInTheDocument()
  })

  it('toggles API key visibility', async () => {
    render(<Settings />)
    await waitFor(() => expect(screen.getByDisplayValue('sk-kimi-test')).toBeInTheDocument())
    const input = screen.getByDisplayValue('sk-kimi-test')
    expect(input).toHaveAttribute('type', 'password')
    fireEvent.click(screen.getAllByText('显示')[0])
    expect(input).toHaveAttribute('type', 'text')
  })

  it('disables save and verify when API key is empty', async () => {
    render(<Settings />)
    await waitFor(() => expect(screen.getByDisplayValue('sk-kimi-test')).toBeInTheDocument())
    const keyInput = screen.getByDisplayValue('sk-kimi-test')
    fireEvent.change(keyInput, { target: { value: '' } })
    const saveButtons = screen.getAllByRole('button', { name: '保存' })
    expect(saveButtons[saveButtons.length - 1]).toBeDisabled()
    expect(screen.getByRole('button', { name: '验证连接' })).toBeDisabled()
  })

  it('calls writeConfig with form values on save', async () => {
    render(<Settings />)
    await waitFor(() => expect(screen.getByDisplayValue('sk-kimi-test')).toBeInTheDocument())
    const saveButtons = screen.getAllByRole('button', { name: '保存' })
    fireEvent.click(saveButtons[saveButtons.length - 1])
    await waitFor(() => {
      expect(ipc.writeConfig).toHaveBeenCalledWith({
        apiKey: 'sk-kimi-test',
        baseUrl: 'https://api.kimi.com/coding/v1',
        model: 'kimi-k2.6',
        libraryPath: 'C:/test-library'
      })
    })
  })

  it('calls setupProbeKey when verify clicked', async () => {
    render(<Settings />)
    await waitFor(() => expect(screen.getByDisplayValue('sk-kimi-test')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: '验证连接' }))
    await waitFor(() => {
      expect(ipc.setupProbeKey).toHaveBeenCalledWith({
        apiKey: 'sk-kimi-test',
        baseUrl: 'https://api.kimi.com/coding/v1',
        model: 'kimi-k2.6'
      })
    })
  })
})
