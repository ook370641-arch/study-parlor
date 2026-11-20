import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ipc } from '@/lib/ipc'
import { useStore } from '@/store'

vi.mock('@/lib/ipc', () => ({
  ipc: {
    readSessionFile: vi.fn(),
    llmGenerateDiagram: vi.fn(),
    llmGenerateFableFromReport: vi.fn(),
    writeFable: vi.fn(),
    patchState: vi.fn().mockResolvedValue(undefined),
  },
}))

const library = [{
  dirName: 'memory', title: '记忆', sessionCount: 1, last_studied: '2026-11-20', last_studied_days: 0, groupId: 'default',
  sessions: [{ sessionNumber: 2, date: '2026-11-20', title: '记忆', hasReport: true, hasTranscript: true, hasReview: false, hasFable: false, fableCount: 0, hasDiagram: false, reportFile: '学习报告.md' }],
}]

describe('study artifact tasks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useStore.setState({
      library,
      studyDiagramTasks: {},
      studyFableTasks: {},
      studyArtifactVersions: {},
      rescanLibrary: vi.fn().mockResolvedValue(undefined),
      showToast: vi.fn(),
    })
  })

  it('keeps diagram generation state while another topic is selected', async () => {
    let finish!: () => void
    vi.mocked(ipc.llmGenerateDiagram).mockImplementation(() => new Promise<void>(resolve => { finish = resolve }))
    vi.mocked(ipc.readSessionFile).mockResolvedValue({ content: '# 报告', mimeType: 'text/markdown' })
    const promise = useStore.getState().generateStudyDiagram('memory', 2)
    await Promise.resolve()
    expect(useStore.getState().studyDiagramTasks['memory:s2']).toBe(true)
    useStore.getState().openStudyTopic('other', 1)
    finish()
    await promise
    expect(useStore.getState().studyDiagramTasks['memory:s2']).toBeUndefined()
    expect(useStore.getState().studyArtifactVersions['memory:s2']).toBe(1)
  })

  it('prevents duplicate generation for the same session', async () => {
    vi.mocked(ipc.readSessionFile).mockResolvedValue({ content: '# 报告' })
    vi.mocked(ipc.llmGenerateDiagram).mockResolvedValue(undefined)
    await Promise.all([
      useStore.getState().generateStudyDiagram('memory', 2),
      useStore.getState().generateStudyDiagram('memory', 2),
    ])
    expect(ipc.llmGenerateDiagram).toHaveBeenCalledOnce()
  })
})
