import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor, act } from '@testing-library/react'

vi.mock('@/lib/ipc', () => ({
  ipc: {
    patchState: vi.fn(),
    getState: vi.fn(),
    scanLibrary: vi.fn(),
    loadGroups: vi.fn(),
    loadSessions: vi.fn(),
    llmWildcardInspiration: vi.fn(),
    briefingGenerate: vi.fn(),
    onBriefingProgress: vi.fn(() => () => {}),
    briefingList: vi.fn().mockResolvedValue([]),
    searchPrepare: vi.fn(),
    writingScanTree: vi.fn().mockResolvedValue({ ok: true, value: [] }),
    articleAssistantReadSession: vi.fn().mockResolvedValue(null),
    annotationsRead: vi.fn().mockResolvedValue([]),
    collectionRead: vi.fn().mockResolvedValue({ entries: [] }),
  }
}))

vi.mock('@/lib/paintings', () => ({
  manifest: [{ id: 'test', painter: 'Test', title: 'Test', url: '/test.jpg' }],
  pickRandom: vi.fn((manifest: unknown[]) => manifest[0] ?? null),
  formatAttribution: vi.fn((p: unknown) => (p as { painter?: string })?.painter ?? ''),
}))

import { useStore } from '@/store'
import { Briefing } from '@/pages/Briefing'
import { BRIEFING_LIST_STYLES, BRIEFING_QUOTE_SIZES } from '@/lib/briefing-font-size'
import { formatBriefingDate } from '@/lib/format-briefing-date'

describe('Briefing date column', () => {
  beforeEach(() => {
    cleanup()
    useStore.setState({
      briefing: { result: null, loading: false, error: null },
      briefingSource: 'digest',
      briefingTheme: 'academic',
      briefingHistory: { list: [], loading: false, error: null },
      currentPaintings: {
        briefing: null,
        cover: null,
        home: null,
        study: null,
      },
    })
  })

  it('shows the date column in the digest empty state', () => {
    render(<Briefing />)
    expect(screen.getByTestId('briefing-date-column')).toBeInTheDocument()
  })

  it('does not show the digest date column when source is anthropic', () => {
    useStore.setState({ briefingSource: 'anthropic' })
    render(<Briefing />)
    expect(screen.queryByTestId('briefing-date-column')).not.toBeInTheDocument()
  })

  it('calls generateBriefing when selecting a past date', async () => {
    useStore.setState({
      briefingHistory: {
        list: [{ date: '2026-07-01', filePath: '/test/2026-07-01.md' }],
        loading: false,
        error: null,
      },
    })
    const generate = vi.fn().mockResolvedValue(undefined)
    useStore.setState({ generateBriefing: generate })
    render(<Briefing />)
    fireEvent.click(screen.getByTestId('briefing-date-item-2026-07-01'))
    await waitFor(() => expect(generate).toHaveBeenCalledWith('2026-07-01'))
  })

  it('clicking today in date column only views (viewBriefingToday), never generates', async () => {
    const today = formatBriefingDate(new Date())
    const viewToday = vi.fn().mockResolvedValue(undefined)
    const generate = vi.fn()
    useStore.setState({ viewBriefingToday: viewToday, generateBriefing: generate })
    render(<Briefing />)
    fireEvent.click(screen.getByTestId(`briefing-date-item-${today}`))
    await waitFor(() => expect(viewToday).toHaveBeenCalledTimes(1))
    expect(generate).not.toHaveBeenCalled()
  })
})

