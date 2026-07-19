import { useStore } from '@/store'

// 导读字号锚定正文字号变量 --briefing-body-size（档位步进 2px）：
// 导读正文级恒比正文小 1 档，术语级小 2 档，随正文字号控制同步缩放
const GUIDE_BODY_SIZE = 'calc(var(--briefing-body-size, 19px) - 2px)'
const GUIDE_TERM_SIZE = 'calc(var(--briefing-body-size, 19px) - 4px)'

interface Props {
  theme?: 'academic' | 'newspaper'
}

export function GuideSidebar({ theme = 'academic' }: Props) {
  const session = useStore((s) => s.assistantSession)
  const activeChunkIndex = useStore((s) => s.assistantSession?.activeChunkIndex ?? null)
  const setAssistantActiveChunk = useStore((s) => s.setAssistantActiveChunk)
  const isAcademic = theme !== 'newspaper'

  if (!session) return null

  return (
    <div className={`h-full flex flex-col shrink-0 border-l ${isAcademic ? 'border-parchment/10 bg-ink/40' : 'border-[#1a1a1a]/10 bg-[#f5f2ed]'} `}>
      <div className={`px-4 py-3 text-xs uppercase tracking-widest select-none ${isAcademic ? 'text-parchment/60' : 'text-[#6b5d52]'}`}>导读</div>
      {session.guideLoading && (
        <div className={`px-4 text-sm ${isAcademic ? 'text-parchment/50' : 'text-[#6b5d52]'}`}>生成导读中…</div>
      )}
      {session.guideError && !session.guide && (
        <div className="px-4 text-sm text-ember">未能生成导读，可继续阅读原文。</div>
      )}
      {session.guide && (
        <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-4">
          <div style={{ fontSize: GUIDE_BODY_SIZE }} className={`rounded p-3 leading-relaxed ${isAcademic ? 'bg-ink/60 border border-parchment/10 text-parchment/90' : 'bg-white border border-[#1a1a1a]/10 text-[#1a1a1a]'}`}>
            <strong className="text-ember">背景</strong>：{session.guide.background}
          </div>
          {session.guide.chunks.map((chunk, i) => {
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
                <div className={`leading-relaxed mb-2 ${isAcademic ? 'text-parchment/80' : 'text-[#555]'}`}>{chunk.summary}</div>
                {chunk.terms.length > 0 && (
                  <div className={`space-y-1.5 mt-2 pt-2 border-t ${isAcademic ? 'border-parchment/10' : 'border-[#1a1a1a]/10'}`}>
                    {chunk.terms.map((t, ti) => (
                      <div key={`${i}-${ti}`} data-testid="guide-term" style={{ fontSize: GUIDE_TERM_SIZE }} className={`leading-relaxed ${isAcademic ? 'text-parchment/70' : 'text-[#6b5d52]'}`}>
                        <span className="text-ember font-medium">{t.term}</span>
                        <span className="text-parchment/50 mx-1">·</span>
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
