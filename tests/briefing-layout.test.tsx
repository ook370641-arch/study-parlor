import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import type { CSSProperties } from 'react'

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
    briefingList: vi.fn(),
    searchPrepare: vi.fn(),
  }
}))

vi.mock('@/lib/paintings', () => ({
  manifest: [{ id: 'test', painter: 'Test', title: 'Test', url: '/test.jpg' }],
  pickRandom: vi.fn((manifest: unknown[]) => manifest[0] ?? null)
}))

import { useStore } from '@/store'
import { Briefing } from '@/pages/Briefing'
import { AcademicBriefingLayout, NewspaperBriefingLayout } from '@/components/briefing'
import type { BriefingResult } from '@/types'
import type { ParsedBriefing } from '@/lib/parse-briefing-markdown'
import { ACADEMIC_BODY_STYLES, NEWSPAPER_BODY_STYLES } from '@/lib/briefing-font-size'

const baseResult: BriefingResult = {
  title: '夜航简报',
  date: '2026-07-07',
  content: '## X / Twitter\n\nNo digest header here.',
  sources: [],
  filePath: '/tmp/briefing.md',
  cached: false,
  generatedAt: new Date().toISOString(),
  sourceStatus: { x: 'ok', blogs: 'ok', podcasts: 'ok' },
}

const baseParsed: ParsedBriefing = {
  sections: [{ title: 'X / Twitter', body: 'No digest header here.' }],
  sources: [],
}

function AcademicWrapper({ children }: { children: React.ReactNode }) {
  const fontSize = useStore((s) => s.briefingFontSize)
  return (
    <div data-testid="briefing-layout-wrapper" style={{ '--briefing-body-size': ACADEMIC_BODY_STYLES[fontSize].size } as CSSProperties}>
      {children}
    </div>
  )
}

function NewspaperWrapper({ children }: { children: React.ReactNode }) {
  const fontSize = useStore((s) => s.briefingFontSize)
  return (
    <div data-testid="briefing-layout-wrapper" style={{ '--briefing-body-size': NEWSPAPER_BODY_STYLES[fontSize].size } as CSSProperties}>
      {children}
    </div>
  )
}

describe('BriefingLayout font size CSS variables', () => {
  beforeEach(() => {
    cleanup()
  })

  it('AcademicBriefingLayout applies --briefing-body-size from store font size', () => {
    useStore.setState({ briefingFontSize: 'lg' })
    render(
      <AcademicWrapper>
        <AcademicBriefingLayout result={baseResult} parsed={baseParsed} displayDate="2026年7月7日" />
      </AcademicWrapper>
    )
    const wrapper = screen.getByTestId('briefing-layout-wrapper')
    const body = screen.getByTestId('briefing-markdown-body')
    expect(wrapper).toHaveStyle({ '--briefing-body-size': ACADEMIC_BODY_STYLES.lg.size })
    expect(body).toHaveStyle({ fontSize: 'var(--briefing-body-size)' })
  })

  it('NewspaperBriefingLayout applies --briefing-body-size from store font size', () => {
    useStore.setState({ briefingFontSize: 'xl' })
    render(
      <NewspaperWrapper>
        <NewspaperBriefingLayout result={baseResult} parsed={baseParsed} displayDate="2026年7月7日" />
      </NewspaperWrapper>
    )
    const wrapper = screen.getByTestId('briefing-layout-wrapper')
    const body = screen.getByTestId('briefing-markdown-body')
    expect(wrapper).toHaveStyle({ '--briefing-body-size': NEWSPAPER_BODY_STYLES.xl.size })
    expect(body).toHaveStyle({ fontSize: 'var(--briefing-body-size)' })
  })
})

