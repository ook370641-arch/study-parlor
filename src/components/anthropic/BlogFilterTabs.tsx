import { ANTHROPIC_SOURCES } from '@/lib/anthropic-sections'
import { selectBlogSource, selectBlogView, type BlogSourceFilter, type BlogView, type BlogViewFilter } from '@/lib/section-filter'
import type { BriefingTheme } from '@shared/index'

interface Props {
  area: 'list' | 'wall'
  value: BlogViewFilter
  onChange: (next: BlogViewFilter) => void
  theme?: BriefingTheme
}

export function BlogFilterTabs({ area, value, onChange, theme = 'academic' }: Props) {
  const isAcademic = theme !== 'newspaper'
  const muted = isAcademic ? 'text-parchment/50' : 'text-[#6b5d52]'
  const buttonClass = (active: boolean) =>
    `rounded px-3 py-1 text-xs transition-colors ${active
      ? isAcademic ? 'bg-ember/20 text-ember' : 'bg-[#1a1a1a]/10 text-[#1a1a1a]'
      : muted}`

  const viewButton = (view: BlogView, label: string) => {
    const active = value.view === view
    return (
      <button
        key={`view-${view}`}
        type="button"
        role="tab"
        data-testid={`${area}-view-${view}`}
        aria-selected={active}
        aria-pressed={active}
        onClick={() => onChange(selectBlogView(value, view))}
        className={buttonClass(active)}
      >
        {label}
      </button>
    )
  }

  return (
    <div className="flex items-center gap-2" data-testid={`${area}-blog-filter-tabs`}>
      <div role="tablist" aria-label="博客视图" className={`inline-flex items-center gap-0.5 rounded-md border p-0.5 ${isAcademic ? 'border-parchment/15' : 'border-[#6b5d52]/20'}`} data-testid={`${area}-view-filter-row`}>
        {viewButton('mine', '我的')}
        {viewButton('all', '全部')}
      </div>
      <div className="flex items-center gap-2" data-testid={`${area}-source-filter-row`}>
        <select
          id={`${area}-source-select`}
          data-testid={`${area}-source-select`}
          aria-label="按来源筛选"
          value={value.source}
          onChange={event => onChange(selectBlogSource(value, event.target.value as BlogSourceFilter))}
          className={`rounded border px-2 py-1 text-xs outline-none ${isAcademic ? 'border-parchment/20 bg-[#2a1f1a] text-parchment/80' : 'border-[#c9c3b8] bg-[#f5f2ed] text-[#2a1f1a]'}`}
        >
          <option data-testid={`${area}-source-all`} value="all">全部来源</option>
          {ANTHROPIC_SOURCES.map(source => (
            <option key={source.key} data-testid={`${area}-source-${source.key}`} value={source.key}>{source.label}</option>
          ))}
        </select>
      </div>
    </div>
  )
}
