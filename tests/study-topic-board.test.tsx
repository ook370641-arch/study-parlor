import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useStore } from '@/store'
import { StudyTopicBoard } from '@/components/study/StudyTopicBoard'

vi.mock('@/components/study/SessionFileContent', () => ({
  SessionFileContent: ({ fileName, sessionNumber }: { fileName: string; sessionNumber: number }) => <div data-testid="session-file">{sessionNumber}:{fileName}</div>,
}))

const sessions = [
  { sessionNumber: 1, date: '2026-11-18', title: '第一次', hasReport: true, hasTranscript: true, hasReview: false, hasFable: true, fableCount: 1, hasDiagram: false, reportFile: '学习报告.md', transcriptFile: '对话记录.md', fableFile: '寓言.md' },
  { sessionNumber: 2, date: '2026-11-20', title: '第二次', hasReport: true, hasTranscript: true, hasReview: true, hasFable: false, fableCount: 0, hasDiagram: false, reportFile: '学习报告.md', transcriptFile: '对话记录.md', reviewFile: '复习记录.md' },
]

describe('StudyTopicBoard', () => {
  beforeEach(() => {
    cleanup()
    useStore.setState({
      briefingTheme: 'academic',
      library: [{ dirName: 'memory', title: '记忆', sessionCount: 2, sessions, last_studied: '2026-11-20', last_studied_days: 0, groupId: 'default' }],
      pendingArchives: [],
      studySelectedDirName: 'memory',
      studySelectedSessionNumber: null,
      studyTopicTab: 'report',
      studyDiagramTasks: {},
      studyFableTasks: {},
      studyArtifactVersions: {},
    })
  })

  it('defaults to the latest report and synchronizes historical selection with tabs', () => {
    render(<StudyTopicBoard />)
    expect(screen.getByTestId('study-session-row-2')).toHaveAttribute('aria-current', 'true')
    expect(screen.getByTestId('session-file')).toHaveTextContent('2:学习报告.md')
    fireEvent.click(screen.getByTestId('study-session-row-1'))
    expect(useStore.getState().studySelectedSessionNumber).toBe(1)
    fireEvent.click(screen.getByTestId('study-topic-tab-transcript'))
    expect(useStore.getState().studyTopicTab).toBe('transcript')
    expect(screen.getByTestId('session-file')).toHaveTextContent('1:对话记录.md')
  })

  it('deletes only the selected session after confirmation', () => {
    const deleteArchivedSession = vi.fn().mockResolvedValue(undefined)
    useStore.setState({ deleteArchivedSession, studySelectedSessionNumber: 1 })
    render(<StudyTopicBoard />)
    fireEvent.click(screen.getByTestId('delete-session-button'))
    expect(screen.getByText(/寓言\.md/)).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('confirm-dialog-confirm'))
    expect(deleteArchivedSession).toHaveBeenCalledWith('memory', 1)
  })
})
