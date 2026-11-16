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
    `rounded-full border px-2 py-0.5 text-[10px] transition-colors ${active ? 'border-ember text-ember' : muted}`

  const viewButton = (view: BlogView, label: string) => {
    const active = value.view === view
    return (
      <button
        key={`view-${view}`}
        type="button"
        data-testid={`${area}-view-${view}`}
        aria-pressed={active}
        onClick={() => onChange(selectBlogView(value, view))}
        className={buttonClass(active)}
        style={active ? undefined : { borderColor: 'transparent' }}
      >
        {label}
      </button>
    )
  }

  const sourceButton = (source: BlogSourceFilter, label: string, color?: string) => {
    const active = value.source === source
    return (
      <button
        key={`source-${source}`}
        type="button"
        data-testid={`${area}-source-${source}`}
        aria-pressed={active}
        onClick={() => onChange(selectBlogSource(value, source))}
        className={buttonClass(active)}
        style={active ? { borderColor: color ?? '#d97757', color: color ?? '#d97757' } : { borderColor: 'transparent' }}
      >
        {label}
      </button>
    )
  }

  return (
    <div className="space-y-1.5" data-testid={`${area}-blog-filter-tabs`}>
      <div className="flex flex-wrap items-center gap-1.5" data-testid={`${area}-view-filter-row`}>
        {viewButton('mine', '我的')}
        {viewButton('all', '全部')}
      </div>
      <div className={`flex flex-wrap items-center gap-1.5 border-l pl-2 ${isAcademic ? 'border-parchment/15' : 'border-[#6b5d52]/20'}`} data-testid={`${area}-source-filter-row`}>
        <span className={`pr-0.5 text-[10px] ${muted}`}>来源</span>
        {sourceButton('all', '全部来源')}
        {ANTHROPIC_SOURCES.map(source => sourceButton(source.key, source.label, source.color))}
      </div>
    </div>
  )
}
