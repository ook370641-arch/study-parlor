import { useStore } from '@/store'

interface Props {
  collapsed: boolean
  onToggle: () => void
}

export function BriefingSourceSidebar({ collapsed, onToggle }: Props) {
  const source = useStore((s) => s.briefingSource)
  const setSource = useStore((s) => s.setBriefingSource)

  const base = 'w-full text-left px-3 py-2 rounded transition-colors'
  const active = 'bg-ember/20 text-parchment'
  const inactive = 'text-parchment/70 hover:bg-slate/10'

  return (
    <aside
      data-testid="briefing-source-sidebar"
      className={`h-full flex flex-col border-r border-slate/30 bg-ink/80 transition-all ${collapsed ? 'w-14' : 'w-48'}`}
    >
      <div className="flex items-center justify-between px-3 py-4 border-b border-slate/30">
        {!collapsed && <span className="text-sm font-serif text-parchment">来源</span>}
        <button
          data-testid="briefing-sidebar-toggle"
          onClick={onToggle}
          className="text-parchment/60 hover:text-parchment"
          title={collapsed ? '展开' : '折叠'}
        >
          {collapsed ? '▶' : '◀'}
        </button>
      </div>
      <nav className="flex-1 p-2 space-y-2">
        <button
          data-testid="briefing-source-digest"
          onClick={() => {
            setSource('digest')
            if (collapsed) onToggle()
          }}
          className={`${base} ${source === 'digest' ? active : inactive}`}
          title="AI 日报"
        >
          {collapsed ? '日' : 'AI 日报'}
        </button>
        <button
          data-testid="briefing-source-anthropic"
          onClick={() => {
            setSource('anthropic')
            if (collapsed) onToggle()
          }}
          className={`${base} ${source === 'anthropic' ? active : inactive}`}
          title="Anthropic 博客"
        >
          {collapsed ? 'A' : 'Anthropic 博客'}
        </button>
      </nav>
    </aside>
  )
}
