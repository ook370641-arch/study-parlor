import { useState } from 'react'
import { useStore } from '@/store'
import type { BriefingTheme } from '@shared/index'
import { HistoryIcon, RefreshIcon } from './blog-icons'
import { BlogRecommendDialog } from './BlogRecommendDialog'

const STAGE_TEXT = {
  context: '分析写作上下文…',
  profile: '构建你的画像…',
  search: '搜索前沿博客…',
  pick: '精选本地文章…',
} as const

export function BlogRecommendationTools({ theme = 'academic' }: { theme?: BriefingTheme }) {
  const isAcademic = theme !== 'newspaper'
  const collection = useStore(state => state.blogCollection)
  const recommendRunning = useStore(state => state.recommendRunning)
  const recommendStage = useStore(state => state.recommendStage)
  const openRecommendView = useStore(state => state.openRecommendView)
  const startBlogRecommend = useStore(state => state.startBlogRecommend)
  const cancelBlogRecommend = useStore(state => state.cancelBlogRecommend)
  const [dialogOpen, setDialogOpen] = useState(false)
  const muted = isAcademic ? 'text-parchment/50' : 'text-[#6b5d52]'
  const buttonClass = `flex h-[26px] w-[26px] items-center justify-center rounded border transition-colors ${
    isAcademic
      ? 'border-ember/40 text-ember hover:bg-ember/10'
      : 'border-[#6b5d52]/40 text-[#6b5d52] hover:bg-[#6b5d52]/10'
  }`

  return (
    <>
      <div data-testid="blog-recommendation-tools" className="flex items-center gap-2">
        {recommendRunning && <span className={muted}>{STAGE_TEXT[recommendStage ?? 'context']}</span>}
        {collection.history.length > 0 && (
          <button
            type="button"
            data-testid="blog-rec-history"
            title="推荐记录"
            onClick={() => openRecommendView(collection.history[0].batch)}
            className={buttonClass}
          >
            <HistoryIcon size={13} />
          </button>
        )}
        <button
          type="button"
          data-testid="blog-recommend-button"
          title={recommendRunning ? '取消推荐' : '重新推荐'}
          onClick={() => recommendRunning ? void cancelBlogRecommend() : setDialogOpen(true)}
          className={buttonClass}
        >
          {recommendRunning ? '✕' : <RefreshIcon size={13} />}
        </button>
      </div>
      {dialogOpen && (
        <BlogRecommendDialog
          theme={theme}
          onCancel={() => setDialogOpen(false)}
          onStart={note => {
            setDialogOpen(false)
            void startBlogRecommend(note)
          }}
        />
      )}
    </>
  )
}
