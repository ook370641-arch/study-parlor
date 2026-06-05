import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { ReportHeader } from '@/components/md/ReportHeader'
import { Frontmatter } from '@shared/index'

afterEach(() => {
  cleanup()
})

function makeFrontmatter(overrides: Partial<Frontmatter> = {}): Frontmatter {
  return {
    title: 'Default Title',
    created: '2026-05-23T00:00:00.000Z',
    review_count: 0,
    difficulty: 'mid',
    tags: [],
    ...overrides,
  }
}

describe('ReportHeader', () => {
  it('renders progress report with all fields', () => {
    const fm = makeFrontmatter({
      type: 'progress',
      title: 'Agent',
      description: 'A study on autonomous agents',
      tags: ['AI', 'agents'],
      session_number: 1,
      difficulty: 'high',
      progress_summary: 'Summary of progress so far',
      created: '2026-05-23T00:00:00.000Z',
    })

    render(<ReportHeader frontmatter={fm} />)

    expect(screen.getByText('学习卷宗')).toBeInTheDocument()
    expect(screen.getByText('强')).toBeInTheDocument()
    expect(screen.getByText('Agent')).toBeInTheDocument()
    expect(screen.getByText('A study on autonomous agents')).toBeInTheDocument()
    expect(screen.getByText('AI')).toBeInTheDocument()
    expect(screen.getByText('agents')).toBeInTheDocument()
    expect(screen.getByText('档案编号 1 · 2026.05.23')).toBeInTheDocument()
    expect(screen.getByText('Summary of progress so far')).toBeInTheDocument()
  })

  it('review report does not render difficulty badge', () => {
    const fm = makeFrontmatter({
      type: 'review',
      title: 'Review Topic',
      difficulty: 'mid',
      review_count: 1,
      last_reviewed: '2026-05-27T00:00:00.000Z',
    })

    render(<ReportHeader frontmatter={fm} />)

    expect(screen.getByText('复检记录')).toBeInTheDocument()
    expect(screen.queryByText('中')).not.toBeInTheDocument()
    expect(screen.getByText('第1次被取出翻阅 · 2026.05.27')).toBeInTheDocument()
  })

  it('fable renders source topic text', () => {
    const fm = makeFrontmatter({
      type: 'fable',
      title: 'The Fox and the Grapes',
      tags: ['story'],
    })

    render(<ReportHeader frontmatter={fm} />)

    expect(screen.getByText('寓言')).toBeInTheDocument()
    expect(screen.getByText('来源主题：The Fox and the Grapes')).toBeInTheDocument()
  })

  it('hides description when missing', () => {
    const fm = makeFrontmatter({
      type: 'progress',
      title: 'No Description',
      // description intentionally omitted
    })

    render(<ReportHeader frontmatter={fm} />)

    expect(screen.getByText('No Description')).toBeInTheDocument()
    expect(screen.queryByText('A study on autonomous agents')).not.toBeInTheDocument()
  })

  it('hides tags when empty', () => {
    const fm = makeFrontmatter({
      type: 'progress',
      title: 'No Tags',
      tags: [],
    })

    render(<ReportHeader frontmatter={fm} />)

    expect(screen.getByText('No Tags')).toBeInTheDocument()
    // No tag container should be rendered when tags array is empty
    expect(screen.queryByText('AI')).not.toBeInTheDocument()
  })

  it('transcript renders minimal layout with Session metadata', () => {
    const fm = makeFrontmatter({
      type: 'transcript',
      title: 'Session Transcript',
      session_number: 1,
      created: '2026-05-23T00:00:00.000Z',
    })

    render(<ReportHeader frontmatter={fm} />)

    expect(screen.queryByText('原始对话')).not.toBeInTheDocument()
    expect(screen.queryByText('中')).not.toBeInTheDocument()
    expect(screen.getByText('档案编号 1 · 2026.05.23')).toBeInTheDocument()
  })
})
