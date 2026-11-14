import type { DragEvent } from 'react'
import type { AnthropicArticleMeta, BlogMineGroup, BlogOrder, BlogReorderRequest, BriefingTheme } from '@shared/index'
import { coverImageUrl, type BlogWallSort } from '@/lib/anthropic-articles'
import type { BlogViewFilter } from '@/lib/section-filter'
import { ANTHROPIC_SOURCES, LEGACY_SECTION_META, sectionOf } from '@/lib/anthropic-sections'
import { BlogFilterTabs } from './BlogFilterTabs'
import { BlogMineGroupSection } from './BlogMineGroupSection'
import { BlogRecommendationTools } from './BlogRecommendationTools'

interface Props {
  articles: AnthropicArticleMeta[]
  loading: boolean
  filter: BlogViewFilter
  sortBy: BlogWallSort
  groups: Record<BlogMineGroup, AnthropicArticleMeta[]>
  order: BlogOrder
  collapsedGroups: Record<BlogMineGroup, boolean>
  onToggleGroup: (group: BlogMineGroup) => void
  onReorder: (request: BlogReorderRequest) => void
  onFilterChange: (filter: BlogViewFilter) => void
  onSortByChange: (sort: BlogWallSort) => void
  onOpenArticle: (article: AnthropicArticleMeta) => void
  onClearFilters: () => void
  theme?: BriefingTheme
}

const LABELS: Record<BlogMineGroup, string> = { saved: '已保存', read: '已读', favorite: '收藏' }
const ARTICLE_MIME = 'application/x-blog-article'
const GROUP_MIME = 'application/x-blog-group'

function WallCard({ article, group, onOpenArticle, onReorder }: {
  article: AnthropicArticleMeta
  group?: BlogMineGroup
  onOpenArticle: (article: AnthropicArticleMeta) => void
  onReorder: (request: BlogReorderRequest) => void
}) {
  const section = article.local === 'constitution'
    ? null
    : ANTHROPIC_SOURCES.find(item => item.key === sectionOf(article)) ?? LEGACY_SECTION_META[sectionOf(article)]
  const color = section?.color ?? '#6b5d52'

  const dropArticle = (event: DragEvent<HTMLElement>) => {
    if (!group || !event.dataTransfer.types.includes(ARTICLE_MIME)) return
    try {
      const payload = JSON.parse(event.dataTransfer.getData(ARTICLE_MIME)) as { group: BlogMineGroup; sourceUrl: string }
      if (payload.group !== group || payload.sourceUrl === article.url) return
      event.preventDefault()
      event.stopPropagation()
      const rect = event.currentTarget.getBoundingClientRect()
      onReorder({
        kind: 'article',
        group,
        sourceUrl: payload.sourceUrl,
        targetUrl: article.url,
        placement: event.clientX > rect.left + rect.width / 2 ? 'after' : 'before',
      })
    } catch { return }
  }

  return (
    <article
      data-testid={`blog-wall-card-${article.url}`}
      role="button"
      tabIndex={0}
      onClick={() => onOpenArticle(article)}
      onKeyDown={event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onOpenArticle(article)
        }
      }}
      onDragOver={event => { if (group && event.dataTransfer.types.includes(ARTICLE_MIME)) event.preventDefault() }}
      onDrop={dropArticle}
      className="group relative cursor-pointer overflow-hidden rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ember/70"
      style={{ aspectRatio: '3/4', boxShadow: '0 6px 16px rgba(0,0,0,.35)', background: `linear-gradient(135deg, ${color}88, ${color}22 58%, #1a120d)` }}
    >
      {group && (
        <span
          data-testid={`blog-wall-article-handle-${article.url}`}
          title="拖拽排序"
          draggable
          onClick={event => event.stopPropagation()}
          onDragStart={event => {
            event.stopPropagation()
            event.dataTransfer.setData(ARTICLE_MIME, JSON.stringify({ group, sourceUrl: article.url }))
            event.dataTransfer.effectAllowed = 'move'
          }}
          className="absolute left-2 top-2 z-20 cursor-grab rounded bg-black/45 px-1.5 py-0.5 text-xs text-white/85 opacity-0 transition-opacity group-hover:opacity-100"
        >⠿</span>
      )}
      <div data-testid={`blog-wall-cover-fallback-${article.url}`} className="absolute inset-0 flex items-center justify-center p-5 text-center font-serif text-lg text-white/65">
        {section?.label ?? 'Anthropic'}
      </div>
      {article.imageUrl && <img src={coverImageUrl(article.imageUrl)} alt="" loading="lazy" decoding="async" onError={event => { event.currentTarget.style.display = 'none' }} className="absolute inset-0 h-full w-full object-cover" />}
      <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(20,12,8,0) 32%, rgba(20,12,8,.94))' }} />
      {article.isSaved && <span data-testid={`blog-wall-saved-${article.url}`} className="absolute right-2 top-2 rounded bg-black/45 px-1.5 py-0.5 text-[9px] text-white/85">已导入</span>}
      <div className="absolute inset-x-0 bottom-0 p-3 text-[#f0e2c8]">
        <div className="line-clamp-3 text-[13px] leading-snug group-hover:line-clamp-none">{article.title}</div>
        <div className="mt-2 text-[10px] text-[#f0e2c8]/65">{section?.label ?? 'Anthropic'}{article.publishedAt ? ` · ${article.publishedAt.slice(0, 10)}` : ''}</div>
      </div>
    </article>
  )
}

