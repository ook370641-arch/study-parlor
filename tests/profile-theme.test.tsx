import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'

vi.mock('@/lib/ipc', () => ({
  ipc: {
    getConfig: vi.fn(),
    searchCheckConfig: vi.fn(),
    llmConfigList: vi.fn(),
    patchState: vi.fn().mockResolvedValue(undefined),
  },
}))

import { useStore } from '@/store'
import { Settings } from '@/pages/Settings'
import { ipc } from '@/lib/ipc'

function renderProfile() {
  render(<Settings />)
  fireEvent.click(screen.getByTestId('settings-primary-profile'))
}

beforeEach(() => {
  cleanup()
  vi.mocked(ipc.getConfig).mockResolvedValue({
    apiKey: 'sk-kimi-test', baseUrl: 'https://api.kimi.com/coding/v1',
    model: 'kimi-k3', libraryPath: 'C:/test-library'
  })
  vi.mocked(ipc.searchCheckConfig).mockResolvedValue({ configured: false })
  vi.mocked(ipc.llmConfigList).mockResolvedValue({ configs: [], activeId: '' })
  useStore.setState({
    briefingTheme: 'academic',
    profile: { name: '测试', profile_text: '一个求知者', preferred_topics: ['哲学', '认知科学'] },
    lastUsed: { difficulty: 'mid' as const, temperature: 0.7 },
    currentPaintings: {
      home: { id: 'test', url: '/test.jpg', painter: 'Mark Rothko' as const, title: 'Test' },
      study: { id: 'test', url: '/test.jpg', painter: 'Mark Rothko' as const, title: 'Test' },
      cover: { id: 'test', url: '/test.jpg', painter: 'Mark Rothko' as const, title: 'Test' },
      briefing: { id: 'test', url: '/test.jpg', painter: 'Mark Rothko' as const, title: 'Test' },
    },
    groups: [],
    library: [],
    terminology: {},
  })
})

describe('Profile theme', () => {
  it('renders profile page in viewing mode', () => {
    renderProfile()
    expect(screen.getByTestId('profile-page')).toBeInTheDocument()
    expect(screen.getByTestId('settings-profile-global-note')).toHaveTextContent('卷宗将供应用内所有 AI 生成参考。')
  })

  it('renders theme toggle button', () => {
    renderProfile()
    expect(screen.getByTestId('study-controls-theme-toggle')).toBeInTheDocument()
  })

  it('renders surface background in academic mode', () => {
    renderProfile()
    expect(screen.getByTestId('surface-background')).toBeInTheDocument()
  })

  it('hides surface background in newspaper mode on Profile', () => {
    useStore.setState({ briefingTheme: 'newspaper' })
    renderProfile()
    expect(screen.queryByTestId('surface-background')).not.toBeInTheDocument()
  })

  it('renders profile name in academic mode', () => {
    renderProfile()
    expect(screen.getByTestId('profile-name-display')).toHaveTextContent('测试')
  })

  it('renders edit button', () => {
    renderProfile()
    expect(screen.getByTestId('profile-edit-button')).toBeInTheDocument()
  })
})
