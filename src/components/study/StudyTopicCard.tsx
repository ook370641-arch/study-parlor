import { useState } from 'react'
import type { Group, TopicMeta } from '@shared/index'
import { AlbumCard } from '@/components/album-wall/AlbumCard'
import { ArchiveReportModal } from '@/components/ArchiveReportModal'
import { useStore } from '@/store'
import { latestSession } from '@/lib/study-wall'
import { useStudyTopicActions } from './useStudyTopicActions'

export function StudyTopicCard({ topic, group, onOpen, onBeginDrag }: {
  topic: TopicMeta
  group: Group
  onOpen: (topic: TopicMeta) => void
  onBeginDrag?: (topic: TopicMeta, x: number, y: number) => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const unsavedSessions = useStore(state => state.unsavedSessions)
  const actions = useStudyTopicActions(topic)
  const latest = latestSession(topic)
  const isLive = unsavedSessions.some(session => session.dirName === topic.dirName)
  const status = isLive ? '进行中' : !latest ? '暂无记录' : latest.hasReview ? '已复习' : '待复习'

  return (
    <div
      data-topic-dir={topic.dirName}
      className="group/card relative"
      onMouseDown={event => {
        if (event.button !== 0 || !onBeginDrag || (event.target as HTMLElement).closest('button,input')) return
        event.preventDefault()
        onBeginDrag(topic, event.clientX, event.clientY)
      }}
    >
      <AlbumCard
        testId="topic-card"
        title={actions.renaming ? '' : topic.title}
        onOpen={() => onOpen(topic)}
        className="transition-transform hover:-translate-y-0.5"
        fallback={<div aria-hidden="true" className="absolute inset-0" style={{ background: `linear-gradient(145deg, ${group.color}55, #17110d)` }}><div className="absolute left-[18%] top-[16%] h-24 w-24 rounded-full border border-parchment/25"><span className="absolute -right-1 top-8 h-2 w-2 rounded-full" style={{ backgroundColor: group.color }} /></div></div>}
        topLeft={<span className="absolute left-2 top-2 rounded bg-black/25 px-2 py-1 text-[10px] text-parchment/70">{group.name}</span>}
        topRight={<span className="absolute right-2 top-2 rounded bg-black/25 px-2 py-1 text-[10px] text-parchment/70">{status}</span>}
        meta={<div className="mt-1 text-[0.75em] text-parchment/60">{topic.sessionCount} 次 · {topic.last_studied_days === 0 ? '今天' : `${topic.last_studied_days} 天前`}</div>}
        hoverMeta={<span>继续学习或打开最近报告</span>}
      />
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
          onClick={event => event.stopPropagation()}
          onMouseDown={event => event.stopPropagation()}
          className="absolute bottom-12 left-3 right-3 rounded border border-ember/50 bg-ink px-2 py-1 text-sm text-parchment outline-none"
          autoFocus
        />
      ) : (
        <div className="absolute bottom-16 right-2 flex gap-1 opacity-0 transition-opacity hover:opacity-100 focus-within:opacity-100 group-hover/card:opacity-100">
          <button data-testid="topic-continue-button" onClick={event => { event.stopPropagation(); actions.continueStudy() }} className="rounded bg-ink/80 px-2 py-1 text-[10px] text-parchment">继续</button>
          <button data-testid="topic-review-button" onClick={event => { event.stopPropagation(); actions.reviewTopic() }} className="rounded bg-ink/80 px-2 py-1 text-[10px] text-parchment">复习</button>
          <button aria-label="主题更多操作" onClick={event => { event.stopPropagation(); setMenuOpen(value => !value) }} className="rounded bg-ink/80 px-2 py-1 text-[10px] text-parchment">⋯</button>
        </div>
      )}
      {menuOpen && (
        <div className="absolute bottom-24 right-2 z-20 min-w-24 rounded border border-slate/30 bg-ink py-1 text-xs text-parchment shadow-xl" onMouseLeave={() => setMenuOpen(false)}>
          <button data-testid="topic-rename-action" onClick={() => { setMenuOpen(false); actions.startRename() }} className="block w-full px-3 py-2 text-left hover:bg-parchment/10">重命名</button>
          <button data-testid="topic-archive-action" onClick={() => { setMenuOpen(false); void actions.archive() }} className="block w-full px-3 py-2 text-left hover:bg-parchment/10">归档</button>
        </div>
      )}
      {actions.pendingReport && (
        <button data-testid="topic-pending-report-badge" onClick={event => { event.stopPropagation(); actions.openPendingReport() }} className="absolute left-2 top-10 z-10 rounded bg-ember px-2 py-1 text-[10px] text-ink">新报告</button>
      )}
      {actions.pendingReport && actions.reportOpen && <ArchiveReportModal result={actions.pendingReport} onClose={actions.closePendingReport} />}
    </div>
  )
}
