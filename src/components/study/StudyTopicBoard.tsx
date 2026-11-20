import { useEffect, useState } from 'react'
import type { SessionMeta, StudyTopicTab } from '@shared/index'
import { ArchiveReportModal } from '@/components/ArchiveReportModal'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { FableStyleDialog } from '@/components/FableStyleDialog'
import { ReviewFlash } from '@/components/ReviewFlash'
import { latestSession, mergePendingArchives, pendingSessionNumbers } from '@/lib/study-wall'
import { studyArtifactKey } from '@/lib/study-artifacts'
import { useStore } from '@/store'
import { SessionFileContent } from './SessionFileContent'
import { useStudyTopicActions } from './useStudyTopicActions'

const TABS: { id: StudyTopicTab; label: string }[] = [
  { id: 'report', label: '报告' },
  { id: 'transcript', label: '对话' },
  { id: 'diagram', label: '图表' },
  { id: 'fable', label: '寓言' },
  { id: 'review', label: '复习' },
]

function fileForTab(tab: StudyTopicTab, session: SessionMeta): string | undefined {
  if (tab === 'report') return session.reportFile
  if (tab === 'transcript') return session.transcriptFile
  if (tab === 'diagram') return session.diagramFile
  if (tab === 'fable') return session.fableFile
  return session.reviewFile
}

export function StudyTopicBoard() {
  const dirName = useStore(state => state.studySelectedDirName)
  const selectedSessionNumber = useStore(state => state.studySelectedSessionNumber)
  const tab = useStore(state => state.studyTopicTab)
  const library = useStore(state => state.library)
  const pendingArchives = useStore(state => state.pendingArchives)
  const theme = useStore(state => state.briefingTheme)
  const topic = mergePendingArchives(library, pendingArchives).find(item => item.dirName === dirName)
  const selectedSession = topic?.sessions.find(session => session.sessionNumber === selectedSessionNumber) ?? (topic ? latestSession(topic) : undefined)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [reviewFlash, setReviewFlash] = useState(false)
  const [styleDialogOpen, setStyleDialogOpen] = useState(false)
  const isAcademic = theme !== 'newspaper'

  useEffect(() => {
    if (dirName && !topic) useStore.getState().openStudyWall()
  }, [dirName, topic])

  if (!topic || !selectedSession) {
    return <div data-testid="study-topic-board" className="flex h-full flex-col items-center justify-center gap-4"><p className="opacity-50">这个主题暂时没有可显示的学习记录。</p><button onClick={() => useStore.getState().openStudyWall()} className="text-ember underline">返回学习墙</button></div>
  }

  return <LoadedStudyTopicBoard key={topic.dirName} topic={topic} selectedSession={selectedSession} tab={tab} deleteOpen={deleteOpen} setDeleteOpen={setDeleteOpen} reviewFlash={reviewFlash} setReviewFlash={setReviewFlash} styleDialogOpen={styleDialogOpen} setStyleDialogOpen={setStyleDialogOpen} isAcademic={isAcademic} pendingArchives={pendingArchives} />
}