describe('Briefing collection view', () => {
  beforeEach(() => {
    cleanup()
    useStore.setState({
      briefing: {
        result: {
          title: '夜航简报',
          date: '2026-07-25',
          content: '## A\n正文',
          sources: [],
          filePath: '/x/briefing.md',
          cached: false,
          generatedAt: new Date().toISOString(),
          sourceStatus: { x: 'ok', podcasts: 'ok', blogs: 'ok' },
        },
        loading: false,
        error: null,
      },
      briefingSource: 'digest',
      briefingTheme: 'academic',
      briefingHistory: { list: [], loading: false, error: null },
      collection: { entries: [], loaded: true },
      collectionViewOpen: false,
      assistantSession: null,
      currentPaintings: { briefing: null, cover: null, home: null, study: null },
    })
  })

  it('打开精选集时导读面板不挂载，回到日期视图恢复', async () => {
    render(<Briefing />)
    await waitFor(() => expect(screen.getByTestId('article-assistant-panel')).toBeInTheDocument())
    act(() => { useStore.setState({ collectionViewOpen: true }) })
    expect(screen.getByTestId('collection-view')).toBeInTheDocument()
    expect(screen.queryByTestId('article-assistant-panel')).not.toBeInTheDocument()
    act(() => { useStore.setState({ collectionViewOpen: false }) })
    await waitFor(() => expect(screen.getByTestId('article-assistant-panel')).toBeInTheDocument())
  })
})

describe('Briefing source switching', () => {
  beforeEach(() => {
    cleanup()
    useStore.setState({
      briefing: { result: null, loading: false, error: null },
      briefingSource: 'anthropic',
      briefingTheme: 'academic',
      briefingHistory: { list: [], loading: false, error: null },
      jobBriefing: { result: null, loading: false, error: null },
      jobBriefingHistory: { list: [], loading: false, error: null },
      currentPaintings: {
        briefing: null,
        cover: null,
        home: null,
        study: null,
      },
    })
  })

  // Regression: readDates previously called useStore() inside the per-source
  // conditional JSX, so entering/leaving digest/job changed the hook count and
  // React threw "Rendered more hooks than during the previous render".
  it('switches between sources without hook-count crash', () => {
    render(<Briefing />)
    act(() => { useStore.setState({ briefingSource: 'digest' }) })
    expect(screen.getByTestId('briefing-date-column')).toBeInTheDocument()
    act(() => { useStore.setState({ briefingSource: 'writing' }) })
    expect(screen.queryByTestId('briefing-date-column')).not.toBeInTheDocument()
    act(() => { useStore.setState({ briefingSource: 'job-briefing' }) })
    expect(screen.getByTestId('briefing-date-column')).toBeInTheDocument()
    act(() => { useStore.setState({ briefingSource: 'anthropic' }) })
    expect(screen.queryByTestId('briefing-date-column')).not.toBeInTheDocument()
  })
})

describe('Briefing global chrome', () => {
  beforeEach(() => {
    cleanup()
    useStore.setState({
      briefing: { result: null, loading: false, error: null },
      briefingSource: 'anthropic',
      briefingTheme: 'academic',
      briefingHistory: { list: [], loading: false, error: null },
      currentPaintings: {
        briefing: { id: 'test', painter: 'Test', title: 'Test', url: '/test.jpg' },
        cover: null,
        home: null,
        study: null,
      },
    })
  })

  it('renders surface background with blog-internal swap button for anthropic source', () => {
    render(<Briefing />)
    expect(screen.getByTestId('surface-background')).toBeInTheDocument()
    // 博客源的换画+字号按钮在 AnthropicBlogPanel 内部，不在页面级 fixed 控件区。
    expect(screen.queryByTestId('briefing-swap-painting-button')).not.toBeInTheDocument()
    expect(screen.getByTestId('anthropic-swap-painting-button')).toBeInTheDocument()
  })

  it('renders swap button inside job reading pane (shifts with assistant panel)', () => {
    useStore.setState({
      briefingSource: 'job-briefing',
      jobBriefing: {
        result: {
          title: '求职简报',
          date: '2026-07-26',
          content: '## 今日新动态\n测试内容',
          sources: [],
          filePath: '/x/job-briefing.md',
          cached: false,
          generatedAt: new Date().toISOString(),
          sourceStatus: { official: 'ok', events: 'ok', jobs: 'ok', questions: 'ok' },
        },
        loading: false,
        error: null,
      },
    })
    render(<Briefing />)
    expect(screen.getByTestId('briefing-swap-painting-button')).toBeInTheDocument()
  })

  it('renders swap button inside reading pane for digest source with result (shifts with assistant panel)', () => {
    useStore.setState({
      briefingSource: 'digest',
      briefing: {
        result: {
          title: '夜航简报',
          date: '2026-07-25',
          content: '## A\n正文',
          sources: [],
          filePath: '/x/briefing.md',
          cached: false,
          generatedAt: new Date().toISOString(),
          sourceStatus: { x: 'ok', podcasts: 'ok', blogs: 'ok' },
        },
        loading: false,
        error: null,
      },
    })
    render(<Briefing />)
    // 换画按钮应在 reading-pane 内部（跟着导读面板开合移动），不在页面级 fixed 区
    const pane = screen.getByTestId('briefing-reading-pane')
    expect(pane.querySelector('[data-testid="briefing-swap-painting-button"]')).toBeTruthy()
  })

  it('does not render surface background for newspaper theme', () => {
    useStore.setState({ briefingTheme: 'newspaper' })
    render(<Briefing />)
    expect(screen.queryByTestId('surface-background')).not.toBeInTheDocument()
    expect(screen.queryByTestId('briefing-swap-painting-button')).not.toBeInTheDocument()
  })
})

