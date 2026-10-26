import type { AnthropicArticleMeta, AnthropicSectionKey, BriefingTheme } from '@shared/index'
import { coverImageUrl, type BlogWallSort } from '@/lib/anthropic-articles'
import type { BlogFilter } from '@/lib/section-filter'
import { ANTHROPIC_SOURCES, LEGACY_SECTION_META, sectionOf } from '@/lib/anthropic-sections'

interface Props {
  articles: AnthropicArticleMeta[]
  loading: boolean
  filter: BlogFilter
  sortBy: BlogWallSort
  onFilterChange: (filter: BlogFilter) => void
  onSortByChange: (sort: BlogWallSort) => void
  onOpenArticle: (article: AnthropicArticleMeta) => void
  onClearFilters: () => void
  theme?: BriefingTheme
}

export function BlogWall({ articles, loading, filter, sortBy, onFilterChange, onSortByChange, onOpenArticle, onClearFilters, theme = 'academic' }: Props) {
  const isAcademic = theme !== 'newspaper'
  const selected = filter.mode === 'pick' ? [...filter.selected] : []
  const filterValue = filter.mode === 'pick' && selected.length === 1 ? selected[0] : filter.mode === 'pick' ? 'custom' : filter.mode
  const selectCls = `text-[11px] border rounded px-2 py-1 outline-none ${isAcademic ? 'bg-[#2a1f1a] text-[#e8d5b7] border-parchment/20 focus:border-ember' : 'bg-[#f5f2ed] text-[#2a1f1a] border-[#c9c3b8] focus:border-[#8a3a3a]'}`
  const optionCls = isAcademic ? 'bg-[#2a1f1a] text-[#e8d5b7]' : 'bg-[#f5f2ed] text-[#2a1f1a]'

  const changeFilter = (value: string) => {
    if (value === 'all') onFilterChange({ mode: 'all' })
    else if (value === 'mine') onFilterChange({ mode: 'mine' })
    else if (value !== 'custom') onFilterChange({ mode: 'pick', selected: new Set([value as AnthropicSectionKey]) })
  }

  return (
    <div data-testid="blog-wall" className={`h-full overflow-y-auto px-8 py-6 ${isAcademic ? 'text-parchment' : 'text-[#1a1a1a]'}`}>
      <div className="flex items-center gap-2 pb-5 pr-24">
        <select data-testid="blog-wall-filter-select" aria-label="筛选博客" value={filterValue} onChange={e => changeFilter(e.target.value)} className={selectCls}>
          <option className={optionCls} value="all">全部文章</option>
          <option className={optionCls} value="mine">已导入</option>
          {filterValue === 'custom' && <option className={optionCls} value="custom">已选 {selected.length} 个来源</option>}
          {ANTHROPIC_SOURCES.map(source => <option className={optionCls} key={source.key} value={source.key}>{source.label}</option>)}
        </select>
        <select data-testid="blog-wall-sort-select" aria-label="排序博客" value={sortBy} onChange={e => onSortByChange(e.target.value as BlogWallSort)} className={selectCls}>
          <option className={optionCls} value="newest">最新发布</option>
          <option className={optionCls} value="oldest">最早发布</option>
        </select>
      </div>
      {loading && articles.length === 0 ? (
        <div data-testid="blog-wall-loading" className={`flex h-[calc(100%-3rem)] items-center justify-center text-sm ${isAcademic ? 'text-parchment/40' : 'text-[#6b5d52]'}`}>正在加载博客…</div>
      ) : articles.length === 0 ? (
        <div className={`flex h-[calc(100%-3rem)] flex-col items-center justify-center gap-3 text-sm ${isAcademic ? 'text-parchment/40' : 'text-[#6b5d52]'}`}>
          <p>当前筛选下暂无文章</p>
          <button type="button" data-testid="blog-wall-clear-filters" onClick={onClearFilters} className={isAcademic ? 'text-ember' : 'text-[#8a3a3a]'}>清空筛选</button>
        </div>
      ) : (
        <div className="grid gap-5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))' }}>
          {articles.map(article => {
            const section = article.local === 'constitution' ? null : ANTHROPIC_SOURCES.find(s => s.key === sectionOf(article)) ?? LEGACY_SECTION_META[sectionOf(article)]
            const color = section?.color ?? '#6b5d52'
            return (
              <button
                type="button"
                key={article.url}
                data-testid={`blog-wall-card-${article.url}`}
                onClick={() => onOpenArticle(article)}
                className="group relative rounded-md overflow-hidden text-left"
                style={{ aspectRatio: '3/4', boxShadow: '0 6px 16px rgba(0,0,0,.35)', background: `linear-gradient(135deg, ${color}88, ${color}22 58%, #1a120d)` }}
              >
                <div data-testid={`blog-wall-cover-fallback-${article.url}`} className="absolute inset-0 flex items-center justify-center p-5 text-center font-serif text-lg text-white/65">
                  {section?.label ?? 'Anthropic'}
                </div>
                {article.imageUrl && <img src={coverImageUrl(article.imageUrl)} alt="" loading="lazy" decoding="async" onError={e => { e.currentTarget.style.display = 'none' }} className="absolute inset-0 h-full w-full object-cover" />}
                <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(20,12,8,0) 32%, rgba(20,12,8,.94))' }} />
                {article.isSaved && <span data-testid={`blog-wall-saved-${article.url}`} className="absolute right-2 top-2 rounded bg-black/45 px-1.5 py-0.5 text-[9px] text-white/85">已导入</span>}
                <div className="absolute inset-x-0 bottom-0 p-3 text-[#f0e2c8]">
                  <div className="line-clamp-3 group-hover:line-clamp-none text-[13px] leading-snug">{article.title}</div>
                  <div className="mt-2 text-[10px] text-[#f0e2c8]/65">{section?.label ?? 'Anthropic'}{article.publishedAt ? ` · ${article.publishedAt.slice(0, 10)}` : ''}</div>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
