import { useEffect, useRef, useState } from 'react'
import { useStore } from '@/store'
import { guideProgressParts } from '@/lib/guide-progress'
import { GuideCompass } from './GuideCompass'
import { DemoInfoButton, DemoNotePopover } from '@/components/demo/DemoNotePopover'
import type { DemoNote } from '@/lib/demo-notes'

// 导读字号锚定正文字号变量 --briefing-body-size（档位步进 2px）：
// 导读正文级恒比正文小 1 档，术语级小 2 档，随正文字号控制同步缩放
const GUIDE_BODY_SIZE = 'calc(var(--briefing-body-size, 19px) - 2px)'
const GUIDE_TERM_SIZE = 'calc(var(--briefing-body-size, 19px) - 4px)'

interface Props {
  theme?: 'academic' | 'newspaper'
}

export function GuideSidebar({ theme = 'academic' }: Props) {
  const guide = useStore((s) => s.assistantSession?.guide ?? null)
  const guideLoading = useStore((s) => s.assistantSession?.guideLoading ?? false)
  const guideError = useStore((s) => s.assistantSession?.guideError ?? null)
  const guideProgress = useStore((s) => s.assistantSession?.guideProgress ?? null)
  const activeChunkIndex = useStore((s) => s.assistantSession?.activeChunkIndex ?? null)
  const setAssistantActiveChunk = useStore((s) => s.setAssistantActiveChunk)
  const guideScrollToChunkIndex = useStore((s) => s.guideScrollToChunkIndex)
  const setGuideScrollToChunk = useStore((s) => s.setGuideScrollToChunk)
  const generateAssistantGuide = useStore((s) => s.generateAssistantGuide)
  const isAcademic = theme !== 'newspaper'
  const scrollRef = useRef<HTMLDivElement>(null)
  const [openNote, setOpenNote] = useState<DemoNote['id'] | null>(null)
  const guideInfoRef = useRef<HTMLSpanElement>(null)

  // Scroll guide sidebar to chunk when triggered by article body click
  useEffect(() => {
    if (guideScrollToChunkIndex === null) return
    const container = scrollRef.current
    if (!container) return
    const el = container.querySelector(`[data-chunk-index="${guideScrollToChunkIndex}"]`)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
    // Clear after scrolling so the same index can be clicked again
    setGuideScrollToChunk(null)
  }, [guideScrollToChunkIndex, setGuideScrollToChunk])

  return (
    <div className={`h-full flex flex-col shrink-0 border-l ${isAcademic ? 'border-parchment/10 bg-ink/40' : 'border-[#1a1a1a]/10 bg-[#f5f2ed]'} `}>
      <div className={`px-4 py-3 flex items-center justify-between gap-2 ${isAcademic ? 'text-parchment/60' : 'text-[#6b5d52]'}`}>
        <span className="text-xs uppercase tracking-widest select-none">导读</span>
        <span ref={guideInfoRef} className="contents">
          <DemoInfoButton
            testId="demo-info-guide"
            size="icon"
            label="这份导读是怎么生成的"
            theme={theme}
            active={openNote === 'guide'}
            onClick={() => setOpenNote((v) => (v === 'guide' ? null : 'guide'))}
          />
        </span>
      </div>
      <DemoNotePopover noteId={openNote} anchorRef={guideInfoRef} onClose={() => setOpenNote(null)} theme={theme} />
      {guideLoading && (() => {
          const parts = guideProgressParts(guideProgress)
          return (
        // 加载态独占整栏：罗盘（占据剩余空间）+ 居中状态行。
        // 画作与语录属于正文页（BookReader / AnthropicArticleReader / NoteBoard），
        // 不在这里——侧栏是工具区，不是阅读区。
        <div data-testid="guide-progress" className="flex-1 min-h-0 flex flex-col px-4 pb-5 overflow-y-auto">
          <div className="flex-1 min-h-0 mt-4 flex items-center justify-center">
            <GuideCompass progress={guideProgress} theme={isAcademic ? 'academic' : 'newspaper'} height="auto" />
          </div>
          <div
            role="status"
            aria-live="polite"
            style={{ fontSize: GUIDE_TERM_SIZE, fontVariantNumeric: 'tabular-nums' }}
            className={`mt-4 text-center ${isAcademic ? 'text-parchment/60' : 'text-[#6b5d52]'}`}
          >
            <div className="font-serif tracking-[0.08em]">
              <span className="text-ember">{parts.label}</span>
              {parts.detail && <span className={`ml-1 ${isAcademic ? 'text-parchment/45' : 'text-[#6b5d52]/70'}`}> {parts.detail}</span>}
            </div>
            <div className={`mt-1 text-[10px] tracking-[0.2em] ${isAcademic ? 'text-parchment/25' : 'text-[#6b5d52]/50'}`}>
              READING · REMEMBERING
            </div>
          </div>
        </div>
        )})()}
      {guideError && !guide && (
        <div className="px-4 text-sm text-ember">
          <span>未能生成导读，可继续阅读原文。</span>
          <button
            data-testid="guide-retry"
            onClick={() => generateAssistantGuide()}
            className="mt-2 block rounded border border-ember/40 px-3 py-1 text-xs text-ember hover:bg-ember/10 transition-colors"
          >
            重新生成导读
          </button>
        </div>
      )}
      {guide && (
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 pb-4 space-y-4">
          <div style={{ fontSize: GUIDE_BODY_SIZE }} className={`rounded p-3 leading-relaxed ${isAcademic ? 'bg-ink/60 border border-parchment/10 text-parchment/90' : 'bg-white border border-[#1a1a1a]/10 text-[#1a1a1a]'}`}>
            <strong className="text-ember">背景</strong>：{guide.background}
          </div>
          {guide.chunks.map((chunk, i) => {
            const isActive = activeChunkIndex === i
            return (
              <div
                key={i}
                data-testid="guide-chunk"
                data-chunk-index={i}
                style={{ fontSize: GUIDE_BODY_SIZE }}
                className={`rounded p-3 cursor-default transition-colors ${
                  isAcademic
                    ? `bg-ink/60 border ${isActive ? 'border-ember' : 'border-parchment/10'}`
                    : `bg-white border ${isActive ? 'border-ember' : 'border-[#1a1a1a]/10'}`
                }`}
                onMouseEnter={() => setAssistantActiveChunk(i)}
                onMouseLeave={() => setAssistantActiveChunk(null)}
              >
                <div className="text-ember font-medium mb-1">§{i + 1} {chunk.heading}</div>
                <div className={`leading-relaxed mb-2 ${isAcademic ? 'text-parchment/80' : 'text-[#555]'}`}>{chunk.context ?? chunk.summary}</div>
                {chunk.terms.length > 0 && (
                  <div className={`space-y-1.5 mt-2 pt-2 border-t ${isAcademic ? 'border-parchment/10' : 'border-[#1a1a1a]/10'}`}>
                    {chunk.terms.map((t, ti) => (
                      <div key={`${i}-${ti}`} data-testid="guide-term" style={{ fontSize: GUIDE_TERM_SIZE }} className={`leading-relaxed ${isAcademic ? 'text-parchment/70' : 'text-[#6b5d52]'}`}>
                        <span className="text-ember font-medium">{t.term}</span>
                        <span className={`mx-1 ${isAcademic ? 'text-parchment/50' : 'text-[#6b5d52]/60'}`}>·</span>
                        <span>{t.translation}</span>
                        {t.explanation && <div className={`mt-0.5 ${isAcademic ? 'text-parchment/50' : 'text-[#999]'}`}>{t.explanation}</div>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