function LoadedStudyTopicBoard({ topic, selectedSession, tab, deleteOpen, setDeleteOpen, reviewFlash, setReviewFlash, styleDialogOpen, setStyleDialogOpen, isAcademic, pendingArchives }: {
  topic: NonNullable<ReturnType<typeof mergePendingArchives>[number]>
  selectedSession: SessionMeta
  tab: StudyTopicTab
  deleteOpen: boolean
  setDeleteOpen: (open: boolean) => void
  reviewFlash: boolean
  setReviewFlash: (open: boolean) => void
  styleDialogOpen: boolean
  setStyleDialogOpen: (open: boolean) => void
  isAcademic: boolean
  pendingArchives: ReturnType<typeof useStore.getState>['pendingArchives']
}) {
  const actions = useStudyTopicActions(topic)
  const selectedSessionNumber = useStore(state => state.studySelectedSessionNumber)
  const diagramTasks = useStore(state => state.studyDiagramTasks)
  const fableTasks = useStore(state => state.studyFableTasks)
  const versions = useStore(state => state.studyArtifactVersions)
  const fableStyleTags = useStore(state => state.fableStyleTags)
  const lastFableTags = useStore(state => state.lastFableTags)
  const fileName = fileForTab(tab, selectedSession)
  const key = studyArtifactKey(topic.dirName, selectedSession.sessionNumber)
  const isPending = pendingSessionNumbers(pendingArchives, topic.dirName).has(selectedSession.sessionNumber)
  const generating = tab === 'diagram' ? diagramTasks[key] : tab === 'fable' ? fableTasks[key] : false
  const attachments = [selectedSession.hasReport && '学习报告.md', selectedSession.hasTranscript && '对话记录.md', selectedSession.hasReview && '复习记录.md', selectedSession.hasFable && (selectedSession.fableCount > 1 ? `寓言(×${selectedSession.fableCount}).md` : '寓言.md'), selectedSession.hasDiagram && '学习图表.svg'].filter(Boolean)

  return (
    <div data-testid="study-topic-board" className={`flex h-full min-h-0 flex-col ${isAcademic ? 'text-parchment' : 'text-[#1a1a1a]'}`}>
      <header className="shrink-0 border-b border-parchment/10 px-6 py-4">
        <div className="flex items-center gap-3">
          <button data-testid="session-viewer-close" onClick={() => useStore.getState().openStudyWall()} className="text-sm opacity-50 hover:opacity-100">← 学习墙</button>
          {actions.renaming ? <input data-testid="topic-rename-input" value={actions.renameValue} onChange={event => actions.setRenameValue(event.target.value)} onBlur={actions.cancelRename} onKeyDown={event => { if (event.key === 'Enter') void actions.submitRename(); if (event.key === 'Escape') actions.cancelRename() }} className="rounded border border-ember/50 bg-transparent px-2 py-1 font-serif text-xl outline-none" autoFocus /> : <h1 data-testid="session-viewer-title" className="min-w-0 flex-1 truncate font-serif text-2xl">{topic.title}</h1>}
          <button data-testid="topic-continue-button" onClick={actions.continueStudy} className="rounded bg-ember px-3 py-1.5 text-xs text-ink">继续</button>
          <button data-testid="topic-review-button" onClick={() => setReviewFlash(true)} className="rounded border border-parchment/20 px-3 py-1.5 text-xs">复习</button>
          <button data-testid="topic-rename-action" onClick={actions.startRename} className="text-xs opacity-50 hover:opacity-100">重命名</button>
          <button data-testid="topic-archive-action" onClick={() => void actions.archive()} className="text-xs opacity-50 hover:opacity-100">归档</button>
        </div>
        <div className="mt-4 flex gap-2 overflow-x-auto">
          {[...topic.sessions].sort((a, b) => b.sessionNumber - a.sessionNumber).map(session => <button key={session.sessionNumber} data-testid={`study-session-row-${session.sessionNumber}`} aria-current={selectedSession.sessionNumber === session.sessionNumber} onClick={() => useStore.getState().openStudyTopic(topic.dirName, session.sessionNumber)} className={`shrink-0 rounded-full border px-3 py-1 text-xs ${selectedSession.sessionNumber === session.sessionNumber ? 'border-ember text-ember' : 'border-parchment/15 opacity-50'}`}>第 {session.sessionNumber} 次 · {session.date.slice(0, 10)}</button>)}
        </div>
      </header>
      <div role="tablist" aria-label="学习产物" className="flex shrink-0 gap-1 border-b border-parchment/10 px-6 py-2">
        {TABS.map(item => <button key={item.id} role="tab" data-testid={`study-topic-tab-${item.id}`} aria-selected={tab === item.id} onClick={() => useStore.getState().setStudyTopicTab(item.id)} className={`rounded px-3 py-1.5 text-xs ${tab === item.id ? 'bg-ember/15 text-ember' : 'opacity-50 hover:opacity-90'}`}>{item.label}</button>)}
        <div className="flex-1" />
        {actions.pendingReport && <button data-testid="topic-pending-report-badge" onClick={actions.openPendingReport} className="text-xs text-ember">查看新报告</button>}
        <button data-testid="delete-session-button" onClick={() => setDeleteOpen(true)} className="text-xs text-red-400/60 hover:text-red-400">注销本次</button>
      </div>
      <main data-testid="study-topic-content" className="min-h-0 flex-1 overflow-y-auto">
        {isPending && tab === 'report' ? <div className="flex h-full items-center justify-center opacity-50">正在整理这次学习…</div> : fileName ? <SessionFileContent dirName={topic.dirName} sessionNumber={selectedSession.sessionNumber} fileName={fileName} title={`${topic.title} · 第 ${selectedSession.sessionNumber} 次`} version={versions[key] ?? 0} /> : <div className="flex h-full flex-col items-center justify-center gap-3"><p className="opacity-45">{generating ? '生成中…' : tab === 'review' ? '还没有复习记录。' : `还没有${TABS.find(item => item.id === tab)?.label}。`}</p>{tab === 'diagram' && selectedSession.reportFile && <button data-testid="generate-diagram-button" disabled={generating} onClick={() => void useStore.getState().generateStudyDiagram(topic.dirName, selectedSession.sessionNumber)} className="text-ember underline">生成学习图表</button>}{tab === 'fable' && selectedSession.reportFile && <button data-testid="generate-fable-button" disabled={generating} onClick={() => setStyleDialogOpen(true)} className="text-ember underline">唤醒寓言</button>}{tab === 'review' && <button onClick={() => setReviewFlash(true)} className="text-ember underline">开始复习</button>}</div>}
        {fileName && (tab === 'diagram' || tab === 'fable') && <div className="border-t border-parchment/10 p-3 text-center"><button disabled={generating} onClick={() => tab === 'diagram' ? void useStore.getState().generateStudyDiagram(topic.dirName, selectedSession.sessionNumber) : setStyleDialogOpen(true)} className="text-xs text-ember disabled:opacity-40">{generating ? '生成中…' : `重新生成${tab === 'diagram' ? '图表' : '寓言'}`}</button></div>}
      </main>
      {reviewFlash && <ReviewFlash title={topic.title} date={selectedSession.date} onComplete={() => { setReviewFlash(false); actions.reviewTopic() }} />}
      <FableStyleDialog open={styleDialogOpen} tags={fableStyleTags} defaultSelected={lastFableTags} onClose={() => setStyleDialogOpen(false)} onConfirm={(selectedTags, description) => { setStyleDialogOpen(false); void useStore.getState().generateStudyFable({ dirName: topic.dirName, sessionNumber: selectedSession.sessionNumber, selectedTags, description }) }} />
      {deleteOpen && <ConfirmDialog open title="注销谈话记录" icon="trash" confirmLabel="确认注销" confirmVariant="danger" onCancel={() => setDeleteOpen(false)} onConfirm={() => { void useStore.getState().deleteArchivedSession(topic.dirName, selectedSession.sessionNumber).then(() => { if (selectedSessionNumber === selectedSession.sessionNumber) useStore.setState({ studySelectedSessionNumber: null }) }); setDeleteOpen(false) }}>即将注销此份记录 <strong>{topic.title} / 第{selectedSession.sessionNumber}</strong>。<br /><br />{attachments.length > 0 && <>以下附件将一并销毁：<br /><span className="opacity-60">{attachments.join(' · ')}</span><br /><br /></>}<span className="text-red-400">不可撤销。没有副本。没有备份。</span></ConfirmDialog>}
      {actions.pendingReport && actions.reportOpen && <ArchiveReportModal result={actions.pendingReport} onClose={actions.closePendingReport} />}
    </div>
  )
}
