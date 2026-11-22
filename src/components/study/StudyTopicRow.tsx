import { useState, type ReactNode } from 'react'
import type { Group, SessionMeta, StudyTopicTab, TopicMeta } from '@shared/index'
import { ArchiveReportModal } from '@/components/ArchiveReportModal'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { FableStyleDialog } from '@/components/FableStyleDialog'
import { ReviewFlash } from '@/components/ReviewFlash'
import { studyArtifactKey } from '@/lib/study-artifacts'
import { openStudyTopicFromTree } from '@/lib/study-navigation'
import { useStore } from '@/store'
import { useStudyTopicActions } from './useStudyTopicActions'

function SessionAction({ testId, children, disabled = false, active = false, onClick }: {
  testId?: string
  children: ReactNode
  disabled?: boolean
  active?: boolean
  onClick?: () => void
}) {
  const isAcademic = useStore(state => state.briefingTheme) !== 'newspaper'
  return (
    <button
      type="button"
      data-testid={testId}
      disabled={disabled}
      onClick={event => { event.stopPropagation(); onClick?.() }}
      className={`flex h-8 w-full items-center justify-center whitespace-nowrap rounded border px-1 text-[0.65em] leading-none transition-colors disabled:cursor-not-allowed disabled:opacity-30 ${active ? 'border-ember/40 text-ember hover:bg-ember/10' : isAcademic ? 'border-parchment/15 text-parchment/60 hover:border-ember/50 hover:text-ember' : 'border-[#1a1a1a]/15 text-[#555] hover:border-ember/50 hover:text-ember'}`}
    >
      {children}
    </button>
  )
}

function attachmentsFor(session: SessionMeta): string[] {
  return [
    session.hasReport && '学习报告.md',
    session.hasTranscript && '对话记录.md',
    session.hasReview && '复习记录.md',
    session.hasFable && (session.fableCount > 1 ? `寓言(×${session.fableCount}).md` : '寓言.md'),
    session.hasDiagram && '学习图表.svg',
  ].filter((file): file is string => Boolean(file))
}

