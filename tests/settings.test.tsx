import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup, within } from '@testing-library/react'
import { Settings } from '@/pages/Settings'
import { ipc } from '@/lib/ipc'
import type { LlmConfig } from '@shared/index'

vi.mock('@/lib/ipc', () => ({
  ipc: {
    getConfig: vi.fn(),
    setupProbeKey: vi.fn(),
    setupSelectDirectory: vi.fn(),
    searchCheckConfig: vi.fn(),
    setSearchApiKey: vi.fn(),
    getState: vi.fn().mockResolvedValue({}),
    llmConfigList: vi.fn(),
    llmConfigSetActive: vi.fn(),
    llmConfigSave: vi.fn(),
    configSetLibraryPath: vi.fn(),
  }
}))

const KIMI: LlmConfig = { id: 'cfg-kimi', apiKey: 'sk-kimi-test', baseUrl: 'https://api.kimi.com/coding/v1', model: 'kimi-k3' }
const DS: LlmConfig = { id: 'cfg-ds', apiKey: 'sk-ds-test', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-v4-pro' }

function mockConfigs(configs: LlmConfig[], activeId: string) {
  vi.mocked(ipc.llmConfigList).mockResolvedValue({ configs, activeId })
}

describe('Settings · AI 服务', () => {
  beforeEach(() => {
    cleanup()
    vi.clearAllMocks()
    vi.mocked(ipc.getConfig).mockResolvedValue({
      apiKey: 'sk-kimi-test', baseUrl: 'https://api.kimi.com/coding/v1',
      model: 'kimi-k3', libraryPath: 'C:/test-library'
    })
    vi.mocked(ipc.setupProbeKey).mockResolvedValue({ ok: true })
    vi.mocked(ipc.setupSelectDirectory).mockResolvedValue({ canceled: true, path: null })
    vi.mocked(ipc.searchCheckConfig).mockResolvedValue({ configured: false })
    vi.mocked(ipc.setSearchApiKey).mockResolvedValue(undefined)
    vi.mocked(ipc.configSetLibraryPath).mockResolvedValue({ ok: true })
    mockConfigs([KIMI], 'cfg-kimi')
  })

  it('单配置：维持现状——无切换器，字段回填，有新增入口', async () => {
    render(<Settings />)
    await waitFor(() => expect(screen.getByDisplayValue('sk-kimi-test')).toBeInTheDocument())
    expect(screen.getByDisplayValue('https://api.kimi.com/coding/v1')).toBeInTheDocument()
    expect(screen.getByDisplayValue('kimi-k3')).toBeInTheDocument()
    expect(screen.queryByTestId('settings-llm-config-chip')).not.toBeInTheDocument()
    expect(screen.getByTestId('settings-add-llm-config')).toBeInTheDocument()
    expect(screen.queryByTestId('settings-activate-llm-config')).not.toBeInTheDocument()
  })

  it('新增：草稿区出现且原配置摘要可见可展开，取消后还原', async () => {
    render(<Settings />)
    await waitFor(() => screen.getByDisplayValue('sk-kimi-test'))
    fireEvent.click(screen.getByTestId('settings-add-llm-config'))

    const draft = screen.getByTestId('settings-llm-draft')
    expect(draft).toBeInTheDocument()
    // 原配置摘要钉在上方，数据可见（未丢）
    const summary = screen.getByTestId('settings-llm-current-summary')
    expect(summary).toHaveTextContent('kimi-k3')
    expect(summary).toHaveTextContent('使用中')
    // 草稿字段为空
    expect(within(draft).getByTestId('settings-api-key-input')).toHaveValue('')
    // 取消 → 回到原配置表单
    fireEvent.click(screen.getByTestId('settings-llm-draft-cancel'))
    expect(screen.queryByTestId('settings-llm-draft')).not.toBeInTheDocument()
    expect(screen.getByDisplayValue('sk-kimi-test')).toBeInTheDocument()
  })

  it('草稿保存为新配置：llmConfigSave(null, ...) 且出现切换器', async () => {
    mockConfigs([KIMI], 'cfg-kimi')
    vi.mocked(ipc.llmConfigSave).mockResolvedValue({ ok: true, id: 'cfg-ds' })
    render(<Settings />)
    await waitFor(() => screen.getByDisplayValue('sk-kimi-test'))
    fireEvent.click(screen.getByTestId('settings-add-llm-config'))

    const draft = screen.getByTestId('settings-llm-draft')
    fireEvent.change(within(draft).getByTestId('settings-api-key-input'), { target: { value: 'sk-ds-test' } })
    fireEvent.change(within(draft).getByTestId('settings-base-url-input'), { target: { value: 'https://api.deepseek.com/v1' } })
    fireEvent.change(within(draft).getByTestId('settings-model-input'), { target: { value: 'deepseek-v4-pro' } })
    // 保存后 list 返回两条
    mockConfigs([KIMI, DS], 'cfg-kimi')
    fireEvent.click(screen.getByTestId('settings-llm-draft-save'))

    await waitFor(() => {
      expect(ipc.llmConfigSave).toHaveBeenCalledWith(null, {
        apiKey: 'sk-ds-test', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-v4-pro'
      })
    })
    await waitFor(() => expect(screen.getAllByTestId('settings-llm-config-chip')).toHaveLength(2))
  })

  it('双配置：chip 切换只换编辑对象，不激活；启用按钮出现', async () => {
    mockConfigs([KIMI, DS], 'cfg-kimi')
    render(<Settings />)
    await waitFor(() => screen.getByDisplayValue('sk-kimi-test'))
    const chips = screen.getAllByTestId('settings-llm-config-chip')
    expect(chips[0]).toHaveTextContent('使用中')
    // 点第二个 chip → 表单回填 DS，但未激活
    fireEvent.click(chips[1])
    await waitFor(() => expect(screen.getByDisplayValue('sk-ds-test')).toBeInTheDocument())
    expect(screen.getByDisplayValue('deepseek-v4-pro')).toBeInTheDocument()
    expect(ipc.llmConfigSetActive).not.toHaveBeenCalled()
    // 启用按钮可见可用
    const activateBtn = screen.getByTestId('settings-activate-llm-config')
    expect(activateBtn).toBeEnabled()
    vi.mocked(ipc.llmConfigSetActive).mockResolvedValue({ ok: true })
    fireEvent.click(activateBtn)
    await waitFor(() => expect(ipc.llmConfigSetActive).toHaveBeenCalledWith('cfg-ds'))
  })

  it('启用按钮对空 key 配置禁用', async () => {
    const empty: LlmConfig = { id: 'cfg-e', apiKey: '', baseUrl: 'https://x/v1', model: 'm' }
    mockConfigs([KIMI, empty], 'cfg-kimi')
    render(<Settings />)
    await waitFor(() => screen.getByDisplayValue('sk-kimi-test'))
    fireEvent.click(screen.getAllByTestId('settings-llm-config-chip')[1])
    await waitFor(() => expect(screen.getByTestId('settings-activate-llm-config')).toBeDisabled())
  })

  it('保存激活配置：llmConfigSave(id, ...) 带当前表单值', async () => {
    vi.mocked(ipc.llmConfigSave).mockResolvedValue({ ok: true, id: 'cfg-kimi' })
    render(<Settings />)
    await waitFor(() => screen.getByDisplayValue('sk-kimi-test'))
    const modelInput = screen.getByTestId('settings-model-input')
    fireEvent.change(modelInput, { target: { value: 'kimi-k3.1' } })
    fireEvent.click(screen.getByTestId('settings-ai-save-button'))
    await waitFor(() => {
      expect(ipc.llmConfigSave).toHaveBeenCalledWith('cfg-kimi', {
        apiKey: 'sk-kimi-test', baseUrl: 'https://api.kimi.com/coding/v1', model: 'kimi-k3.1'
      })
    })
  })

  it('key 为空时验证连接禁用；key 显隐切换保持', async () => {
    render(<Settings />)
    await waitFor(() => screen.getByDisplayValue('sk-kimi-test'))
    const keyInput = screen.getByTestId('settings-api-key-input')
    expect(keyInput).toHaveAttribute('type', 'password')
    fireEvent.click(screen.getByTestId('settings-api-key-toggle'))
    expect(keyInput).toHaveAttribute('type', 'text')
    fireEvent.change(keyInput, { target: { value: '' } })
    expect(screen.getByTestId('settings-verify-button')).toBeDisabled()
  })

  it('学习库独立保存走 configSetLibraryPath', async () => {
    render(<Settings />)
    await waitFor(() => screen.getByDisplayValue('C:/test-library'))
    fireEvent.change(screen.getByTestId('settings-library-path-input'), { target: { value: 'D:/new-lib' } })
    fireEvent.click(screen.getByTestId('settings-library-save-button'))
    await waitFor(() => expect(ipc.configSetLibraryPath).toHaveBeenCalledWith('D:/new-lib'))
  })

  it('报纸主题：页面根铺纸白背景', async () => {
    const { useStore } = await import('@/store')
    useStore.setState({ briefingTheme: 'newspaper' })
    render(<Settings />)
    await waitFor(() => screen.getByDisplayValue('sk-kimi-test'))
    expect(screen.getByTestId('settings-page').className).toContain('bg-[#f5f2ed]')
    expect(screen.queryByTestId('study-controls-swap-painting')).not.toBeInTheDocument()
    useStore.setState({ briefingTheme: 'academic' })
  })

  it('启用 IPC 抛错：走 onError 而非 unhandled rejection', async () => {
    mockConfigs([KIMI, DS], 'cfg-kimi')
    vi.mocked(ipc.llmConfigSetActive).mockRejectedValue(new Error('IPC boom'))
    render(<Settings />)
    await waitFor(() => screen.getByDisplayValue('sk-kimi-test'))
    fireEvent.click(screen.getAllByTestId('settings-llm-config-chip')[1])
    await waitFor(() => screen.getByTestId('settings-activate-llm-config'))
    fireEvent.click(screen.getByTestId('settings-activate-llm-config'))
    await waitFor(() => expect(screen.getByTestId('settings-error-display')).toHaveTextContent('IPC boom'))
  })

  it('验证连接 401 映射为「API Key 无效」', async () => {
    vi.mocked(ipc.setupProbeKey).mockRejectedValue(new Error('HTTP 401 UNAUTHORIZED'))
    render(<Settings />)
    await waitFor(() => screen.getByDisplayValue('sk-kimi-test'))
    fireEvent.click(screen.getByTestId('settings-verify-button'))
    await waitFor(() => expect(screen.getByTestId('settings-verify-status')).toHaveTextContent('API Key 无效'))
  })
})
