import { useState, useCallback, useEffect } from 'react'
import { useStore } from '@/store'
import { ipc } from '@/lib/ipc'
import { StarOrbit } from './StarOrbit'

export function WildCardRecCard({
  onClickTopic
}: {
  onClickTopic: (topic: string) => void
}) {
  const profile = useStore((s) => s.profile)
  const library = useStore((s) => s.library)
  const cached = useStore((s) => s.wildcardInspiration)
  const setWildcardInspiration = useStore((s) => s.setWildcardInspiration)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  const recommendation = cached ?? null

  const load = useCallback(async () => {
    setLoading(true)
    setError(false)
    setErrorMsg('')
    try {
      const topics = library.map((t) => ({ title: t.title }))
      const result = await ipc.llmWildcardInspiration({ profile, topics })
      setWildcardInspiration(result)
    } catch (err: any) {
      const msg = String(err?.message ?? err)
      console.error('[WildCardRecCard] load error:', msg)
      setErrorMsg(msg)
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [profile, library, setWildcardInspiration])

  const refresh = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    load()
  }, [load])

  // 首次加载：无缓存且无错误时才触发
  useEffect(() => {
    if (!cached && !error) {
      load()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (loading && !recommendation) {
    return (
      <div className="bg-ink/70 backdrop-blur-md border border-violet/30 rounded py-3 px-4">
        <div className="flex flex-col items-center gap-3 py-2">
          <StarOrbit starCount={4} radius={14} period={3000} showLines={true} />
          <span className="text-xs text-parchment/40 font-sans italic tracking-wide">
            正在闯入…
          </span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <button
        onClick={() => load()}
        className="block w-full text-left bg-ink/70 backdrop-blur-md border border-violet/30 rounded py-3 px-4 hover:border-violet/50 transition-colors"
      >
        <div className="text-xs text-parchment/40 font-sans mb-1">
          这次闯入失败了，再试一次
        </div>
        {errorMsg && (
          <div className="text-[10px] text-red-400/70 font-sans break-words max-h-16 overflow-y-auto leading-relaxed">
            {errorMsg}
          </div>
        )}
      </button>
    )
  }

  if (!recommendation) return null

  return (
    <div
      className="relative bg-ink/70 backdrop-blur-md border border-violet/30 border-l-4 border-l-violet rounded overflow-hidden hover:border-violet/60 hover:bg-ink/80 transition-all cursor-pointer group"
      onClick={(e) => {
        const target = e.target as HTMLElement
        if (target.closest('[data-refresh]')) return
        onClickTopic(recommendation.topic)
      }}
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
          <span className="text-[11px] font-sans px-2 py-0.5 rounded bg-violet/15 text-violet">
            ✦ 意外之径
          </span>
          <button
            data-refresh
            onClick={refresh}
            disabled={loading}
            className={`w-5 h-5 flex items-center justify-center rounded text-parchment/40 hover:text-violet hover:bg-violet/10 transition-all ${loading ? 'animate-spin' : ''}`}
            title="换一条"
          >
            ↻
          </button>
        </div>
        <div className="font-serif text-[0.95rem] text-parchment font-semibold mb-1">
          {recommendation.topic}
        </div>
        <div className="text-xs text-parchment/50 leading-relaxed italic">
          {recommendation.hook}
        </div>
      </div>
    </div>
  )
}
