import { useStore } from '@/store'
import { StarOrbit } from './StarOrbit'

export function WildCardRecCard({
  onClickTopic
}: {
  onClickTopic: (topic: string) => void
}) {
  const recommendation = useStore((s) => s.wildcardInspiration)
  const loading = useStore((s) => s.wildcardLoading)
  const error = useStore((s) => s.wildcardError)
  const refresh = useStore((s) => s.refreshWildcardInspiration)

  if (loading && !recommendation) {
    return (
      <div className="bg-ink/70 backdrop-blur-md border border-wildcard/30 rounded py-3 px-4">
        <div className="flex flex-col items-center gap-3 py-2">
          <StarOrbit starCount={4} radius={14} period={3000} showLines={true} />
          <span className="text-xs text-parchment/40 font-sans italic tracking-wide">
            正在闯入…
          </span>
        </div>
      </div>
    )
  }

  if (!recommendation) {
    if (error) {
      return (
        <button
          onClick={refresh}
          className="block w-full text-left bg-ink/70 backdrop-blur-md border border-wildcard/30 rounded py-3 px-4 hover:border-wildcard/50 transition-colors"
        >
          <div className="text-xs text-parchment/40 font-sans mb-1">
            这次闯入失败了，再试一次
          </div>
          {error && (
            <div className="text-[10px] text-red-400/70 font-sans break-words max-h-16 overflow-y-auto leading-relaxed">
              {error}
            </div>
          )}
        </button>
      )
    }
    return null
  }

  return (
    <div
      data-testid="wild-card-card"
      className="relative bg-ink/70 backdrop-blur-md border border-wildcard/30 border-l-4 border-l-wildcard rounded overflow-hidden hover:border-wildcard/60 hover:bg-ink/80 transition-all cursor-pointer group"
      onClick={() => onClickTopic(recommendation.topic)}
    >
      {loading && (
        <div className="absolute inset-0 bg-ink/60 backdrop-blur-sm z-10 flex flex-col items-center justify-center gap-2">
          <StarOrbit starCount={4} radius={12} period={3000} showLines={true} />
          <span className="text-[10px] text-parchment/50 font-sans italic tracking-wide">
            正在闯入…
          </span>
        </div>
      )}

      <div className="px-3 py-2.5 relative">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[11px] font-sans px-2 py-0.5 rounded bg-wildcard/15 text-wildcard">
            ✦ 意外之径
          </span>
          <button
            data-testid="wild-card-refresh"
            onClick={(e) => {
              e.stopPropagation()
              refresh()
            }}
            disabled={loading}
            className={`w-5 h-5 flex items-center justify-center rounded text-parchment/40 hover:text-wildcard hover:bg-wildcard/10 transition-all ${loading ? 'animate-spin' : ''}`}
            title="换一条"
          >
            ↻
          </button>
        </div>
        <div data-testid="wild-card-title" className="font-serif text-[0.95rem] text-parchment font-semibold mb-1">
          {recommendation.topic}
        </div>
        <div data-testid="wild-card-hook" className="text-xs text-parchment/50 leading-relaxed italic">
          {recommendation.hook}
        </div>
        {error && (
          <div className="mt-2 text-[10px] text-red-400/80 font-sans break-words">
            {error}
            {' · '}
            <button
              onClick={(e) => {
                e.stopPropagation()
                refresh()
              }}
              disabled={loading}
              className="underline hover:text-red-300 disabled:opacity-50"
            >
              重试
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
