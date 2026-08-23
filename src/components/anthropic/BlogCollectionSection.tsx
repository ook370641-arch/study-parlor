// src/components/anthropic/BlogCollectionSection.tsx
import { useState } from 'react'
import { useStore } from '@/store'
import type { BlogCollectionEntry, BriefingTheme } from '@shared/index'

const STAGE_TEXT: Record<string, string> = {
  context: '分析写作上下文…',
  profile: '构建你的画像…',
  search: '搜索前沿博客…',
  pick: '精选本地文章…',
}

export function BlogCollectionSection({ theme = 'academic' }: { theme?: BriefingTheme }) {
  const isAcademic = theme !== 'newspaper'
  const collection = useStore((s) => s.blogCollection)
  const recommendRunning = useStore((s) => s.recommendRunning)
  const recommendStage = useStore((s) => s.recommendStage)
  const startBlogRecommend = useStore((s) => s.startBlogRecommend)
  const cancelBlogRecommend = useStore((s) => s.cancelBlogRecommend)
  const removeBlogCollection = useStore((s) => s.removeBlogCollection)
  const openAnthropicReader = useStore((s) => s.openAnthropicReader)

  const [collapsed, setCollapsed] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [expandedReason, setExpandedReason] = useState<string | null>(null)

  const entries = collection.entries
  const history = collection.history
  const border = isAcademic ? 'border-slate/30' : 'border-[#c9c3b8]'
  const muted = isAcademic ? 'text-parchment/50' : 'text-[#6b5d52]'
  const text = isAcademic ? 'text-parchment' : 'text-[#1a1a1a]'

  return (
    <div data-testid="blog-collection-section" className={`px-4 py-2 border-b ${border} shrink-0`}>
      <div className="flex items-center gap-2">
        <button type="button" data-testid="blog-collection-collapse" onClick={() => setCollapsed(c => !c)} className={`text-[10px] ${muted} hover:text-ember`}>
          {collapsed ? '▸' : '▾'}
        </button>
        <span className={`text-sm font-serif ${isAcademic ? 'text-ember' : 'text-[#6b5d52]'}`}>★ 收藏夹 ({entries.length})</span>
        <div className="flex-1" />
        <button
          type="button"
          data-testid="blog-recommend-button"
          onClick={() => (recommendRunning ? cancelBlogRecommend() : startBlogRecommend())}
          className={`text-xs px-2 py-1 rounded border transition-colors ${
            recommendRunning
              ? (isAcademic ? 'border-ember text-ember' : 'border-[#6b5d52] text-[#6b5d52]')
              : (isAcademic ? 'border-ember/40 text-ember hover:bg-ember/10' : 'border-[#6b5d52]/40 text-[#6b5d52] hover:bg-[#6b5d52]/10')
          }`}
        >
          {recommendRunning ? `${STAGE_TEXT[recommendStage ?? 'context']} ✕` : '为我推荐'}
        </button>
      </div>

      {history.length > 0 && (
        <button
          type="button"
          data-testid="blog-recommend-history"
          onClick={() => setShowHistory(s => !s)}
          className={`mt-1.5 block text-[10px] ${muted} hover:text-ember`}
        >
          往期推荐历史（{history.length} 批） {showHistory ? '▴' : '▾'}
        </button>
      )}
      {showHistory && history.length > 0 && (
        <div className="mt-1.5 space-y-1.5 text-[11px] leading-relaxed">
          {history.map((b) => (
            <div key={b.batch} className={`rounded p-2 ${isAcademic ? 'bg-ink/60 border border-parchment/10' : 'bg-[#f5f2ed] border border-[#1a1a1a]/10'}`}>
              <p className={`${muted} text-[10px]`}>第 {b.batch} 批 · {new Date(b.generatedAt).toLocaleString('zh-CN')}{b.searchUsed ? '' : ' · 未使用网络搜索'}</p>
              <p className={text}>{b.profile}</p>
              <p className={`mt-1 ${muted}`}>认知缺口：{b.gaps.join('、')}</p>
              <p className={`mt-1 ${muted}`}>检索方向：{b.queries.join('、')}</p>
            </div>
          ))}
        </div>
      )}

      {!collapsed && (
        <div className="mt-2 space-y-1.5 max-h-64 overflow-y-auto">
          {entries.length === 0 && !recommendRunning && (
            <p data-testid="blog-collection-empty" className={`text-xs ${muted}`}>
              尚无收藏——点「为我推荐」生成第一批，或点文章行的 ☆ 手动收藏
            </p>
          )}
          {entries.map((e) => (
            <CollectionRow
              key={e.sourceUrl}
              entry={e}
              isAcademic={isAcademic}
              expanded={expandedReason === e.sourceUrl}
              onToggleReason={() => setExpandedReason(expandedReason === e.sourceUrl ? null : e.sourceUrl)}
              onOpen={() => void openAnthropicReader(e.filePath)}
              onRemove={() => void removeBlogCollection(e.sourceUrl)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function CollectionRow({ entry, isAcademic, expanded, onToggleReason, onOpen, onRemove }: {
  entry: BlogCollectionEntry
  isAcademic: boolean
  expanded: boolean
  onToggleReason: () => void
  onOpen: () => void
  onRemove: () => void
}) {
  return (
    <div className={`rounded border p-2 ${isAcademic ? 'bg-ink/60 border-parchment/10' : 'bg-white border-[#1a1a1a]/10'}`}>
      <div className="flex items-center gap-2">
        {entry.origin === 'recommend' && (
          <button type="button" data-testid={`blog-collection-reason-${entry.sourceUrl}`} onClick={onToggleReason} className="shrink-0 text-xs" title="查看推荐理由">💡</button>
        )}
        <button type="button" data-testid={`blog-collection-open-${entry.sourceUrl}`} onClick={onOpen} className={`flex-1 min-w-0 text-left text-xs truncate ${isAcademic ? 'text-parchment/90 hover:text-ember' : 'text-[#1a1a1a] hover:text-ember'}`}>
          {entry.title}
        </button>
        <button type="button" data-testid={`blog-collection-remove-${entry.sourceUrl}`} onClick={onRemove} className={`shrink-0 text-xs ${isAcademic ? 'text-parchment/40 hover:text-ember' : 'text-[#6b5d52]/50 hover:text-ember'}`}>
          ×
        </button>
      </div>
      {expanded && entry.origin === 'recommend' && (
        <div className={`mt-1.5 text-[11px] leading-relaxed ${isAcademic ? 'text-parchment/60' : 'text-[#6b5d52]'}`}>
          <p><span className="text-ember">为什么推荐：</span>{entry.reason}</p>
          {entry.gap && <p className="mt-0.5"><span className="text-ember">补上缺口：</span>{entry.gap}</p>}
        </div>
      )}
    </div>
  )
}
