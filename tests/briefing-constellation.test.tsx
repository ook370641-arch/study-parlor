import { render, screen, cleanup } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useStore } from '@/store'
import { BriefingConstellation } from '@/components/briefing/BriefingConstellation'

describe('BriefingConstellation', () => {
  beforeEach(() => {
    cleanup()
    useStore.setState({
      briefingTheme: 'academic',
      briefingSource: 'digest',
      briefingStageDetail: null,
      jobBriefingStageDetail: null,
    })
  })

  it('renders a satellite per digest station with legacy step testids', () => {
    render(<BriefingConstellation stage="fetching" />)
    expect(screen.getByTestId('briefing-constellation')).toBeInTheDocument()
    for (const key of ['fetching', 'extracting', 'assembling', 'finalizing']) {
      expect(screen.getByTestId(`briefing-progress-step-${key}`)).toBeInTheDocument()
    }
  })

  it('marks earlier stations done and the current one active with its full label', () => {
    render(<BriefingConstellation stage="assembling" />)
    expect(screen.getByTestId('briefing-progress-step-fetching').dataset.state).toBe('done')
    expect(screen.getByTestId('briefing-progress-step-extracting').dataset.state).toBe('done')
    expect(screen.getByTestId('briefing-progress-step-assembling').dataset.state).toBe('active')
    expect(screen.getByTestId('briefing-progress-step-finalizing').dataset.state).toBe('pending')
    expect(screen.getByTestId('briefing-progress-step-assembling').textContent).toContain('正在组装夜航简报')
  })

  it('falls back to the first station for a foreign stage key', () => {
    render(<BriefingConstellation stage={'digging-jobs' as never} />)
    expect(screen.getByTestId('briefing-progress-step-fetching').dataset.state).toBe('active')
  })

  it('renders five stations with star-blue well for job source', () => {
    useStore.setState({ briefingSource: 'job-briefing' })
    render(<BriefingConstellation stage="digging-jobs" />)
    for (const key of ['scanning-events', 'digging-jobs', 'aggregating-questions', 'synthesizing', 'finalizing']) {
      expect(screen.getByTestId(`briefing-progress-step-${key}`)).toBeInTheDocument()
    }
    expect(screen.getByTestId('briefing-constellation-well').style.borderColor).toBe('rgb(127, 168, 217)')
  })

  it('uses ink accent under newspaper theme', () => {
    useStore.setState({ briefingTheme: 'newspaper' })
    render(<BriefingConstellation stage="fetching" />)
    expect(screen.getByTestId('briefing-constellation-well').style.borderColor).toBe('rgb(26, 26, 26)')
  })

  it('shows the stage detail subtitle when present', () => {
    useStore.setState({ briefingStageDetail: '5 个来源 · 12 篇文章' })
    render(<BriefingConstellation stage="fetching" />)
    expect(screen.getByText('5 个来源 · 12 篇文章')).toBeInTheDocument()
  })

  it('shows the well counter', () => {
    render(<BriefingConstellation stage="assembling" />)
    expect(screen.getByTestId('briefing-constellation-well').textContent).toContain('2 / 4 已归位')
  })
})
