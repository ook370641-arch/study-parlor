import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { TopicMeta } from '@shared/index'
import { StudyTopicRow } from '@/components/study/StudyTopicRow'
import { useStore } from '@/store'

const navigation = vi.hoisted(() => ({ openStudyTopicFromTree: vi.fn() }))
vi.mock('@/lib/study-navigation', () => navigation)
vi.mock('@/components/ReviewFlash', () => ({
  ReviewFlash: ({ onComplete }: { onComplete: () => void }) => <button data-testid="review-flash" onClick={onComplete} />,
}))

const topic: TopicMeta = {
  dirName: 'memory',
  title: '记忆',
  sessionCount: 2,
  last_studied: '2026-11-20',
  last_studied_days: 0,
  groupId: 'default',
  sessions: [
    { sessionNumber: 1, date: '2026-11-18', hasReport: true, hasTranscript: true, hasReview: false, hasFable: true, fableCount: 1, hasDiagram: false, reportFile: '学习报告.md', transcriptFile: '对话记录.md', fableFile: '寓言.md' },
    { sessionNumber: 2, date: '2026-11-20', hasReport: true, hasTranscript: true, hasReview: true, hasFable: false, fableCount: 0, hasDiagram: false, reportFile: '学习报告.md', transcriptFile: '对话记录.md', reviewFile: '复习记录.md' },
  ],
}

describe('StudyTopicRow', () => {
  beforeEach(() => {
    cleanup()
    navigation.openStudyTopicFromTree.mockReset()
    useStore.setState({
      briefingTheme: 'academic',
      unsavedSessions: [],
      pendingArchives: [],
      pendingReports: {},
      studyExpandedTopics: { memory: true },
      studyDiagramTasks: {},
      studyFableTasks: {},
      fableStyleTags: [],
      lastFableTags: [],
      openPreStudy: vi.fn(),
    })
  })

  it('keeps topic and session capabilities at their own granularity', () => {
    render(<StudyTopicRow topic={topic} group={{ id: 'default', name: '默认', color: '#d97757' }} onOpen={vi.fn()} />)

    expect(screen.queryByText('待复习')).not.toBeInTheDocument()
    expect(screen.queryByText('已复习')).not.toBeInTheDocument()
    expect(screen.queryByText('对话')).not.toBeInTheDocument()
    expect(screen.queryByTestId('topic-review-button')).not.toBeInTheDocument()
    expect(screen.getByTestId('session-review-button-1')).toHaveTextContent('复习')
    expect(screen.getByTestId('session-review-button-2')).toHaveTextContent('复检记录')

    fireEvent.click(screen.getByTestId('topic-continue-button'))
    expect(useStore.getState().openPreStudy).toHaveBeenCalledWith({ mode: 'progress', topic: '记忆', dirName: 'memory' })
  })

  it('uses five fixed action columns and opens the selected session artifact', () => {
    render(<StudyTopicRow topic={topic} group={{ id: 'default', name: '默认', color: '#d97757' }} onOpen={vi.fn()} />)

    const actionGroups = screen.getAllByTestId('session-action-grid')
    expect(actionGroups).toHaveLength(2)
    actionGroups.forEach(group => expect(group.children).toHaveLength(5))
    fireEvent.click(screen.getByTestId('session-report-button-2'))
    fireEvent.click(screen.getByTestId('session-review-button-2'))
    expect(navigation.openStudyTopicFromTree).toHaveBeenNthCalledWith(1, 'memory', 2, 'report')
    expect(navigation.openStudyTopicFromTree).toHaveBeenNthCalledWith(2, 'memory', 2, 'review')
  })

  it('starts review through the flash and generates a missing diagram for that session', () => {
    const generateStudyDiagram = vi.fn()
    useStore.setState({ generateStudyDiagram })
    render(<StudyTopicRow topic={topic} group={{ id: 'default', name: '默认', color: '#d97757' }} onOpen={vi.fn()} />)

    fireEvent.click(screen.getByTestId('session-review-button-1'))
    fireEvent.click(screen.getByTestId('review-flash'))
    expect(useStore.getState().openPreStudy).toHaveBeenCalledWith({ mode: 'review', topic: '记忆', dirName: 'memory' })
    fireEvent.click(screen.getByTestId('session-diagram-button-1'))
    expect(generateStudyDiagram).toHaveBeenCalledWith('memory', 1)
  })

  it('keeps session actions readable in newspaper mode', () => {
    useStore.setState({ briefingTheme: 'newspaper' })
    render(<StudyTopicRow topic={topic} group={{ id: 'default', name: '默认', color: '#d97757' }} onOpen={vi.fn()} />)
    expect(screen.getByTestId('session-report-button-2')).toHaveClass('text-[#555]')
  })
})
