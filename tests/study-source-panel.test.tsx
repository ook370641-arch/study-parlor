import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useStore } from '@/store'
import { StudySourcePanel } from '@/components/study/StudySourcePanel'

describe('StudySourcePanel', () => {
  beforeEach(() => {
    cleanup()
    useStore.setState({
      briefingTheme: 'academic',
      groups: [{ id: 'default', name: '默认', color: '#d97757' }],
      library: [{ dirName: 'memory', title: '记忆', sessionCount: 1, sessions: [{ sessionNumber: 1, date: '2026-11-20', hasReport: true, hasTranscript: true, hasReview: false, hasFable: false, fableCount: 0, hasDiagram: false }], last_studied: '2026-11-20', last_studied_days: 0, groupId: 'default' }],
      pendingArchives: [],
      unsavedSessions: [],
      activeGroupId: null,
      studyListCollapsed: false,
      studySearchQuery: '',
      studyExpandedGroups: {},
      studyExpandedTopics: {},
      studySelectedDirName: null,
      currentPage: 'briefing',
    })
  })

  it('keeps collapse, expansion and selection independent', () => {
    render(<StudySourcePanel />)
    fireEvent.click(screen.getByTestId('study-topic-toggle-memory'))
    fireEvent.click(screen.getByTestId('study-group-toggle-default'))
    expect(useStore.getState().studyExpandedGroups.default).toBe(false)
    expect(useStore.getState().studyExpandedTopics.memory).toBe(true)
    fireEvent.click(screen.getByTestId('briefing-list-column-toggle'))
    expect(useStore.getState().studyListCollapsed).toBe(true)
    expect(useStore.getState().studyExpandedTopics.memory).toBe(true)
  })

  it('opens the existing new-study preparation flow', () => {
    const openPreStudy = vi.fn()
    useStore.setState({ openPreStudy })
    render(<StudySourcePanel />)
    fireEvent.click(screen.getByTestId('new-topic-button'))
    expect(openPreStudy).toHaveBeenCalledWith({ mode: 'progress', topic: '' })
  })

  it('opens and dismisses a background report from the topic tree', () => {
    const dismissPendingReport = vi.fn()
    useStore.setState({
      pendingReports: { memory: { mode: 'progress', topic: '记忆', title: '新报告', content: '正文' } },
      dismissPendingReport,
    })
    render(<StudySourcePanel />)
    fireEvent.click(screen.getByTestId('study-tree-pending-report-badge-memory'))
    expect(screen.getByTestId('archive-report-title')).toHaveTextContent('新报告')
    fireEvent.click(screen.getByTestId('archive-report-close'))
    expect(dismissPendingReport).toHaveBeenCalledWith('memory')
    expect(screen.queryByTestId('archive-report-modal')).not.toBeInTheDocument()
  })
})
