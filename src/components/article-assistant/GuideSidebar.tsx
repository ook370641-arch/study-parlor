import { useStore } from '@/store'

export function GuideSidebar() {
  const session = useStore((s) => s.assistantSession)
  if (!session) return null

  return (
    <div className="w-80 h-full border-l border-parchment/10 bg-ink/40 flex flex-col shrink-0">
      <div className="px-4 py-3 text-xs uppercase tracking-widest text-parchment/60 select-none">导读</div>
      {session.guideLoading && (
        <div className="px-4 text-sm text-parchment/50">生成导读中…</div>
      )}
      {session.guideError && !session.guide && (
        <div className="px-4 text-sm text-ember">未能生成导读，可继续阅读原文。</div>
      )}
      {session.guide && (
        <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-4">
          <div className="bg-ink/60 border border-parchment/10 rounded p-3 text-sm leading-relaxed text-parchment/90">
            <strong className="text-ember">背景</strong>：{session.guide.background}
          </div>
          {session.guide.chunks.map((chunk, i) => (
            <div key={i} className="bg-ink/60 border border-parchment/10 rounded p-3 text-sm">
              <div className="text-ember font-medium mb-1">{chunk.heading}</div>
              <div className="text-parchment/80 leading-relaxed mb-2">{chunk.summary}</div>
              {chunk.terms.length > 0 && (
                <div className="space-y-1.5 mt-2 pt-2 border-t border-parchment/10">
                  {chunk.terms.map((t) => (
                    <div key={t.term} className="text-xs text-parchment/70 leading-relaxed">
                      <span className="text-ember font-medium">{t.term}</span>
                      <span className="text-parchment/50 mx-1">·</span>
                      <span>{t.translation}</span>
                      {t.explanation && (
                        <div className="text-parchment/50 mt-0.5 ml-0">{t.explanation}</div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