describe('Briefing painting plate (今日展品)', () => {
  beforeEach(() => {
    cleanup()
    useStore.setState({
      briefing: { result: null, loading: false, error: null },
      briefingSource: 'job-briefing',
      briefingTheme: 'academic',
      briefingHistory: { list: [], loading: false, error: null },
      jobBriefing: {
        result: {
          date: '2026-07-26',
          title: '求职简报',
          content: '# 内容',
          generatedAt: '2026-07-26T08:00:00.000Z',
          filePath: '/test/job.md',
          sourceStatus: { official: {}, events: 'ok', jobs: 'ok', questions: 'ok' },
        },
        loading: false,
        error: null,
      },
      jobBriefingHistory: { list: [], loading: false, error: null },
      paintingPlateEnabled: true,
      currentPaintings: {
        briefing: { id: 'test', painter: 'Test', title: 'Test', url: '/test.jpg' },
        cover: null,
        home: null,
        study: null,
      },
    })
  })

  it('shows 今日展品 on the job-briefing reading pane when plate is enabled', () => {
    render(<Briefing />)
    expect(screen.getByTestId('painting-plate')).toBeInTheDocument()
    expect(screen.getByTestId('painting-plate-caption')).toHaveTextContent('今日展品')
  })

  it('hides the plate on job-briefing in newspaper theme', () => {
    useStore.setState({ briefingTheme: 'newspaper' })
    render(<Briefing />)
    expect(screen.queryByTestId('painting-plate')).not.toBeInTheDocument()
  })
})

describe('Briefing font CSS vars', () => {
  beforeEach(() => {
    cleanup()
    useStore.setState({
      briefing: { result: null, loading: false, error: null },
      briefingSource: 'digest',
      briefingTheme: 'academic',
      briefingHistory: { list: [], loading: false, error: null },
      briefingFontSize: 'lg',
      currentPaintings: {
        briefing: null,
        cover: null,
        home: null,
        study: null,
      },
    })
  })

  it('sets --briefing-list-title-size/--briefing-list-meta-size/--briefing-quote-size vars on the page root', () => {
    render(<Briefing />)
    const page = screen.getByTestId('briefing-page')
    expect(page.style.getPropertyValue('--briefing-list-title-size')).toBe(BRIEFING_LIST_STYLES.lg.title)
    expect(page.style.getPropertyValue('--briefing-list-meta-size')).toBe(BRIEFING_LIST_STYLES.lg.meta)
    expect(page.style.getPropertyValue('--briefing-quote-size')).toBe(BRIEFING_QUOTE_SIZES.lg)
  })
})