export function StudyTopicRow({ topic, group, onOpen, onBeginDrag }: {
  topic: TopicMeta
  group: Group
  onOpen: (topic: TopicMeta) => void
  onBeginDrag?: (topic: TopicMeta, x: number, y: number) => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<SessionMeta | null>(null)
  const [reviewTarget, setReviewTarget] = useState<SessionMeta | null>(null)
  const [fableTarget, setFableTarget] = useState<SessionMeta | null>(null)
  const theme = useStore(state => state.briefingTheme)
  const expanded = useStore(state => state.studyExpandedTopics[topic.dirName] ?? false)
  const unsavedSessions = useStore(state => state.unsavedSessions)
  const pendingArchives = useStore(state => state.pendingArchives)
  const diagramTasks = useStore(state => state.studyDiagramTasks)
  const fableTasks = useStore(state => state.studyFableTasks)
  const fableStyleTags = useStore(state => state.fableStyleTags)
  const lastFableTags = useStore(state => state.lastFableTags)
  const actions = useStudyTopicActions(topic)
  const isLive = unsavedSessions.some(session => session.dirName === topic.dirName)
  const isAcademic = theme !== 'newspaper'
  const pendingNumbers = new Set(pendingArchives.filter(item => item.dirName === topic.dirName).map(item => item.sessionNumber))

  const openArtifact = (sessionNumber: number, tab: StudyTopicTab) => {
    void openStudyTopicFromTree(topic.dirName, sessionNumber, tab)
  }

  return (
    <div data-testid="topic-card" data-topic-dir={topic.dirName} className="group/card relative">
      <div
        className={`flex min-h-[3.5em] items-center gap-2 border-b px-2 py-2 ${isAcademic ? 'border-parchment/10 hover:bg-parchment/[0.025]' : 'border-[#1a1a1a]/10 hover:bg-[#1a1a1a]/[0.025]'}`}
        onMouseDown={event => {
          if (event.button !== 0 || !onBeginDrag || (event.target as HTMLElement).closest('button,input')) return
          event.preventDefault()
          onBeginDrag(topic, event.clientX, event.clientY)
        }}
      >
        <span aria-hidden="true" className="h-[1.7em] w-[3px] shrink-0 rounded-full" style={{ backgroundColor: group.color }} />
        <button
          type="button"
          data-testid={`study-wall-topic-toggle-${topic.dirName}`}
          aria-label={`${expanded ? '收起' : '展开'}${topic.title}`}
          aria-expanded={expanded}
          onClick={() => useStore.getState().toggleStudyTopic(topic.dirName)}
          className="w-4 shrink-0 text-[0.7em] opacity-50 hover:text-ember"
        >
          {expanded ? '▾' : '▸'}
        </button>
        <div className="min-w-0 flex-1">
          {actions.renaming ? (
            <input
              data-testid="topic-rename-input"
              value={actions.renameValue}
              onChange={event => actions.setRenameValue(event.target.value)}
              onBlur={actions.cancelRename}
              onKeyDown={event => {
                if (event.key === 'Enter') void actions.submitRename()
                if (event.key === 'Escape') actions.cancelRename()
              }}
              onMouseDown={event => event.stopPropagation()}
              className={`w-full rounded border border-ember/50 bg-transparent px-2 py-1 font-serif text-[0.9em] outline-none ${isAcademic ? 'text-parchment' : 'text-[#1a1a1a]'}`}
              autoFocus
            />
          ) : (
            <button type="button" data-testid="topic-open-button" onClick={() => onOpen(topic)} className="block w-full truncate text-left">
              <span className={`block truncate font-serif text-[0.9em] ${isAcademic ? 'text-parchment/90' : 'text-[#1a1a1a]'}`}>{topic.title}</span>
              <span className="mt-1 block text-[0.65em] opacity-45">{topic.sessionCount} 次学习 · {topic.last_studied_days === 0 ? '今天' : `${topic.last_studied_days} 天前`}</span>
            </button>
          )}
        </div>
        {isLive && <span className={`shrink-0 text-[0.65em] ${isAcademic ? 'text-green-300/70' : 'text-green-700'}`}><span className={`mr-1 inline-block h-1.5 w-1.5 rounded-full ${isAcademic ? 'bg-green-300/70' : 'bg-green-700'}`} />进行中</span>}
        {actions.pendingReport && <button type="button" data-testid="topic-pending-report-badge" onClick={actions.openPendingReport} className="shrink-0 text-[0.65em] text-ember"><span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-ember" />新报告</button>}
        <button type="button" data-testid="topic-continue-button" onClick={actions.continueStudy} className={`shrink-0 rounded border px-2 py-1 text-[0.65em] text-ember hover:border-ember/50 ${isAcademic ? 'border-parchment/15' : 'border-[#1a1a1a]/15'}`}>
          续谈（第{topic.sessionCount + 1}次）
        </button>
        <button type="button" aria-label="主题更多操作" onClick={() => setMenuOpen(value => !value)} className="w-6 shrink-0 text-[0.8em] opacity-50 hover:text-ember">⋯</button>
      </div>

      {menuOpen && (
        <div className={`absolute right-1 top-11 z-20 min-w-24 rounded border py-1 text-[0.7em] shadow-xl ${isAcademic ? 'border-slate/30 bg-ink text-parchment' : 'border-[#1a1a1a]/15 bg-white text-[#1a1a1a]'}`} onMouseLeave={() => setMenuOpen(false)}>
          <button data-testid="topic-rename-action" onClick={() => { setMenuOpen(false); actions.startRename() }} className="block w-full px-3 py-2 text-left hover:bg-ember/10">重命名</button>
          <button data-testid="topic-archive-action" onClick={() => { setMenuOpen(false); void actions.archive() }} className="block w-full px-3 py-2 text-left hover:bg-ember/10">归档</button>
        </div>
      )}

      {expanded && (
        <div className={`overflow-x-auto border-b ${isAcademic ? 'border-parchment/10 bg-black/10' : 'border-[#1a1a1a]/10 bg-black/[0.02]'}`}>
          <div className="min-w-[570px] py-1 pl-9 pr-2">
            {[...topic.sessions].sort((a, b) => b.sessionNumber - a.sessionNumber).map(session => {
              const pending = pendingNumbers.has(session.sessionNumber)
              const key = studyArtifactKey(topic.dirName, session.sessionNumber)
              const diagramGenerating = Boolean(diagramTasks[key])
              const fableGenerating = Boolean(fableTasks[key])
              return (
                <div key={session.sessionNumber} data-testid={`study-wall-session-${topic.dirName}-${session.sessionNumber}`} className={`flex min-h-10 items-center gap-3 border-l py-1 pl-3 ${isAcademic ? 'border-parchment/10' : 'border-[#1a1a1a]/10'}`}>
                  <div className="min-w-0 flex-1 text-[0.68em]">
                    <span className="opacity-70">第 {session.sessionNumber} 次学习</span>
                    <span className="ml-2 opacity-35">{session.date.slice(0, 10)}{pending ? ' · 归档中' : ''}</span>
                  </div>
                  <div data-testid="session-action-grid" className="grid shrink-0 grid-cols-[64px_88px_88px_88px_24px] items-center gap-1.5">
                    <SessionAction testId={`session-report-button-${session.sessionNumber}`} disabled={pending || !session.reportFile} onClick={() => openArtifact(session.sessionNumber, 'report')}>
                      {pending ? '整理中…' : '报告'}
                    </SessionAction>
                    <SessionAction
                      testId={`session-diagram-button-${session.sessionNumber}`}
                      disabled={pending || diagramGenerating || (!session.diagramFile && !session.reportFile)}
                      active={!session.diagramFile && Boolean(session.reportFile) && !pending}
                      onClick={() => session.diagramFile ? openArtifact(session.sessionNumber, 'diagram') : void useStore.getState().generateStudyDiagram(topic.dirName, session.sessionNumber)}
                    >
                      {diagramGenerating ? '生成中…' : session.diagramFile ? '图表' : session.reportFile && !pending ? '生成图表' : '图表'}
                    </SessionAction>
                    <SessionAction
                      testId={`session-fable-button-${session.sessionNumber}`}
                      disabled={pending || fableGenerating || (!session.fableFile && !session.reportFile)}
                      active={!session.fableFile && Boolean(session.reportFile) && !pending}
                      onClick={() => session.fableFile ? openArtifact(session.sessionNumber, 'fable') : setFableTarget(session)}
                    >
                      {fableGenerating ? '正在书写…' : session.fableFile ? '寓言' : session.reportFile && !pending ? '唤醒寓言' : '寓言'}
                    </SessionAction>
                    <SessionAction
                      testId={`session-review-button-${session.sessionNumber}`}
                      disabled={pending || (session.hasReview && !session.reviewFile)}
                      active={!session.hasReview && !pending}
                      onClick={() => session.hasReview ? openArtifact(session.sessionNumber, 'review') : setReviewTarget(session)}
                    >
                      {session.hasReview ? '复检记录' : '复习'}
                    </SessionAction>
                    <button type="button" data-testid={`study-wall-delete-session-${session.sessionNumber}`} title="注销此份" aria-label={`注销第${session.sessionNumber}次学习`} onClick={() => setDeleteTarget(session)} className="text-center text-[0.75em] text-red-400/40 hover:text-red-400">×</button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {reviewTarget && <ReviewFlash title={topic.title} date={reviewTarget.date.slice(0, 10)} onComplete={() => { setReviewTarget(null); actions.reviewTopic() }} />}
      <FableStyleDialog
        open={fableTarget !== null}
        tags={fableStyleTags}
        defaultSelected={lastFableTags}
        onClose={() => setFableTarget(null)}
        onConfirm={(selectedTags, description) => {
          if (!fableTarget) return
          const sessionNumber = fableTarget.sessionNumber
          setFableTarget(null)
          void useStore.getState().generateStudyFable({ dirName: topic.dirName, sessionNumber, selectedTags, description })
        }}
      />
      {deleteTarget && (
        <ConfirmDialog
          open
          title="注销谈话记录"
          icon="trash"
          confirmLabel="确认注销"
          confirmVariant="danger"
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => {
            const sessionNumber = deleteTarget.sessionNumber
            setDeleteTarget(null)
            void useStore.getState().deleteArchivedSession(topic.dirName, sessionNumber)
          }}
        >
          即将注销此份记录 <strong>{topic.title} / 第{deleteTarget.sessionNumber}</strong>。<br /><br />
          {attachmentsFor(deleteTarget).length > 0 && <>以下附件将一并销毁：<br /><span className="opacity-60">{attachmentsFor(deleteTarget).join(' · ')}</span><br /><br /></>}
          <span className="text-red-400">不可撤销。没有副本。没有备份。</span>
        </ConfirmDialog>
      )}
      {actions.pendingReport && actions.reportOpen && <ArchiveReportModal result={actions.pendingReport} onClose={actions.closePendingReport} />}
    </div>
  )
}
