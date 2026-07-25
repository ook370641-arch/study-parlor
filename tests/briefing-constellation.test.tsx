import { render, screen, cleanup, act } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
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

  it('exposes the legacy briefing-progress testid as an alias', () => {
    render(<BriefingConstellation stage="fetching" />)
    expect(screen.getByTestId('briefing-progress')).toBeInTheDocument()
    expect(screen.getByTestId('briefing-constellation')).toBeInTheDocument()
  })

  it('extends right-column satellites leftward to avoid clipping', () => {
    render(<BriefingConstellation stage="assembling" />)
    // 右列驻留位（x=81）向左延伸；左列（x=10）不施加 transform。
    expect(screen.getByTestId('briefing-progress-step-finalizing').style.transform).toContain('translateX(-100%)')
    expect(screen.getByTestId('briefing-progress-step-fetching').style.transform).toBe('')
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

  it('renders every station without crash (station/post array invariant)', () => {
    // 防御：如果有人给 DIGEST_STATIONS 加了一个站点但忘了在 POSTS_4 补坐标，
    // 这个测试会因为 posts[i].x → TypeError 而崩溃。
    render(<BriefingConstellation stage="fetching" />)
    const satellites = document.querySelectorAll('[data-testid^="briefing-progress-step-"]')
    expect(satellites.length).toBe(4)
    cleanup()
    useStore.setState({ briefingSource: 'job-briefing' })
    render(<BriefingConstellation stage="scanning-events" />)
    const jobSatellites = document.querySelectorAll('[data-testid^="briefing-progress-step-"]')
    expect(jobSatellites.length).toBe(5)
  })

  it('done satellites dock into the well (slide-in, kept in DOM for testid contract)', () => {
    render(<BriefingConstellation stage="assembling" />)
    const done = screen.getByTestId('briefing-progress-step-fetching')
    expect(done.dataset.state).toBe('done')
    expect(done.className).toContain('sat-docked')
    expect(screen.getByTestId('briefing-progress-step-finalizing').className).not.toContain('sat-docked')
  })

  it('finalizing: well enters checking state with two orbiting photons, counter hidden', () => {
    render(<BriefingConstellation stage="finalizing" />)
    const well = screen.getByTestId('briefing-constellation-well')
    expect(well.dataset.state).toBe('checking')
    expect(well.querySelectorAll('.constellation-photon').length).toBe(2)
    expect(well.textContent).not.toContain('已归位')
  })

  it('mode resolved: photons drop, bloom plays, counter shows N/N', () => {
    render(<BriefingConstellation stage="finalizing" mode="resolved" />)
    const well = screen.getByTestId('briefing-constellation-well')
    expect(well.dataset.state).toBe('resolved')
    expect(well.className).toContain('constellation-well-resolved')
    expect(well.className).toContain('constellation-well-bloom')
    expect(well.textContent).toContain('4 / 4 已归位')
  })

  it('mode failed: well data-state failed, root carries constellation-failed', () => {
    render(<BriefingConstellation stage="extracting" mode="failed" />)
    expect(screen.getByTestId('briefing-constellation-well').dataset.state).toBe('failed')
    expect(screen.getByTestId('briefing-progress').className).toContain('constellation-failed')
  })

  it('well breathes on briefingPulseAt (throttled pulse)', () => {
    vi.useFakeTimers()
    render(<BriefingConstellation stage="fetching" />)
    const well = screen.getByTestId('briefing-constellation-well')
    act(() => { useStore.setState({ briefingPulseAt: Date.now() }) })
    expect(well.style.transform).toContain('scale(1.015)')
    act(() => { vi.advanceTimersByTime(300) })
    expect(well.style.transform).not.toContain('scale(1.015)')
    vi.useRealTimers()
  })
})
