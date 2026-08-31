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

  ipc.onAnthropicRecommendStage(({ stage }) => {
    useStore.setState({ recommendStage: stage })
  })
  ipc.onAnthropicRecommendDone((p) => {
    if (p.ok) {
      useStore.setState({
        blogCollection: p.collection,
        recommendRunning: false,
        recommendStage: null,
        recommendViewBatch: p.collection.history[0]?.batch ?? null,
      })
    } else {
      useStore.setState({ recommendRunning: false, recommendStage: null })
      const msg = recommendErrorText(p.code)
      if (msg) useStore.getState().showToast(msg)
    }
  })
}

function recommendErrorText(code: string): string {
  switch (code) {
    case 'NO_WRITING_CONTEXT': return '先在写作里写几篇文章，推荐才有依据'
    case 'NO_LOCAL_ARTICLES': return '先从博客列表导入几篇文章'
    case 'LLM_ERROR': return '推荐失败，请稍后重试'
    case 'LLM_PARSE_ERROR': return '推荐结果解析失败，请重试'
    case 'ABORTED': return ''
    default: return '推荐失败'
  }
}
