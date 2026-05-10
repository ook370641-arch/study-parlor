import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { useStore } from '@/store'
import type { SessionMeta, TopicMeta } from '@shared/index'
import { SessionViewer } from './SessionViewer'
import { GroupRibbon } from './GroupRibbon'
import { GravityField } from './GravityField'

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

  const fileButtons: { label: string; fileName: string | undefined; disabled: boolean }[] = [
    { label: '学习报告', fileName: session.reportFile, disabled: !session.hasReport || !session.reportFile },
    { label: '原始对话', fileName: session.transcriptFile, disabled: !session.hasTranscript || !session.transcriptFile },
    { label: '寓言', fileName: session.fableFile, disabled: !session.hasFable || !session.fableFile },
    { label: '图片', fileName: session.imageFile || session.fableImageFile, disabled: (!session.hasImage && !session.hasFableImage) || (!session.imageFile && !session.fableImageFile) },
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

      <div className="flex flex-row gap-1.5 shrink-0">
        {fileButtons.map((btn) => (
          <button
            key={btn.label}
            disabled={btn.disabled}
            onClick={() =>
              !btn.disabled && btn.fileName &&
              onViewFile({
                dirName,
                sessionNumber: session.sessionNumber,
                fileName: btn.fileName,
                title: `${btn.label} · s${session.sessionNumber}`,
              })
            }
            className={`px-2 py-1 text-[10px] font-sans leading-tight rounded border transition-colors min-h-[36px] flex items-center justify-center whitespace-nowrap ${
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
              session.reviewFile &&
              onViewFile({
                dirName,
                sessionNumber: session.sessionNumber,
                fileName: session.reviewFile,
                title: `复习报告 · s${session.sessionNumber}`,
              })
            }
            className="px-2 py-1 text-[10px] font-sans leading-tight rounded border border-ember bg-ember/10 text-ember/80 hover:bg-ember hover:text-ink transition-colors min-h-[36px] flex items-center justify-center whitespace-nowrap"
          >
            复习报告
          </button>
        ) : (
          <button
            onClick={onReview}
            className="px-2 py-1 text-[10px] font-sans leading-tight rounded border border-ember text-ember hover:bg-ember hover:text-ink transition-colors min-h-[36px] flex items-center justify-center whitespace-nowrap"
          >
            开始复习
          </button>
        )}
      </div>
    </div>
  )
}

function TopicAccordion({
  topic,
  onViewFile,
  groupColor,
  onDragStart,
}: {
  topic: TopicMeta
  onViewFile: (v: ViewerState) => void
  groupColor: string
  onDragStart?: (topic: TopicMeta, startX: number, startY: number) => void
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
      <div
        onClick={() => setOpen(!open)}
        onMouseDown={(e) => {
          if (e.button === 0 && onDragStart) {
            onDragStart(topic, e.clientX, e.clientY)
          }
        }}
        className="w-full flex items-center gap-3 px-4 py-3 bg-ink/40 hover:bg-ink/60 transition-colors cursor-pointer"
      >
        <div
          className="w-[3px] h-5 rounded-full shrink-0"
          style={{ backgroundColor: groupColor }}
        />
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
      </div>

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
  const groups = useStore((s) => s.groups)
  const activeGroupId = useStore((s) => s.activeGroupId)
  const gravityFieldOpen = useStore((s) => s.gravityFieldOpen)
  const setActiveGroup = useStore((s) => s.setActiveGroup)
  const moveTopicToGroup = useStore((s) => s.moveTopicToGroup)
  const createGroup = useStore((s) => s.createGroup)
  const renameGroup = useStore((s) => s.renameGroup)
  const deleteGroup = useStore((s) => s.deleteGroup)
  const setGravityFieldOpen = useStore((s) => s.setGravityFieldOpen)
  const setDraggingTopic = useStore((s) => s.setDraggingTopic)

  const [viewer, setViewer] = useState<ViewerState>(null)
  const [dragState, setDragState] = useState<{
    topic: TopicMeta
    startX: number
    startY: number
    currentX: number
    currentY: number
    active: boolean
  } | null>(null)

  const containerRef = useRef<HTMLDivElement>(null)
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 })

  // ResizeObserver
  useEffect(() => {
    if (!containerRef.current) return
    const el = containerRef.current
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerSize({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        })
      }
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // Global mouse events for drag
  useEffect(() => {
    if (!dragState?.active) return

    const handleMouseMove = (e: MouseEvent) => {
      setDragState((s) =>
        s ? { ...s, currentX: e.clientX, currentY: e.clientY } : null
      )
    }

    const handleMouseUp = async (e: MouseEvent) => {
      if (!dragState) return
      setGravityFieldOpen(false)
      setDraggingTopic(null)

      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect()
        const relativeX = e.clientX - rect.left
        const relativeY = e.clientY - rect.top

        const count = groups.length
        const cx = rect.width / 2
        const cy = rect.height / 2
        const radius = Math.min(rect.width, rect.height) * 0.3

        let nearestGroupId: string | null = null
        let minDist = Infinity

        groups.forEach((group, i) => {
          const angle = (2 * Math.PI * i) / count - Math.PI / 2
          const gx = cx + radius * Math.cos(angle)
          const gy = cy + radius * Math.sin(angle)
          const dist = Math.hypot(relativeX - gx, relativeY - gy)
          if (dist < minDist) {
            minDist = dist
            nearestGroupId = group.id
          }
        })

        if (nearestGroupId && minDist < 72) {
          await moveTopicToGroup(dragState.topic.dirName, nearestGroupId)
        }
      }

      setDragState(null)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [dragState?.active, groups, moveTopicToGroup, setGravityFieldOpen, setDraggingTopic])

  const handleDragStart = useCallback(
    (topic: TopicMeta, startX: number, startY: number) => {
      setDragState({
        topic,
        startX,
        startY,
        currentX: startX,
        currentY: startY,
        active: false,
      })
    },
    []
  )

  // Detect drag after 6px movement
  useEffect(() => {
    if (!dragState || dragState.active) return
    const dist = Math.hypot(
      dragState.currentX - dragState.startX,
      dragState.currentY - dragState.startY
    )
    if (dist > 6) {
      setDragState((s) => (s ? { ...s, active: true } : null))
      setGravityFieldOpen(true)
      setDraggingTopic(dragState.topic)
    }
  }, [dragState, setGravityFieldOpen, setDraggingTopic])

  // Filter and sort topics
  const displayTopics = useMemo(() => {
    let filtered = library
    if (activeGroupId) {
      filtered = library.filter((t) => t.groupId === activeGroupId)
    }
    const groupIndexMap = new Map(groups.map((g, i) => [g.id, i]))
    return [...filtered].sort((a, b) => {
      const ai = groupIndexMap.get(a.groupId) ?? Infinity
      const bi = groupIndexMap.get(b.groupId) ?? Infinity
      if (ai !== bi) return ai - bi
      return (
        new Date(b.last_studied).getTime() - new Date(a.last_studied).getTime()
      )
    })
  }, [library, activeGroupId, groups])

  // Group color lookup
  const groupColorMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const g of groups) {
      map.set(g.id, g.color)
    }
    map.set('default', '#d97757')
    return map
  }, [groups])

  if (library.length === 0) {
    return (
      <div className="text-center text-parchment/40 font-sans text-sm py-8">
        学习库为空
      </div>
    )
  }

  const dragPosition =
    dragState && containerRef.current
      ? {
          x: dragState.currentX - containerRef.current.getBoundingClientRect().left,
          y: dragState.currentY - containerRef.current.getBoundingClientRect().top,
        }
      : null

  return (
    <div ref={containerRef} className="relative">
      <GroupRibbon
        groups={groups}
        activeGroupId={activeGroupId}
        onSelect={setActiveGroup}
        onCreate={createGroup}
        onRename={renameGroup}
        onDelete={deleteGroup}
      />

      <div className="mt-3 flex flex-col gap-2 relative">
        {gravityFieldOpen && (
          <GravityField
            groups={groups}
            topics={library}
            draggingTopic={dragState?.topic ?? null}
            dragPosition={dragPosition}
            containerWidth={containerSize.width}
            containerHeight={containerSize.height}
          />
        )}

        {displayTopics.map((topic) => (
          <TopicAccordion
            key={topic.dirName}
            topic={topic}
            onViewFile={setViewer}
            groupColor={groupColorMap.get(topic.groupId) || '#d97757'}
            onDragStart={handleDragStart}
          />
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
    </div>
  )
}
