import { useState, useCallback, useEffect } from 'react'
import { useStore } from '@/store'
import type { Group } from '@shared/index'
import { ipc } from '@/lib/ipc'
import { StarOrbit } from './StarOrbit'

export function GroupRecCard({
  group,
  topics,
  onClickTopic
}: {
  group: Group
  topics: { dirName: string; title: string }[]
  onClickTopic: (topic: string) => void
}) {
  const profile = useStore((s) => s.profile)
  const theme = useStore((s) => s.briefingTheme)
  const isAcademic = theme !== 'newspaper'
  const inspirationStrategy = useStore((s) => s.inspirationStrategy)
  const cached = useStore((s) => s.groupInspirations[group.id])
  const setGroupInspiration = useStore((s) => s.setGroupInspiration)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [lastRefresh, setLastRefresh] = useState(0)

  const recommendation = cached ?? null

  const load = useCallback(async (skipDebounce = false) => {
    const now = Date.now()
    if (!skipDebounce && now - lastRefresh < 5000) return // 5s debounce for auto-load
    setLoading(true)
    setError(false)
    setErrorMsg('')
    try {
      const result = await ipc.llmGroupInspiration({
        groupName: group.name,
        topics,
        profile,
        strategy: inspirationStrategy
      })
      setGroupInspiration(group.id, result)
      setLastRefresh(now)
    } catch (err: any) {
      const msg = String(err?.message ?? err)
      console.error('[GroupRecCard] load error:', msg)
      setErrorMsg(msg)
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [group.id, group.name, topics, profile, lastRefresh, setGroupInspiration, inspirationStrategy])

  const refresh = useCallback(() => {
    load(true)
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
      <div className={`${isAcademic ? 'bg-ink/70 border-slate/40' : 'bg-white border-[#1a1a1a]/12'} backdrop-blur-md border rounded py-3 px-4`}>
        <div className="flex flex-col items-center gap-3 py-2">
          <StarOrbit starCount={4} radius={14} period={3000} showLines={true} />
          <span className={`text-xs font-sans italic tracking-wide ${isAcademic ? 'text-parchment/40' : 'text-[#999]'}`}>
            正在浮现…
          </span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <button
        onClick={() => load()}
        className={`block w-full text-left ${isAcademic ? 'bg-ink/70 border-slate/40' : 'bg-white border-[#1a1a1a]/12'} backdrop-blur-md border rounded py-3 px-4 hover:border-ember/50 transition-colors`}
      >
        <div className={`text-xs font-sans mb-1 ${isAcademic ? 'text-parchment/40' : 'text-[#999]'}`}>
          这次联结很模糊，再试一次
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
      data-testid="group-rec-card"
      className={`relative ${isAcademic ? 'bg-ink/70 border-slate/40 hover:bg-ink/80' : 'bg-white border-[#1a1a1a]/12 hover:bg-[#f8f8f6]'} backdrop-blur-md border rounded overflow-hidden hover:border-ember/60 transition-all cursor-pointer group`}
      onClick={(e) => {
        const target = e.target as HTMLElement
        if (target.closest('[data-refresh]')) return
        onClickTopic(recommendation.topic)
      }}
    >
      {/* 左侧色条 - hover 时流光扫过 */}
      <div
        className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l overflow-hidden transition-all group-hover:w-1"
        style={{ backgroundColor: group.color }}
      >
        <div
          className="absolute inset-0 opacity-0 group-hover:animate-lightSweep"
          style={{
            background: 'linear-gradient(180deg, transparent 0%, rgba(255,255,255,0.2) 50%, transparent 100%)',
          }}
        />
      </div>

      <div className="pl-4 pr-3 py-2.5 relative">
        {/* Loading overlay */}
        {loading && (
          <div className={`absolute inset-0 ${isAcademic ? 'bg-ink/60' : 'bg-white/80'} backdrop-blur-sm z-10 flex flex-col items-center justify-center gap-2`}>
            <StarOrbit starCount={4} radius={12} period={3000} showLines={true} />
            <span className={`text-[10px] font-sans italic tracking-wide ${isAcademic ? 'text-parchment/50' : 'text-[#777]'}`}>
              正在浮现…
            </span>
          </div>
        )}

        <div className="flex items-center justify-between mb-1">
          <span className="text-[11px] font-sans tracking-wide" style={{ color: group.color + 'cc' }}>
            {group.name}
          </span>
          <button
            data-testid="group-rec-refresh"
            data-refresh
            onClick={(e) => {
              e.stopPropagation()
              refresh()
            }}
            disabled={loading}
            className={`w-5 h-5 flex items-center justify-center rounded transition-all ${loading ? 'animate-spin' : ''} ${isAcademic ? 'text-parchment/40 hover:text-ember hover:bg-ember/10' : 'text-[#aaa] hover:text-[#1a1a1a] hover:bg-[#1a1a1a]/5'}`}
            title="换一个"
          >
            ↻
          </button>
        </div>
        <div data-testid="group-rec-title" className={`font-serif text-[0.95rem] ${isAcademic ? 'text-parchment' : 'text-[#1a1a1a]'} font-semibold mb-1`}>
          {recommendation.topic}
        </div>
        <div className={`text-xs ${isAcademic ? 'text-parchment/50' : 'text-[#777]'} leading-relaxed italic`}>
          {recommendation.hook}
        </div>
      </div>
    </div>
  )
}
