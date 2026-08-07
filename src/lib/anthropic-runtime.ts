// src/lib/anthropic-runtime.ts —— 渲染侧 backfill 事件监听（幂等）
import { ipc } from '@/lib/ipc'
import { useStore } from '@/store'

let inited = false

export function initAnthropicRuntime(): void {
  if (inited) return
  inited = true

  ipc.onAnthropicBackfill(({ articles }) => {
    const s = useStore.getState()
    // lastFetchedAt 传现有值（回填不推进 discover 时间戳），首次无缓存时用当前时间兜底
    s.mergeAnthropicArticles(articles, s.anthropicBlogCache.lastFetchedAt ?? new Date().toISOString())
  })
}
