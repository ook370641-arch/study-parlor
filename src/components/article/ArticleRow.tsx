import { memo } from 'react'
import type { BriefingTheme } from '@shared/index'

interface Props {
  title: string
  summary: string | null
  dateText: string
  sourceName?: string | null
  isNew?: boolean
  theme?: BriefingTheme
  testId?: string
  onOpen: () => void
  onRequestDelete?: () => void
}

export const ArticleRow = memo(function ArticleRow({
  title, summary, dateText, sourceName, isNew, theme = 'academic', testId = 'article-row', onOpen, onRequestDelete,
}: Props) {
  const isAcademic = theme !== 'newspaper'
  const card = isAcademic
    ? 'border-parchment/15 bg-parchment/5 hover:bg-parchment/10'
    : 'border-[#c9c3b8] bg-white hover:bg-[#faf8f5]'
  const titleCls = isAcademic ? 'text-parchment' : 'text-[#1a1a1a]'
  const muted = isAcademic ? 'text-parchment/50' : 'text-[#6b5d52]'

  return (
    <div
      data-testid={testId}
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => { if (e.key === 'Enter') onOpen() }}
      className={`group relative rounded-lg border p-3 cursor-pointer transition-colors ${card} ${isNew ? 'border-l-2 border-l-ember' : ''}`}
    >
      {isNew && (
        <span data-testid="article-row-new-badge" className="absolute top-2 right-2 min-w-[18px] px-1 py-0.5 rounded-full text-[10px] text-center bg-ember text-white">新</span>
      )}
      <p className={`text-sm font-serif leading-snug pr-6 ${titleCls}`}>{title}</p>
      {summary && <p className={`mt-1 text-xs line-clamp-2 ${muted}`}>{summary}</p>}
      <p className={`mt-1.5 text-[10px] ${muted}`}>{sourceName ? `${sourceName} · ` : ''}{dateText}</p>
      {onRequestDelete && (
        <button
          type="button"
          data-testid="article-row-delete"
          aria-label="删除文章"
          onClick={(e) => { e.stopPropagation(); onRequestDelete() }}
          className={`absolute bottom-2 right-2 text-xs opacity-0 group-hover:opacity-100 hover:text-wine ${muted}`}
        >🗑</button>
      )}
    </div>
  )
})
