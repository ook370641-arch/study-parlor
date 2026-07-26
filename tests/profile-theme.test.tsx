import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

vi.mock('@/lib/ipc', () => ({
  ipc: { patchState: vi.fn().mockResolvedValue(undefined) },
}))

import { useStore } from '@/store'
import { Profile } from '@/pages/Profile'

beforeEach(() => {
  cleanup()
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
    render(<Profile />)
    expect(screen.getByTestId('profile-page')).toBeInTheDocument()
  })

  it('renders theme toggle button', () => {
    render(<Profile />)
    expect(screen.getByTestId('study-controls-theme-toggle')).toBeInTheDocument()
  })

  it('renders surface background in academic mode', () => {
    render(<Profile />)
    expect(screen.getByTestId('surface-background')).toBeInTheDocument()
  })

  it('shows surface background in newspaper mode on Profile (Home surface)', () => {
    useStore.setState({ briefingTheme: 'newspaper' })
    render(<Profile />)
    expect(screen.getByTestId('surface-background')).toBeInTheDocument()
  })

  it('renders profile name in academic mode', () => {
    render(<Profile />)
    expect(screen.getByTestId('profile-name-display')).toHaveTextContent('测试')
  })

  it('renders edit button', () => {
    render(<Profile />)
    expect(screen.getByTestId('profile-edit-button')).toBeInTheDocument()
  })
})
