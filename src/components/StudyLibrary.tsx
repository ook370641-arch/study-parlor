import { useState } from 'react'
import { useStore } from '@/store'
import type { SessionMeta, TopicMeta } from '@shared/index'
import { SessionViewer } from './SessionViewer'

type ViewerState = {
  dirName: string
  sessionNumber: number
  fileName: string
  title: string
} | null

function SessionRow({
  dirName,
  session,
  onViewFile,
  onReview
}: {
  dirName: string
  session: SessionMeta
  onViewFile: (v: ViewerState) => void
  onReview: () => void
}) {
  const dateStr = session.date.slice(0, 10).replace(/-/g, '.')
  const reviewed = session.hasReview

  const fileButtons: { label: string; fileName: string; disabled: boolean }[] = [
    { label: '学习\n报告', fileName: 'report.md', disabled: !session.hasReport },
    { label: '原始\n对话', fileName: 'transcript.md', disabled: !session.hasTranscript },
    { label: '寓言', fileName: 'fable.md', disabled: !session.hasFable },
    { label: '图片', fileName: 'image.png', disabled: !session.hasImage && !session.hasFableImage },
  ]

  return (
    <div className="flex items-center gap-3 py-2 px-3 border-b border-slate/20 last:border-b-0">
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-xs text-parchment/50 font-sans">
          s{session.sessionNumber}
        </span>
        <span className="text-xs text-parchment/40 font-sans">{dateStr}</span>
        <span className={`text-[10px] px-1.5 py-0.5 rounded font-sans ${
          reviewed
            ? 'text-ember bg-ember/10'
            : 'text-parchment/40 bg-ink'
        }`}>
          {reviewed ? '✓ 已复习' : '✕ 未复习'}
        </span>
      </div>

      <div className="flex-1" />

      <div className="flex items-center gap-1.5 shrink-0">
        {fileButtons.map((btn) => (
          <button
            key={btn.fileName}
            disabled={btn.disabled}
            onClick={() =>
              !btn.disabled &&
              onViewFile({
                dirName,
                sessionNumber: session.sessionNumber,
                fileName: btn.fileName,
                title: `${btn.label.replace('\n', '')} · s${session.sessionNumber}`,
              })
            }
            className={`px-2 py-1 text-[10px] font-sans leading-tight whitespace-pre rounded border transition-colors ${
              btn.disabled
                ? 'opacity-30 cursor-not-allowed border-slate/20 text-parchment/40'
                : 'border-slate/30 text-parchment/70 hover:border-ember'
            }`}
          >
            {btn.label}
          </button>
        ))}

        {reviewed ? (
          <button
            onClick={() =>
              onViewFile({
                dirName,
                sessionNumber: session.sessionNumber,
                fileName: 'review.md',
                title: `复习报告 · s${session.sessionNumber}`,
              })
            }
            className="px-2 py-1 text-[10px] font-sans leading-tight whitespace-pre rounded border border-ember bg-ember/10 text-ember/80 hover:bg-ember hover:text-ink transition-colors"
          >
            {'复习\n报告'}
          </button>
        ) : (
          <button
            onClick={onReview}
            className="px-2 py-1 text-[10px] font-sans leading-tight whitespace-pre rounded border border-ember text-ember hover:bg-ember hover:text-ink transition-colors"
          >
            {'开始\n复习'}
          </button>
        )}
      </div>
    </div>
  )
}

function TopicAccordion({
  topic,
  onViewFile,
}: {
  topic: TopicMeta
  onViewFile: (v: ViewerState) => void
}) {
  const [open, setOpen] = useState(false)
  const openPreStudy = useStore((s) => s.openPreStudy)

  const daysText =
    topic.last_studied_days === 0
      ? '今天'
      : topic.last_studied_days === 1
        ? '昨天'
        : `${topic.last_studied_days}天前`

  return (
    <div className="border border-slate/30 rounded overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 px-4 py-3 bg-ink/40 hover:bg-ink/60 transition-colors text-left"
      >
        <span
          className={`text-parchment/50 text-xs transition-transform ${open ? 'rotate-90' : ''}`}
        >
          ▶
        </span>
        <span className="font-serif text-parchment/90 truncate">{topic.title}</span>
        <span className="text-xs text-parchment/40 font-sans shrink-0">
          {topic.sessionCount} 个 session
        </span>
        <span className="text-xs text-parchment/30 font-sans shrink-0">{daysText}</span>

        <div className="flex-1" />

        <button
          onClick={(e) => {
            e.stopPropagation()
            openPreStudy({
              mode: 'progress',
              topic: topic.title,
              dirName: topic.dirName,
            })
          }}
          className="text-[10px] font-sans px-2 py-1 rounded border border-slate/30 text-parchment/60 hover:border-ember hover:text-ember transition-colors shrink-0"
        >
          继续学习（第{topic.sessionCount + 1}次）
        </button>
      </button>

      {open && (
        <div className="bg-ink/20">
          {topic.sessions.map((s) => (
            <SessionRow
              key={s.sessionNumber}
              dirName={topic.dirName}
              session={s}
              onViewFile={onViewFile}
              onReview={() =>
                openPreStudy({
                  mode: 'review',
                  topic: topic.title,
                  dirName: topic.dirName,
                })
              }
            />
          ))}
        </div>
      )}
    </div>
  )
}

export function StudyLibrary() {
  const library = useStore((s) => s.library)
  const [viewer, setViewer] = useState<ViewerState>(null)

  if (library.length === 0) {
    return (
      <div className="text-center text-parchment/40 font-sans text-sm py-8">
        学习库为空
      </div>
    )
  }

  return (
    <>
      <div className="flex flex-col gap-2">
        {library.map((topic) => (
          <TopicAccordion key={topic.dirName} topic={topic} onViewFile={setViewer} />
        ))}
      </div>

      {viewer && (
        <SessionViewer
          dirName={viewer.dirName}
          sessionNumber={viewer.sessionNumber}
          fileName={viewer.fileName}
          title={viewer.title}
          onClose={() => setViewer(null)}
        />
      )}
    </>
  )
}