export function BlogWall({
  articles, loading, filter, sortBy, groups, order, collapsedGroups, onToggleGroup, onReorder,
  onFilterChange, onSortByChange, onOpenArticle, onClearFilters, theme = 'academic',
}: Props) {
  const isAcademic = theme !== 'newspaper'
  const selectCls = `text-[11px] border rounded px-2 py-1 outline-none ${isAcademic ? 'bg-[#2a1f1a] text-[#e8d5b7] border-parchment/20 focus:border-ember' : 'bg-[#f5f2ed] text-[#2a1f1a] border-[#c9c3b8] focus:border-[#8a3a3a]'}`
  const optionCls = isAcademic ? 'bg-[#2a1f1a] text-[#e8d5b7]' : 'bg-[#f5f2ed] text-[#2a1f1a]'
  const hasArticles = filter.view === 'mine'
    ? Object.values(groups).some(group => group.length > 0)
    : articles.length > 0

  const grid = (items: AnthropicArticleMeta[], group?: BlogMineGroup) => (
    <div className="grid gap-5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))' }}>
      {items.map(article => <WallCard key={article.url} article={article} group={group} onOpenArticle={onOpenArticle} onReorder={onReorder} />)}
    </div>
  )

  const dropGroup = (event: DragEvent<HTMLElement>, target: BlogMineGroup) => {
    if (!event.dataTransfer.types.includes(GROUP_MIME)) return
    const source = event.dataTransfer.getData(GROUP_MIME) as BlogMineGroup
    if (!LABELS[source] || source === target) return
    event.preventDefault()
    const rect = event.currentTarget.getBoundingClientRect()
    onReorder({ kind: 'group', source, target, placement: event.clientY > rect.top + rect.height / 2 ? 'after' : 'before' })
  }

  return (
    <div data-testid="blog-wall" className={`h-full overflow-y-auto px-8 py-6 ${isAcademic ? 'text-parchment' : 'text-[#1a1a1a]'}`}>
      <div className="flex flex-wrap items-center gap-2 pb-5 pr-24">
        <BlogFilterTabs area="wall" value={filter} onChange={onFilterChange} theme={theme} />
        {filter.view === 'all' && (
          <select data-testid="blog-wall-sort-select" aria-label="排序博客" value={sortBy} onChange={event => onSortByChange(event.target.value as BlogWallSort)} className={selectCls}>
            <option className={optionCls} value="newest">最新发布</option>
            <option className={optionCls} value="oldest">最早发布</option>
          </select>
        )}
      </div>
      {loading && !hasArticles ? (
        <div data-testid="blog-wall-loading" className={`flex h-[calc(100%-3rem)] items-center justify-center text-sm ${isAcademic ? 'text-parchment/40' : 'text-[#6b5d52]'}`}>正在加载博客…</div>
      ) : filter.view === 'mine' ? (
        <div className="space-y-7">
          {order.groups.map(group => (
            <BlogMineGroupSection
              key={group}
              area="wall"
              group={group}
              label={LABELS[group]}
              count={groups[group].length}
              collapsed={collapsedGroups[group]}
              onToggle={() => onToggleGroup(group)}
              onGroupDragStart={event => { event.dataTransfer.setData(GROUP_MIME, group); event.dataTransfer.effectAllowed = 'move' }}
              onGroupDragOver={event => { if (event.dataTransfer.types.includes(GROUP_MIME)) event.preventDefault() }}
              onGroupDrop={event => dropGroup(event, group)}
              recommendationTools={group === 'favorite' ? <BlogRecommendationTools theme={theme} /> : undefined}
            >
              {groups[group].length > 0 ? grid(groups[group], group) : (
                <p className={`py-3 text-xs ${isAcademic ? 'text-parchment/35' : 'text-[#6b5d52]/70'}`}>暂无文章</p>
              )}
            </BlogMineGroupSection>
          ))}
        </div>
      ) : articles.length === 0 ? (
        <div className={`flex h-[calc(100%-3rem)] flex-col items-center justify-center gap-3 text-sm ${isAcademic ? 'text-parchment/40' : 'text-[#6b5d52]'}`}>
          <p>当前筛选下暂无文章</p>
          <button type="button" data-testid="blog-wall-clear-filters" onClick={onClearFilters} className={isAcademic ? 'text-ember' : 'text-[#8a3a3a]'}>清空筛选</button>
        </div>
      ) : grid(articles)}
    </div>
  )
}
