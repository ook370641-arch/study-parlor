import { useState } from 'react'
import { useStore } from '@/store'
import { ExternalSummaryContent } from './ExternalSummaryContent'

export function ExternalMaterialsCard() {
  const session = useStore(s => s.session)
  const materials = useStore(s => s.externalMaterials)
  const openExternalSummary = useStore(s => s.openExternalSummary)
  const [expanded, setExpanded] = useState(false)

  if (!materials) return null

  const isReview = session?.mode === 'review'
  const hasSources = materials.sources.length > 0

  return (
    <div data-testid="external-materials-card" className="relative z-[5] px-8 max-w-4xl w-full mx-auto">
      <div className="my-3 bg-ink/60 backdrop-blur-md border border-slate/30 rounded-lg overflow-hidden">
        <div className="flex items-center">
          <button
            onClick={() => setExpanded(v => !v)}
            className="flex-1 px-4 py-3 flex items-center justify-between text-sm hover:bg-parchment/5 transition-colors"
          >
            <div className="flex items-center gap-2.5">
              <span aria-hidden="true">🌐</span>
              <span className="text-parchment/90">外部资料</span>
              {materials.loading && (
                <span className="text-xs text-parchment/50">收集中…</span>
              )}
              {!materials.loading && hasSources && (
                <span className="text-xs bg-ember/15 text-ember px-2 py-0.5 rounded-full">
                  {materials.sources.length} 个来源
                </span>
              )}
              {isReview && (
                <span className="text-xs text-parchment/40">来自历史学习</span>
              )}
            </div>
            <span className="text-ember text-xs">
              {expanded ? '收起' : '展开'}
            </span>
          </button>

          {!materials.loading && hasSources && (
            <button
              type="button"
              data-testid="external-summary-open"
              onClick={openExternalSummary}
              className="px-4 py-3 text-xs text-ember hover:underline"
              aria-label="打开外部资料摘要面板"
            >
              摘要 →
            </button>
          )}
        </div>

        {expanded && (
          <div className="px-4 pb-4 border-t border-slate/20">
            {materials.loading && (
              <div className="pt-3 flex items-center gap-3 text-sm text-parchment/50">
                <span className="inline-block w-4 h-4 border-2 border-parchment/20 border-t-ember rounded-full animate-spin" />
                外部资料收集中…
              </div>
            )}

            {materials.error && !materials.loading && (
              <div className="pt-3 text-sm text-parchment/50">
                资料获取失败，本次不使用联网内容
              </div>
            )}

            {!materials.loading && materials.summary && (
              <div className="pt-3 text-[13px] leading-[1.75] text-parchment/90 font-serif">
                <ExternalSummaryContent summary={materials.summary} sources={materials.sources} />
              </div>
            )}

            {!materials.loading && !materials.error && !hasSources && (
              <div className="pt-3 text-sm text-parchment/50">
                未找到相关外部资料
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