describe('BriefingLayout source links', () => {
  beforeEach(() => {
    cleanup()
  })

  const parsedWithSources: ParsedBriefing = {
    sections: [{ title: 'X / Twitter', body: 'Summary text.' }],
    sources: [
      {
        title: 'Swyx',
        items: [
          'Swyx on J-space paper: causal control https://x.com/swyx/status/2074344727202463832',
          '[原文链接](https://x.com/swyx/status/2074344727202463832)',
        ],
      },
    ],
  }

  it('AcademicBriefingLayout renders bare URLs in source section as clickable links', () => {
    useStore.setState({ briefingFontSize: 'base' })
    render(
      <AcademicWrapper>
        <AcademicBriefingLayout
          result={baseResult}
          parsed={parsedWithSources}
          displayDate="2026年7月7日"
        />
      </AcademicWrapper>
    )
    fireEvent.click(screen.getByText('展开来源'))
    const link = screen.getByRole('link', { name: /https:\/\/x\.com\/swyx\/status/ })
    expect(link).toHaveAttribute('href', 'https://x.com/swyx/status/2074344727202463832')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('NewspaperBriefingLayout renders markdown source links as clickable links', () => {
    useStore.setState({ briefingFontSize: 'base' })
    render(
      <NewspaperWrapper>
        <NewspaperBriefingLayout
          result={baseResult}
          parsed={parsedWithSources}
          displayDate="2026年7月7日"
        />
      </NewspaperWrapper>
    )
    fireEvent.click(screen.getByText('展开来源'))
    const link = screen.getByRole('link', { name: /原文链接/ })
    expect(link).toHaveAttribute('href', 'https://x.com/swyx/status/2074344727202463832')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })
})

describe('Briefing layout redesign', () => {
  beforeEach(() => cleanup())

  const redesignResult = {
    title: 'Test',
    date: '2026-07-11',
    content: 'Body text with [link](https://example.com).',
    sources: [],
    filePath: '/x.md',
    cached: false,
    generatedAt: new Date().toISOString(),
    sourceStatus: { x: 'ok', podcasts: 'ok', blogs: 'ok' },
  } as const

  const redesignParsed = {
    sections: [{ title: 'X / Twitter', body: 'Body text with [link](https://example.com).' }],
    sources: [{ title: 'X', items: ['[tweet](https://example.com)'] }],
  }

  it('academic renders body through chunks', () => {
    render(<AcademicBriefingLayout result={redesignResult as any} parsed={redesignParsed} displayDate="2026 年 07 月 11 日" />)
    expect(screen.getByTestId('briefing-academic-layout')).toBeInTheDocument()
    expect(screen.getByTestId('briefing-markdown-body')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'link' })).toBeInTheDocument()
  })

  it('newspaper renders masthead and body through chunks', () => {
    render(<NewspaperBriefingLayout result={redesignResult as any} parsed={redesignParsed} displayDate="2026 年 07 月 11 日" />)
    expect(screen.getByTestId('briefing-newspaper-layout')).toBeInTheDocument()
    expect(screen.getByText('夜航简报')).toBeInTheDocument()
    expect(screen.getByTestId('briefing-markdown-body')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'link' })).toBeInTheDocument()
  })
})

describe('Briefing glass material (academic theme)', () => {
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

  it('applies glass material to rail, list column and content shell in academic theme', () => {
    useStore.setState({ briefingTheme: 'academic', briefingSource: 'digest' } as any)
    render(<Briefing />)
    expect(screen.getByTestId('briefing-source-sidebar').className).toContain('backdrop-blur-md')
    expect(screen.getByTestId('briefing-list-column').className).toContain('backdrop-blur-md')
    expect(screen.getByTestId('briefing-content-shell').className).toContain('backdrop-blur-md')
  })

  it('does not apply glass material in newspaper theme', () => {
    useStore.setState({ briefingTheme: 'newspaper', briefingSource: 'digest' } as any)
    render(<Briefing />)
    expect(screen.getByTestId('briefing-source-sidebar').className).not.toContain('backdrop-blur-md')
  })
})

describe('BriefingLayout quote band', () => {
  beforeEach(() => cleanup())

  const quoteResult = {
    title: 'Test',
    date: '2026-07-11',
    content: 'Body text with [link](https://example.com).',
    sources: [],
    filePath: '/x.md',
    cached: false,
    generatedAt: new Date().toISOString(),
    sourceStatus: { x: 'ok', podcasts: 'ok', blogs: 'ok' },
  } as const

  const quoteParsed = {
    sections: [{ title: 'X / Twitter', body: 'Body text with [link](https://example.com).' }],
    sources: [{ title: 'X', items: ['[tweet](https://example.com)'] }],
  }

  it('academic layout shows the quote band; newspaper does not', () => {
    render(<AcademicBriefingLayout result={quoteResult as any} parsed={quoteParsed} displayDate="2026 年 07 月 11 日" />)
    expect(screen.getByTestId('quote-text')).toBeInTheDocument()
    cleanup()
    render(<NewspaperBriefingLayout result={quoteResult as any} parsed={quoteParsed} displayDate="2026 年 07 月 11 日" />)
    expect(screen.queryByTestId('quote-text')).not.toBeInTheDocument()
  })
})
