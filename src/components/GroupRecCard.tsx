import { useState, useCallback, useEffect } from 'react'
import { useStore } from '@/store'
import type { Group, NewTopic } from '@shared/index'
import { ipc } from '@/lib/ipc'

export function GroupRecCard({
  group,
  existingTopics,
  onClickTopic
}: {
  group: Group
  existingTopics: string[]
  onClickTopic: (topic: string) => void
}) {
  const profile = useStore((s) => s.profile)
  const [recommendation, setRecommendation] = useState<NewTopic | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const [lastRefresh, setLastRefresh] = useState(0)

  const load = useCallback(async () => {
    const now = Date.now()
    if (now - lastRefresh < 30000) return // 30s debounce
    setLoading(true)
    setError(false)
    try {
      const result = await ipc.llmGroupInspiration({
        groupName: group.name,
        existingTopics,
        profile
      })
      setRecommendation(result)
      setLastRefresh(now)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [group.name, existingTopics, profile, lastRefresh])

  // 首次加载
  useEffect(() => {
    if (!recommendation && !error) {
      load()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (loading && !recommendation) {
    return (
      <div className="bg-ink/40 border border-slate/30 rounded py-3 px-4">
        <div className="text-xs text-parchment/40 font-sans text-center">
          <span className="inline-block w-3 h-3 border-2 border-parchment/20 border-t-ember rounded-full animate-spin mr-2 align-middle" />
          正在浮现……
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <button
        onClick={load}
        className="block w-full text-left bg-ink/40 border border-slate/30 rounded py-3 px-4 hover:border-ember/40 transition-colors"
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
      className="relative bg-ink/40 border border-slate/30 rounded overflow-hidden hover:border-ember/50 hover:bg-ink/60 transition-all cursor-pointer group"
      onClick={(e) => {
        // 如果点击的是刷新按钮，不触发卡片点击
        const target = e.target as HTMLElement
        if (target.closest('[data-refresh]')) return
        onClickTopic(recommendation.topic)
      }}
    >
      {/* 左侧色条 */}
      <div
        className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l transition-all group-hover:w-1"
        style={{ backgroundColor: group.color }}
      />

      <div className="pl-4 pr-3 py-2.5">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[11px] font-sans tracking-wide" style={{ color: group.color + 'cc' }}>
            {group.name}
          </span>
          <button
            data-refresh
            onClick={(e) => {
              e.stopPropagation()
              load()
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
