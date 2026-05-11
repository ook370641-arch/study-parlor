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
  const cached = useStore((s) => s.groupInspirations[group.id])
  const setGroupInspiration = useStore((s) => s.setGroupInspiration)
  const removeGroupInspiration = useStore((s) => s.removeGroupInspiration)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const [lastRefresh, setLastRefresh] = useState(0)

  const recommendation = cached ?? null

  const load = useCallback(async () => {
    const now = Date.now()
    if (now - lastRefresh < 30000) return // 30s debounce
    setLoading(true)
    setError(false)
    try {
      const result = await ipc.llmGroupInspiration({
        groupName: group.name,
        topics,
        profile
      })
      setGroupInspiration(group.id, result)
      setLastRefresh(now)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [group.id, group.name, topics, profile, lastRefresh, setGroupInspiration])

  const refresh = useCallback(() => {
    removeGroupInspiration(group.id)
    load()
  }, [group.id, removeGroupInspiration, load])

  // 首次加载：无缓存且无错误时才触发
  useEffect(() => {
    if (!cached && !error) {
      load()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (loading && !recommendation) {
    return (
      <div className="bg-ink/70 backdrop-blur-md border border-slate/40 rounded py-3 px-4">
        <div className="flex flex-col items-center gap-3 py-2">
          <StarOrbit starCount={4} radius={14} period={3000} showLines={true} />
          <span className="text-xs text-parchment/40 font-sans italic tracking-wide">
            正在浮现…
          </span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <button
        onClick={load}
        className="block w-full text-left bg-ink/70 backdrop-blur-md border border-slate/40 rounded py-3 px-4 hover:border-ember/50 transition-colors"
      >
        <div className="text-xs text-parchment/40 font-sans">
          这次联结很模糊，再试一次
        </div>
      </button>
    )
  }

  if (!recommendation) return null

  return (
    <div
      className="relative bg-ink/70 backdrop-blur-md border border-slate/40 rounded overflow-hidden hover:border-ember/60 hover:bg-ink/80 transition-all cursor-pointer group"
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

      <div className="pl-4 pr-3 py-2.5">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[11px] font-sans tracking-wide" style={{ color: group.color + 'cc' }}>
            {group.name}
          </span>
          <button
            data-refresh
            onClick={(e) => {
              e.stopPropagation()
              refresh()
            }}
            disabled={loading}
            className={`w-5 h-5 flex items-center justify-center rounded text-parchment/40 hover:text-ember hover:bg-ember/10 transition-all ${loading ? 'animate-spin' : ''}`}
            title="换一个"
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
