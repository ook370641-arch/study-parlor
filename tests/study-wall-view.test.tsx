import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useStore } from '@/store'
import { StudyWall } from '@/components/study/StudyWall'

vi.mock('@/components/Quote', () => ({ Quote: () => <div data-testid="quote" /> }))
vi.mock('@/components/StudyControlsGroup', () => ({ StudyControlsGroup: () => <div /> }))
vi.mock('@/components/WildCardRecCard', () => ({ WildCardRecCard: ({ onClickTopic }: { onClickTopic: (topic: string) => void }) => <button data-testid="wild-card" onClick={() => onClickTopic('随机主题')} /> }))
vi.mock('@/components/GroupRecCard', () => ({ GroupRecCard: () => <div data-testid="group-rec" /> }))
vi.mock('@/components/StrategyToggle', () => ({ StrategyToggle: () => <div /> }))
vi.mock('@/components/demo/DemoNotePopover', () => ({ DemoInfoButton: () => <button />, DemoNotePopover: () => null }))

describe('StudyWall', () => {
  beforeEach(() => {
    cleanup()
    const sessions = [{ sessionNumber: 1, date: '2026-11-20', hasReport: true, hasTranscript: true, hasReview: false, hasFable: false, fableCount: 0, hasDiagram: false }]
    useStore.setState({
      briefingTheme: 'academic', activeGroupId: null, studySearchQuery: '', studyExpandedGroups: {},
      pendingArchives: [], unsavedSessions: [], wildcardInspiration: null, groupInspirations: {},
      groups: [{ id: 'default', name: '默认', color: '#d97757' }],
      library: Array.from({ length: 12 }, (_, index) => ({ dirName: `t${index}`, title: `主题 ${index}`, sessionCount: 1, sessions, last_studied: '2026-11-20', last_studied_days: 0, groupId: 'default' })),
    })
  })

  it('renders recommendations and every topic without pagination', () => {
    render(<StudyWall />)
    expect(screen.getByTestId('study-wall')).toBeInTheDocument()
    expect(screen.getAllByTestId('topic-card')).toHaveLength(12)
    expect(screen.getByTestId('wild-card')).toBeInTheDocument()
    expect(screen.queryByTestId('pagination-next')).not.toBeInTheDocument()
    expect(screen.queryByText('新主题推荐')).not.toBeInTheDocument()
    const group = screen.getByTestId('study-group-list-default')
    expect(within(group).getAllByTestId('topic-card')).toHaveLength(12)
    expect(within(screen.getByTestId('study-group-content-default')).getByTestId('wild-card')).toBeInTheDocument()
  })

  it('keeps a new-study action in an empty library', () => {
    useStore.setState({ library: [] })
    render(<StudyWall />)
    expect(screen.getByTestId('study-wall-new-topic-button')).toBeInTheDocument()
  })

  it('keeps both continue and burn actions for an unsaved session', () => {
    const burnLiveSession = vi.fn()
    const removeUnsavedSession = vi.fn()
    useStore.setState({
      unsavedSessions: [{ id: 'live-1', topic: '未完成', mode: 'progress', difficulty: 'mid', temperature: 0.7, history: [] }],
      burnLiveSession,
      removeUnsavedSession,
    })
    render(<StudyWall />)
    expect(screen.getByTestId('wall-continue-unsaved-button')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('wall-burn-unsaved-button'))
    expect(burnLiveSession).toHaveBeenCalledWith('live-1')
    expect(removeUnsavedSession).toHaveBeenCalledWith('live-1')
  })

  it('passes the recommendation target group into new-study preparation', () => {
    const openPreStudy = vi.fn()
    useStore.setState({ openPreStudy })
    render(<StudyWall />)
    fireEvent.click(screen.getByTestId('wild-card'))
    expect(openPreStudy).toHaveBeenCalledWith({ mode: 'progress', topic: '随机主题', groupId: 'default' })
  })
})
