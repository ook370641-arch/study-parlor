import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { useStore } from '@/store'
import { ipc } from '@/lib/ipc'
import type { SessionMeta, TopicMeta } from '@shared/index'
import { SessionViewer } from './SessionViewer'
import { GroupRibbon } from './GroupRibbon'
import { GravityField } from './GravityField'
import { ConfirmDialog } from './ConfirmDialog'
import { ReviewFlash } from './ReviewFlash'
import { FableStyleDialog } from './FableStyleDialog'

const PAGE_SIZE = 9

function stripFrontmatter(content: string): string {
  const match = content.match(/^---\n[\s\S]*?\n---\n?/)
  return match ? content.slice(match[0].length) : content
}

type ViewerState = {
  dirName: string
  sessionNumber: number
  fileName: string
  title: string
  version: number
} | null

function SessionRow({
  dirName,
  session,
  onViewFile,
  onReview,
  onDelete,
  generatingFables,
  onGenerateFable,
  generatingDiagrams,
  onGenerateDiagram,
  isPending,
}: {
  dirName: string
  session: SessionMeta
  onViewFile: (v: ViewerState) => void
  onReview: (session: SessionMeta) => void
  onDelete?: (dirName: string, sessionNumber: number) => void
  generatingFables: Set<string>
  onGenerateFable: (dirName: string, sessionNumber: number) => void
  generatingDiagrams: Set<string>
  onGenerateDiagram: (dirName: string, sessionNumber: number) => void
  isPending?: boolean
}) {
  const theme = useStore((s) => s.briefingTheme)
  const isAcademic = theme !== 'newspaper'
  const dateStr = session.date.slice(0, 10).replace(/-/g, '.')
  const reviewed = session.hasReview

  const fileButtons: { label: string; fileName: string | undefined; disabled: boolean }[] = [
    { label: '谈话记录', fileName: session.reportFile, disabled: !session.hasReport || !session.reportFile },
  ]

  const fableKey = `${dirName}-s${session.sessionNumber}`
  const isGeneratingFable = generatingFables.has(fableKey)
  const diagramKey = `${dirName}-s${session.sessionNumber}`
  const isGeneratingDiagram = generatingDiagrams.has(diagramKey)

  return (
    <div className={`flex items-center gap-3 py-2 px-3 border-b ${isAcademic ? 'border-slate/20' : 'border-[#1a1a1a]/8'} last:border-b-0 ${isPending ? 'opacity-60' : ''}`}>
      <div className="flex items-center gap-2 shrink-0">
        <span className={`text-xs ${isAcademic ? 'text-parchment/50' : 'text-[#777]'} font-sans`}>
          第{session.sessionNumber}
        </span>
        <span className={`text-xs ${isAcademic ? 'text-parchment/40' : 'text-[#999]'} font-sans`}>{dateStr}</span>
        <span className={`text-[10px] px-1.5 py-0.5 rounded font-sans ${
          isPending
            ? 'text-parchment/50 bg-ink'
            : reviewed
              ? isAcademic ? 'text-ember bg-ember/10' : 'text-[#1a1a1a] bg-[#1a1a1a]/5'
              : 'text-parchment/40 bg-ink'
        }`}>
          {isPending ? '⟳ 归档中' : reviewed ? '✓ 已复检' : '✕ 未复检'}
        </span>
      </div>

      <div className="flex-1" />

      <div className="flex flex-row gap-1.5 shrink-0">
        {fileButtons.map((btn) => (
          <button
            data-testid={btn.label === '谈话记录' ? 'session-file-button' : undefined}
            key={btn.label}
            disabled={btn.disabled || isPending}
            onClick={() =>
              !btn.disabled && btn.fileName &&
              onViewFile({
                dirName,
                sessionNumber: session.sessionNumber,
                fileName: btn.fileName,
                title: `${btn.label} · 第${session.sessionNumber}`,
                version: 0,
              })
            }
            className={`px-2 py-1 text-[10px] font-sans leading-tight rounded border transition-colors min-h-[36px] flex items-center justify-center whitespace-nowrap ${
              btn.disabled || isPending
                ? `opacity-30 cursor-not-allowed ${isAcademic ? 'border-slate/20 text-parchment/40' : 'border-[#1a1a1a]/10 text-[#ccc]'}`
                : `${isAcademic ? 'border-slate/30 text-parchment/70' : 'border-[#1a1a1a]/15 text-[#555]'} ${isAcademic ? 'hover:border-ember' : 'hover:border-[#1a1a1a]/25'}`
            }`}
          >
            {isPending && btn.label === '谈话记录' ? (
              <><span className="inline-block animate-spin mr-1">⟳</span>整理中</>
            ) : btn.label}
          </button>
        ))}

        {/* 图表按钮 */}
        {isGeneratingDiagram ? (
          <button
            disabled
            className={`px-2 py-1 text-[10px] font-sans leading-tight rounded border transition-colors min-h-[36px] flex items-center justify-center whitespace-nowrap ${isAcademic ? 'border-ember/40 text-ember/80 bg-ember/10' : 'border-[#1a1a1a]/15 text-[#1a1a1a] bg-[#1a1a1a]/5'}`}
          >
            <span className="inline-block animate-spin mr-1">⟳</span>生成中...
          </button>
        ) : session.hasDiagram && session.diagramFile ? (
          <button
            data-testid="session-diagram-button"
            onClick={() =>
              onViewFile({
                dirName,
                sessionNumber: session.sessionNumber,
                fileName: session.diagramFile!,
                title: `图表 · 第${session.sessionNumber}`,
                version: 0,
              })
            }
            className={`px-2 py-1 text-[10px] font-sans leading-tight rounded border ${isAcademic ? 'border-slate/30 text-parchment/70' : 'border-[#1a1a1a]/15 text-[#555]'} ${isAcademic ? 'hover:border-ember' : 'hover:border-[#1a1a1a]/25'} transition-colors min-h-[36px] flex items-center justify-center whitespace-nowrap`}
          >
            图表
          </button>
        ) : !isPending && session.hasReport && session.reportFile ? (
          <button
            data-testid="generate-diagram-button"
            onClick={() => onGenerateDiagram(dirName, session.sessionNumber)}
            className={`px-2 py-1 text-[10px] font-sans leading-tight rounded border ${isAcademic ? 'border-slate/30 text-parchment/70' : 'border-[#1a1a1a]/15 text-[#555]'} ${isAcademic ? 'hover:border-ember' : 'hover:border-[#1a1a1a]/25'} transition-colors min-h-[36px] flex items-center justify-center whitespace-nowrap`}
          >
            📊 生成图表
          </button>
        ) : (
          <button
            data-testid="session-diagram-button"
            disabled
            className={`px-2 py-1 text-[10px] font-sans leading-tight rounded border ${isAcademic ? 'border-slate/20 text-parchment/40' : 'border-[#1a1a1a]/10 text-[#ccc]'} opacity-30 cursor-not-allowed min-h-[36px] flex items-center justify-center whitespace-nowrap`}
          >
            图表
          </button>
        )}

        {/* 寓言按钮 */}
        {isPending ? (
          <button
            data-testid="session-fable-button"
            disabled
            className={`px-2 py-1 text-[10px] font-sans leading-tight rounded border ${isAcademic ? 'border-slate/20 text-parchment/40' : 'border-[#1a1a1a]/10 text-[#ccc]'} opacity-30 cursor-not-allowed min-h-[36px] flex items-center justify-center whitespace-nowrap`}
          >
            寓言
          </button>
        ) : isGeneratingFable ? (
          <button
            onClick={() => onGenerateFable(dirName, session.sessionNumber)}
            className={`px-2 py-1 text-[10px] font-sans leading-tight rounded border transition-colors min-h-[36px] flex items-center justify-center whitespace-nowrap ${isAcademic ? 'border-ember/40 text-ember/80 bg-ember/10 hover:bg-ember/20' : 'border-[#1a1a1a]/15 text-[#1a1a1a] bg-[#1a1a1a]/5 hover:bg-[#1a1a1a]/8'}`}
          >
            <span className="inline-block animate-spin mr-1">⟳</span>正在书写...
          </button>
        ) : session.hasFable ? (
          <button
            data-testid="session-fable-button"
            onClick={() =>
              session.fableFile &&
              onViewFile({
                dirName,
                sessionNumber: session.sessionNumber,
                fileName: session.fableFile,
                title: `寓言 · 第${session.sessionNumber}`,
                version: 0,
              })
            }
            className={`px-2 py-1 text-[10px] font-sans leading-tight rounded border ${isAcademic ? 'border-slate/30 text-parchment/70' : 'border-[#1a1a1a]/15 text-[#555]'} ${isAcademic ? 'hover:border-ember' : 'hover:border-[#1a1a1a]/25'} transition-colors min-h-[36px] flex items-center justify-center whitespace-nowrap`}
          >
            寓言
          </button>
        ) : session.hasReport ? (
          <button
            data-testid="generate-fable-button"
            onClick={() => onGenerateFable(dirName, session.sessionNumber)}
            className={`px-2 py-1 text-[10px] font-sans leading-tight rounded border transition-colors min-h-[36px] flex items-center justify-center whitespace-nowrap ${isAcademic ? 'border-ember/40 text-ember/80 bg-ember/10 hover:border-ember hover:bg-ember/20 hover:text-ember' : 'border-[#1a1a1a]/15 text-[#1a1a1a] bg-[#1a1a1a]/5 hover:border-[#1a1a1a]/25 hover:bg-[#1a1a1a]/8 hover:text-[#1a1a1a]'}`}
          >
            ✨ 唤醒寓言
          </button>
        ) : (
          <button
            data-testid="session-fable-button"
            disabled
            className={`px-2 py-1 text-[10px] font-sans leading-tight rounded border ${isAcademic ? 'border-slate/20 text-parchment/40' : 'border-[#1a1a1a]/10 text-[#ccc]'} opacity-30 cursor-not-allowed min-h-[36px] flex items-center justify-center whitespace-nowrap`}
          >
            寓言
          </button>
        )}

        {isPending ? (
          <button
            disabled
            className={`px-2 py-1 text-[10px] font-sans leading-tight rounded border ${isAcademic ? 'border-slate/20 text-parchment/40' : 'border-[#1a1a1a]/10 text-[#ccc]'} opacity-30 cursor-not-allowed min-h-[36px] flex items-center justify-center whitespace-nowrap`}
          >
            复习
          </button>
        ) : reviewed ? (
          <button
            onClick={() =>
              session.reviewFile &&
              onViewFile({
                dirName,
                sessionNumber: session.sessionNumber,
                fileName: session.reviewFile,
                title: `复检记录 · 第${session.sessionNumber}`,
                version: 0,
              })
            }
            className={`px-2 py-1 text-[10px] font-sans leading-tight rounded border transition-colors min-h-[36px] flex items-center justify-center whitespace-nowrap ${isAcademic ? 'border-ember bg-ember/10 text-ember/80 hover:bg-ember hover:text-ink' : 'border-[#1a1a1a] bg-[#1a1a1a]/5 text-[#1a1a1a] hover:bg-[#1a1a1a] hover:text-white'}`}
          >
            复检记录
          </button>
        ) : (
          <button
            data-testid="session-review-button"
            onClick={() => onReview(session)}
            className={`px-2 py-1 text-[10px] font-sans leading-tight rounded border transition-colors min-h-[36px] flex items-center justify-center whitespace-nowrap ${isAcademic ? 'border-ember text-ember hover:bg-ember hover:text-ink' : 'border-[#1a1a1a] text-[#1a1a1a] hover:bg-[#1a1a1a] hover:text-white'}`}
          >
            复习
          </button>
        )}

        {onDelete && (
          <button
            data-testid="delete-session-button"
            onClick={() => onDelete(dirName, session.sessionNumber)}
            className="w-[18px] h-[18px] flex items-center justify-center rounded text-wine/40 hover:text-wine hover:bg-wine/15 transition-all ml-1 shrink-0"
            title="注销此份"
          >
            ✕
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
  onDeleteSession,
  onReviewSession,
  generatingFables,
  onGenerateFable,
  generatingDiagrams,
  onGenerateDiagram,
  pendingSessionNumbers,
}: {
  topic: TopicMeta
  onViewFile: (v: ViewerState) => void
  groupColor: string
  onDragStart?: (topic: TopicMeta, startX: number, startY: number) => void
  onDeleteSession?: (dirName: string, sessionNumber: number) => void
  onReviewSession?: (session: SessionMeta, topic: TopicMeta) => void
  generatingFables: Set<string>
  onGenerateFable: (dirName: string, sessionNumber: number) => void
  generatingDiagrams: Set<string>
  onGenerateDiagram: (dirName: string, sessionNumber: number) => void
  pendingSessionNumbers?: Set<number>
}) {
  const theme = useStore((s) => s.briefingTheme)
  const isAcademic = theme !== 'newspaper'
  const [open, setOpen] = useState(false)
  const openPreStudy = useStore((s) => s.openPreStudy)

  const handleToggle = () => {
    setOpen(!open)
  }

  const daysText =
    topic.last_studied_days === 0
      ? '今天'
      : topic.last_studied_days === 1
        ? '昨天'
        : `${topic.last_studied_days}天前`

  return (
    <div data-testid="topic-card" className={`${isAcademic ? 'bg-ink/70 border-slate/40' : 'bg-white border-[#1a1a1a]/12'} backdrop-blur-md border rounded overflow-hidden shrink-0`}>
      <div
        onClick={handleToggle}
        onMouseDown={(e) => {
          if (e.button === 0 && onDragStart) {
            e.preventDefault()
            window.getSelection()?.removeAllRanges()
            onDragStart(topic, e.clientX, e.clientY)
          }
        }}
        role="button"
        aria-expanded={open}
        aria-controls="topic-content"
        className={`w-full flex items-center gap-3 px-4 py-3 ${isAcademic ? 'hover:bg-ink/30' : 'hover:bg-[#f5f5f0]'} transition-colors cursor-pointer select-none`}
      >
        <div
          className="w-[3px] h-5 rounded-full shrink-0"
          style={{ backgroundColor: groupColor }}
        />
        <span
          className={`${isAcademic ? 'text-parchment/50' : 'text-[#999]'} text-xs transition-transform ${open ? 'rotate-90' : ''}`}
        >
          ▶
        </span>
        <span className={`font-serif ${isAcademic ? 'text-parchment/90' : 'text-[#1a1a1a]'} truncate`}>{topic.title}</span>
        <span className={`text-xs ${isAcademic ? 'text-parchment/40' : 'text-[#999]'} font-sans shrink-0`}>
          <strong>{topic.sessionCount}</strong> 份记录
        </span>
        <span className={`text-xs ${isAcademic ? 'text-parchment/30' : 'text-[#bbb]'} font-sans shrink-0`}>{daysText}</span>

        <div className="flex-1" />

        <button
          data-testid="topic-continue-button"
          onClick={(e) => {
            e.stopPropagation()
            openPreStudy({
              mode: 'progress',
              topic: topic.title,
              dirName: topic.dirName,
            })
          }}
          className={`text-[10px] font-sans px-2 py-1 rounded border transition-colors shrink-0 ${isAcademic ? 'border-slate/30 text-parchment/60 hover:border-ember hover:text-ember' : 'border-[#1a1a1a]/15 text-[#555] hover:border-[#1a1a1a]/25 hover:text-[#1a1a1a]'}`}
        >
          续谈（第{topic.sessionCount + 1}次）
        </button>
      </div>

      <div id="topic-content" className={`${isAcademic ? 'bg-ink/30' : 'bg-[#f5f5f0]'} overflow-hidden transition-all duration-300 ease-out ${open ? 'max-h-[200px] opacity-100' : 'max-h-0 opacity-0'}`}>
        <div className="max-h-[160px] overflow-y-auto overflow-x-hidden" style={{ scrollbarColor: 'rgba(148,163,184,0.4) transparent', scrollbarWidth: 'thin' }}>
          {topic.sessions.map((s) => (
            <SessionRow
              key={s.sessionNumber}
              dirName={topic.dirName}
              session={s}
              onViewFile={onViewFile}
              onReview={(session) =>
                onReviewSession?.(session, topic)
              }
              onDelete={onDeleteSession}
              generatingFables={generatingFables}
              onGenerateFable={onGenerateFable}
              generatingDiagrams={generatingDiagrams}
              onGenerateDiagram={onGenerateDiagram}
              isPending={pendingSessionNumbers?.has(s.sessionNumber)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

export function StudyLibrary() {
  const theme = useStore((s) => s.briefingTheme)
  const isAcademic = theme !== 'newspaper'
  const library = useStore((s) => s.library)
  const pendingArchives = useStore((s) => s.pendingArchives)
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
  const fableStyleTags = useStore((s) => s.fableStyleTags)
  const lastFableTags = useStore((s) => s.lastFableTags)
  const setLastFableTags = useStore((s) => s.setLastFableTags)

  const [viewer, setViewer] = useState<ViewerState>(null)
  const [dragState, setDragState] = useState<{
    topic: TopicMeta
    startX: number
    startY: number
    currentX: number
    currentY: number
    active: boolean
  } | null>(null)
  const [deleteDialog, setDeleteDialog] = useState<{
    dirName: string
    sessionNumber: number
    topicName: string
    files: string[]
  } | null>(null)
  const deleteArchivedSession = useStore((s) => s.deleteArchivedSession)
  const openPreStudy = useStore((s) => s.openPreStudy)

  const [reviewFlash, setReviewFlash] = useState<null | {
    title: string
    date: string
    topic: string
    dirName: string
  }>(null)

  const [generatingFables, setGeneratingFables] = useState<Set<string>>(new Set())
  const generatingFablesRef = useRef(generatingFables)
  generatingFablesRef.current = generatingFables

  const [generatingDiagrams, setGeneratingDiagrams] = useState<Set<string>>(new Set())
  const generatingDiagramsRef = useRef(generatingDiagrams)
  generatingDiagramsRef.current = generatingDiagrams

  const [styleDialogOpen, setStyleDialogOpen] = useState(false)
  const [pendingFable, setPendingFable] = useState<{ dirName: string; sessionNumber: number } | null>(null)

  const handleReviewSession = useCallback((session: SessionMeta, topic: TopicMeta) => {
    const dateStr = session.date.slice(0, 10).replace(/-/g, '.')
    setReviewFlash({
      title: topic.title,
      date: dateStr,
      topic: topic.title,
      dirName: topic.dirName,
    })
  }, [])

  const enterReview = useCallback(() => {
    if (!reviewFlash) return
    openPreStudy({
      mode: 'review',
      topic: reviewFlash.topic,
      dirName: reviewFlash.dirName,
    })
    setReviewFlash(null)
  }, [reviewFlash, openPreStudy])

  const dragStateRef = useRef(dragState)
  dragStateRef.current = dragState

  // Global mouse events for drag
  useEffect(() => {
    if (!dragState) return

    const handleMouseMove = (e: MouseEvent) => {
      setDragState((s) => {
        if (!s) return null
        // Detect drag activation (> 6px movement)
        if (!s.active) {
          const dist = Math.hypot(e.clientX - s.startX, e.clientY - s.startY)
          if (dist > 6) {
            setGravityFieldOpen(true)
            setDraggingTopic(s.topic)
            return { ...s, currentX: e.clientX, currentY: e.clientY, active: true }
          }
        }
        return { ...s, currentX: e.clientX, currentY: e.clientY }
      })
    }

    const handleMouseUp = async (e: MouseEvent) => {
      const ds = dragStateRef.current
      if (!ds) return
      setGravityFieldOpen(false)
      setDraggingTopic(null)

      if (ds.active) {
        const count = groups.length
        const cx = window.innerWidth / 2
        const cy = window.innerHeight / 2
        const radius = Math.min(window.innerWidth, window.innerHeight) * 0.3

        let nearestGroupId: string | null = null
        let minDist = Infinity

        groups.forEach((group, i) => {
          const angle = (2 * Math.PI * i) / count - Math.PI / 2
          const gx = cx + radius * Math.cos(angle)
          const gy = cy + radius * Math.sin(angle)
          const dist = Math.hypot(e.clientX - gx, e.clientY - gy)
          if (dist < minDist) {
            minDist = dist
            nearestGroupId = group.id
          }
        })

        if (nearestGroupId && minDist < 72) {
          await moveTopicToGroup(ds.topic.dirName, nearestGroupId)
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
  }, [!!dragState, groups, moveTopicToGroup, setGravityFieldOpen, setDraggingTopic])

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

  const handleGenerateDiagramClick = useCallback(async (dirName: string, sessionNumber: number) => {
    const key = `${dirName}-s${sessionNumber}`

    if (generatingDiagramsRef.current.has(key)) return

    const topicMeta = library.find(t => t.dirName === dirName)
    const session = topicMeta?.sessions.find(s => s.sessionNumber === sessionNumber)
    if (!session?.reportFile) {
      useStore.getState().showToast('谈话记录不存在，无法生成图表')
      return
    }

    setGeneratingDiagrams(prev => new Set(prev).add(key))

    try {
      const report = await ipc.readSessionFile({
        dirName,
        sessionNumber,
        fileName: session.reportFile
      })
      await ipc.llmGenerateDiagram({
        dirName,
        sessionNumber,
        reportBody: report.content
      })
      const lib = await ipc.scanLibrary()
      useStore.setState({ library: lib })
    } catch (e) {
      console.error('[StudyLibrary] generate diagram failed:', e)
      useStore.getState().showToast('图表生成失败')
    } finally {
      setGeneratingDiagrams(prev => {
        const next = new Set(prev)
        next.delete(key)
        return next
      })
    }
  }, [library])

  const handleGenerateFableClick = useCallback((dirName: string, sessionNumber: number) => {
    const key = `${dirName}-s${sessionNumber}`

    // 如果正在生成中，点击表示取消
    if (generatingFablesRef.current.has(key)) {
      setGeneratingFables(prev => {
        const next = new Set(prev)
        next.delete(key)
        return next
      })
      return
    }

    const topicMeta = library.find(t => t.dirName === dirName)
    const session = topicMeta?.sessions.find(s => s.sessionNumber === sessionNumber)
    if (!session?.reportFile) {
      useStore.getState().showToast('谈话记录不存在，无法唤醒寓言')
      return
    }

    setPendingFable({ dirName, sessionNumber })
    setStyleDialogOpen(true)
  }, [library])

  const handleStyleConfirm = useCallback(async (selectedTags: string[], description: string) => {
    if (!pendingFable) return
    const { dirName, sessionNumber } = pendingFable
    const key = `${dirName}-s${sessionNumber}`

    // 保存上次选中的标签
    setLastFableTags(selectedTags)

    // 构建 userPrompt
    const tagsText = selectedTags.join('、')
    const desc = description.trim()
    let userPrompt = ''
    if (tagsText && desc) {
      userPrompt = `风格：${tagsText}。${desc}`
    } else if (tagsText) {
      userPrompt = `风格：${tagsText}`
    } else if (desc) {
      userPrompt = desc
    }

    setStyleDialogOpen(false)
    setPendingFable(null)
    setGeneratingFables(prev => new Set(prev).add(key))

    try {
      const topicMeta = library.find(t => t.dirName === dirName)
      const session = topicMeta?.sessions.find(s => s.sessionNumber === sessionNumber)
      if (!session?.reportFile) {
        useStore.getState().showToast('谈话记录不存在，无法唤醒寓言')
        return
      }

      const { content } = await ipc.readSessionFile({ dirName, sessionNumber, fileName: session.reportFile })
      const reportBody = stripFrontmatter(content)
      const topic = session.title || dirName

      const fable = await ipc.llmGenerateFableFromReport({ reportBody, topic, userPrompt: userPrompt || undefined })
      await ipc.writeFable({ dirName, sessionNumber, title: fable.title, body: fable.body })

      const lib = await ipc.scanLibrary()
      useStore.setState({ library: lib })
      useStore.getState().showToast(`寓言「${fable.title}」已唤醒`)

      // 如果用户正在查看这则寓言，强制重新加载以显示新内容
      setViewer(prev => {
        if (prev && prev.dirName === dirName && prev.sessionNumber === sessionNumber && prev.fileName === '寓言.md') {
          return { ...prev, version: prev.version + 1 }
        }
        return prev
      })
    } catch (err: any) {
      useStore.getState().showToast('寓言书写失败：' + (err?.message ?? err))
    } finally {
      setGeneratingFables(prev => {
        const next = new Set(prev)
        next.delete(key)
        return next
      })
    }
  }, [library, pendingFable, setLastFableTags])

  const handleDeleteClick = useCallback((dirName: string, sessionNumber: number) => {
    const topic = library.find((t) => t.dirName === dirName)
    const session = topic?.sessions.find((s) => s.sessionNumber === sessionNumber)
    if (!topic || !session) return

    const files: string[] = []
    if (session.hasReport) files.push('学习报告.md')
    if (session.hasFable) files.push(`寓言${session.fableCount > 1 ? '(×' + session.fableCount + ')' : ''}.md`)
    if (session.hasDiagram) files.push('学习图表.svg')

    setDeleteDialog({
      dirName,
      sessionNumber,
      topicName: topic.title,
      files
    })
  }, [library])

  // 将后台归档中的占位合并到 library，让用户回到主页后立即可见"归档中"主题
  const mergedLibrary = useMemo(() => {
    const result: TopicMeta[] = library.map(t => ({ ...t, sessions: [...t.sessions] }))
    for (const p of pendingArchives) {
      const existing = result.find(t => t.dirName === p.dirName)
      if (existing) {
        existing.sessions.push({
          sessionNumber: p.sessionNumber,
          date: p.date,
          hasReport: false,
          hasTranscript: false,
          hasReview: false,
          hasFable: false,
          fableCount: 0,
          hasDiagram: false,
        })
        existing.sessionCount = existing.sessions.length
        existing.last_studied = p.date
        existing.last_studied_days = 0
      } else {
        result.push({
          dirName: p.dirName,
          title: p.topic,
          sessionCount: 1,
          sessions: [{
            sessionNumber: p.sessionNumber,
            date: p.date,
            hasReport: false,
            hasTranscript: false,
            hasReview: false,
            hasFable: false,
            fableCount: 0,
            hasDiagram: false,
          }],
          last_studied: p.date,
          last_studied_days: 0,
          groupId: 'default'
        })
      }
    }
    return result
  }, [library, pendingArchives])

  // 构建 pending session 查找映射: dirName -> Set<sessionNumber>
  const pendingSessionMap = useMemo(() => {
    const map = new Map<string, Set<number>>()
    for (const p of pendingArchives) {
      if (!map.has(p.dirName)) map.set(p.dirName, new Set())
      map.get(p.dirName)!.add(p.sessionNumber)
    }
    return map
  }, [pendingArchives])

  // Filter and sort topics
  const displayTopics = useMemo(() => {
    let filtered = mergedLibrary
    if (activeGroupId) {
      filtered = mergedLibrary.filter((t) => t.groupId === activeGroupId)
    }
    const groupIndexMap = new Map(groups.map((g, i) => [g.id, i]))
    return [...filtered].sort((a, b) => {
      const ai = groupIndexMap.get(a.groupId) ?? Infinity
      const bi = groupIndexMap.get(b.groupId) ?? Infinity
      if (ai !== bi) return ai - bi
      if (!a.last_studied && !b.last_studied) return 0
      if (!a.last_studied) return 1
      if (!b.last_studied) return -1
      return (
        new Date(b.last_studied).getTime() - new Date(a.last_studied).getTime()
      )
    })
  }, [mergedLibrary, activeGroupId, groups])

  // Pagination
  const [currentPage, setCurrentPage] = useState(0)

  const totalPages = Math.ceil(displayTopics.length / PAGE_SIZE)

  const paginatedTopics = useMemo(() => {
    const start = currentPage * PAGE_SIZE
    return displayTopics.slice(start, start + PAGE_SIZE)
  }, [displayTopics, currentPage])

  useEffect(() => {
    setCurrentPage((p) => Math.min(p, Math.max(0, totalPages - 1)))
  }, [totalPages])

  // Group color lookup
  const groupColorMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const g of groups) {
      map.set(g.id, g.color)
    }
    map.set('default', '#d97757')
    return map
  }, [groups])

  if (mergedLibrary.length === 0) {
    return (
      <div className="relative flex flex-col flex-1 min-h-0">
        <GroupRibbon
          groups={groups}
          activeGroupId={activeGroupId}
          onSelect={setActiveGroup}
          onCreate={createGroup}
          onRename={renameGroup}
          onDelete={deleteGroup}
        />
        <div className="flex flex-col items-center justify-center py-16 text-center flex-1">
          <p className={`text-lg ${isAcademic ? 'text-parchment/50' : 'text-[#999]'} italic`}>档案室还空着。但空也是一种档案。</p>
          <p className={`text-sm ${isAcademic ? 'text-parchment/30' : 'text-[#aaa]'} mt-2`}>点击上方 <strong className={isAcademic ? 'text-parchment/60' : 'text-[#666]'}>新的小径</strong> 开始学习</p>
        </div>
      </div>
    )
  }

  const dragPosition =
    dragState
      ? { x: dragState.currentX, y: dragState.currentY }
      : null

  return (
    <div className="relative flex flex-col flex-1 min-h-0">
      <GroupRibbon
        groups={groups}
        activeGroupId={activeGroupId}
        onSelect={setActiveGroup}
        onCreate={createGroup}
        onRename={renameGroup}
        onDelete={deleteGroup}
      />

      {totalPages > 1 && (
        <div className={`flex items-center justify-center gap-4 py-2.5 border-b ${isAcademic ? 'border-slate/10' : 'border-[#1a1a1a]/8'}`}>
          <button
            data-testid="pagination-prev"
            onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
            disabled={currentPage === 0}
            aria-label="前一屉"
            className={`text-lg font-bold ${isAcademic ? 'text-parchment/50 hover:text-parchment/90' : 'text-[#888] hover:text-[#1a1a1a]'} disabled:opacity-20 disabled:cursor-default transition-colors px-3 py-1`}
          >
            ←
          </button>
          <div className="flex items-center gap-2.5">
            {(() => {
              const dots: JSX.Element[] = []
              const maxVisible = 7
              let start = 0
              let end = totalPages - 1
              if (totalPages > maxVisible) {
                const half = Math.floor(maxVisible / 2)
                if (currentPage <= half) {
                  end = maxVisible - 1
                } else if (currentPage >= totalPages - half - 1) {
                  start = totalPages - maxVisible
                } else {
                  start = currentPage - half
                  end = currentPage + half
                }
              }
              for (let i = start; i <= end; i++) {
                dots.push(
                  <button
                    data-testid={`pagination-dot-${i}`}
                    key={i}
                    onClick={() => setCurrentPage(i)}
                    aria-label={`第${i + 1}屉`}
                    className={`rounded-full transition-colors ${
                      i === currentPage
                        ? `w-3.5 h-3.5 ${isAcademic ? 'bg-ember' : 'bg-[#1a1a1a]'}`
                        : 'w-2.5 h-2.5 bg-slate/40 hover:bg-slate/60'
                    }`}
                  />
                )
              }
              return dots
            })()}
          </div>
          <button
            data-testid="pagination-next"
            onClick={() => setCurrentPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={currentPage >= totalPages - 1}
            aria-label="后一屉"
            className={`text-lg font-bold ${isAcademic ? 'text-parchment/50 hover:text-parchment/90' : 'text-[#888] hover:text-[#1a1a1a]'} disabled:opacity-20 disabled:cursor-default transition-colors px-3 py-1`}
          >
            →
          </button>
        </div>
      )}

      <div className="flex flex-col gap-2 relative flex-1 min-h-0 overflow-y-auto">
        {gravityFieldOpen && (
          <GravityField
            groups={groups}
            topics={library}
            draggingTopic={dragState?.topic ?? null}
            dragPosition={dragPosition}
          />
        )}

        {paginatedTopics.map((topic) => (
          <TopicAccordion
            key={topic.dirName}
            topic={topic}
            onViewFile={setViewer}
            groupColor={groupColorMap.get(topic.groupId) || '#d97757'}
            onDragStart={handleDragStart}
            onDeleteSession={handleDeleteClick}
            onReviewSession={handleReviewSession}
            generatingFables={generatingFables}
            onGenerateFable={handleGenerateFableClick}
            generatingDiagrams={generatingDiagrams}
            onGenerateDiagram={handleGenerateDiagramClick}
            pendingSessionNumbers={pendingSessionMap.get(topic.dirName)}
          />
        ))}
      </div>

      {viewer && (
        <SessionViewer
          key={viewer.version}
          dirName={viewer.dirName}
          sessionNumber={viewer.sessionNumber}
          fileName={viewer.fileName}
          title={viewer.title}
          onClose={() => setViewer(null)}
          onRegenerateFable={
            viewer.fileName === '寓言.md'
              ? () => {
                  setPendingFable({ dirName: viewer.dirName, sessionNumber: viewer.sessionNumber })
                  setStyleDialogOpen(true)
                }
              : undefined
          }
        />
      )}

      {reviewFlash && (
        <ReviewFlash
          title={reviewFlash.title}
          date={reviewFlash.date}
          onComplete={enterReview}
        />
      )}

      {deleteDialog && (
        <ConfirmDialog
          open={true}
          title="注销谈话记录"
          icon="trash"
          confirmLabel="确认注销"
          confirmVariant="danger"
          onConfirm={() => {
            deleteArchivedSession(deleteDialog.dirName, deleteDialog.sessionNumber)
            setDeleteDialog(null)
          }}
          onCancel={() => setDeleteDialog(null)}
        >
          <>
            即将注销此份记录 <strong style={{ color: '#e8d5b7' }}>{deleteDialog.topicName} / 第{deleteDialog.sessionNumber}</strong>。
            <br /><br />
            {deleteDialog.files.length > 0 && (
              <>
                以下附件将一并销毁：<br />
                <span style={{ color: 'rgba(232,213,183,0.5)' }}>
                  {deleteDialog.files.join(' · ')}
                </span>
                <br /><br />
              </>
            )}
            <span style={{ color: '#8a3a3a', fontWeight: 500 }}>不可撤销。没有副本。没有备份。</span>
          </>
        </ConfirmDialog>
      )}

      <FableStyleDialog
        open={styleDialogOpen}
        tags={fableStyleTags}
        defaultSelected={lastFableTags}
        onClose={() => {
          setStyleDialogOpen(false)
          setPendingFable(null)
        }}
        onConfirm={handleStyleConfirm}
      />
    </div>
  )
}
