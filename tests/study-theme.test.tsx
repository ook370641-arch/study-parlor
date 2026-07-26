import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

vi.mock('@/lib/ipc', () => ({
  ipc: {
    patchState: vi.fn().mockResolvedValue(undefined),
    getState: vi.fn(),
    llmAbort: vi.fn().mockResolvedValue(undefined),
    onLlmError: vi.fn().mockReturnValue(() => {}),
    onLlmChunk: vi.fn().mockReturnValue(() => {}),
    onLlmDone: vi.fn().mockReturnValue(() => {}),
    scanLibrary: vi.fn().mockResolvedValue([]),
    loadGroups: vi.fn().mockResolvedValue({ groups: [], mapping: {} }),
    loadSessions: vi.fn().mockResolvedValue([]),
    llmWildcardInspiration: vi.fn(),
    searchPrepare: vi.fn(),
    writingScanTree: vi.fn().mockResolvedValue({ ok: true, value: { writing: [], repository: [] } }),
    articleAssistantReadSession: vi.fn().mockResolvedValue(null),
    annotationsRead: vi.fn().mockResolvedValue([]),
    saveSession: vi.fn().mockResolvedValue(undefined),
    deleteSession: vi.fn().mockResolvedValue(undefined),
    llmStart: vi.fn().mockResolvedValue(undefined),
  },
}))

vi.mock('@/lib/paintings', () => ({
  manifest: [{ id: 'test', painter: 'Mark Rothko', title: 'Test', url: '/test.jpg' }],
  pickRandom: vi.fn((manifest: unknown[]) => manifest[0] ?? null),
  formatAttribution: vi.fn(() => ''),
  preloadPaintings: vi.fn(),
}))

vi.mock('@/lib/session-runtime', () => ({
  attachSessionListeners: vi.fn(),
  kickoffSession: vi.fn().mockResolvedValue(undefined),
  sendOrInterrupt: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/finalize', () => ({
  finalizeAndReturnHome: vi.fn().mockResolvedValue(undefined),
}))

import { useStore } from '@/store'
import { Study } from '@/pages/Study'

beforeEach(() => {
  cleanup()
  useStore.setState({
    briefingTheme: 'academic',
    session: {
      abortId: 'test-session',
      topic: '测试话题',
      mode: 'progress' as const,
      difficulty: 'mid' as const,
      temperature: 0.7,
      history: [
        { role: 'user' as const, content: '什么是先验？' },
        { role: 'assistant' as const, content: '先验指不依赖于经验的知识...' },
      ],
      streaming: false,
      dirName: undefined,
      archivePending: false,
    },
    currentPaintings: {
      study: { id: 's', url: '/test.jpg', painter: 'Mark Rothko' as const, title: 'Study' },
      home: { id: 'h', url: '/test.jpg', painter: 'Mark Rothko' as const, title: 'Home' },
      cover: { id: 'c', url: '/test.jpg', painter: 'Mark Rothko' as const, title: 'Cover' },
      briefing: { id: 'b', url: '/test.jpg', painter: 'Mark Rothko' as const, title: 'Briefing' },
    },
    externalMaterials: null,
    isExternalSummaryOpen: false,
    terminology: {},
  })
})

describe('Study page theme switching', () => {
  it('renders academic theme by default', () => {
    render(<Study />)
    expect(screen.getByTestId('study-page')).toBeInTheDocument()
    // SurfaceBackground should be present in academic mode
    expect(screen.getByTestId('surface-background')).toBeInTheDocument()
  })

  it('hides SurfaceBackground in newspaper theme', () => {
    useStore.setState({ briefingTheme: 'newspaper' })
    render(<Study />)
    expect(screen.queryByTestId('surface-background')).not.toBeInTheDocument()
  })

  it('renders theme toggle button in header', () => {
    render(<Study />)
    expect(screen.getByTestId('study-controls-theme-toggle')).toBeInTheDocument()
  })

  it('renders chat messages', () => {
    render(<Study />)
    expect(screen.getByTestId('user-message')).toBeInTheDocument()
    expect(screen.getByTestId('assistant-message')).toBeInTheDocument()
  })
})
