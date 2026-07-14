import type { BriefingTheme } from '@shared/index'

interface Props {
  collapsed: boolean
  onToggle: () => void
  theme: BriefingTheme
  width?: 64 | 80 // px rail width in tailwind units; 64 for dates, 80 for blog list
  title: string
  children: React.ReactNode
}

export function BriefingListColumn({ collapsed, onToggle, theme, width = 64, title, children }: Props) {
  const isAcademic = theme !== 'newspaper'

  const themeClasses = isAcademic
    ? {
        bg: 'bg-ink/50',
        border: 'border-r border-[rgba(232,213,183,0.18)]',
        headerText: 'text-parchment',
        toggle: 'text-parchment/60 hover:text-parchment',
        headerBorder: 'border-b border-[rgba(232,213,183,0.18)]',
      }
    : {
        bg: 'bg-[#e8e4de]',
        border: 'border-r border-[#c9c3b8]',
        headerText: 'text-[#2a1f1a]',
        toggle: 'text-[#2a1f1a]/60 hover:text-[#2a1f1a]',
        headerBorder: 'border-b border-[#c9c3b8]',
      }

  const widthClass = width === 80 ? 'w-80' : 'w-64'

  return (
    <aside
      data-testid="briefing-list-column"
      className={`h-full flex flex-col transition-all ${collapsed ? 'w-14' : widthClass} ${themeClasses.bg} ${themeClasses.border} z-[5]`}
    >
      <div className={`flex items-center justify-between px-3 py-4 ${themeClasses.headerBorder}`}>
        {!collapsed && <span className={`text-sm font-serif ${themeClasses.headerText}`}>{title}</span>}
        <button
          data-testid="briefing-list-column-toggle"
          onClick={onToggle}
          className={themeClasses.toggle}
          title={collapsed ? '展开' : '折叠'}
        >
          {collapsed ? '▶' : '◀'}
        </button>
      </div>
      {!collapsed && <div className="flex-1 min-h-0 overflow-y-auto">{children}</div>}
    </aside>
  )
}
