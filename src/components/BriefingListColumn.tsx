import type { BriefingTheme } from '@shared/index'

interface Props {
  collapsed: boolean
  onToggle: () => void
  theme: BriefingTheme
  width?: 44 | 64 | 80 // Tailwind spacing units (w-44=176px, w-64=256px, w-80=320px); 44 for dates, 64 for writing, 80 for blog list
  title: string
  children: React.ReactNode
}

export function BriefingListColumn({ collapsed, onToggle, theme, width = 64, title, children }: Props) {
  const isAcademic = theme !== 'newspaper'

  const themeClasses = isAcademic
    ? {
        bg: 'border border-parchment/15 rounded-xl',
        border: '',
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

  const widthClass = width === 80 ? 'w-80' : width === 44 ? 'w-44' : 'w-64'

  return (
    <aside
      data-testid="briefing-list-column"
      className={`h-full flex flex-col transition-[width] duration-200 ease-out ${collapsed ? 'w-14 overflow-hidden' : widthClass} ${themeClasses.bg} ${themeClasses.border} z-[5]`}
    >
      <div className={`flex items-center ${collapsed ? 'justify-center' : 'justify-between'} px-3 py-4 ${themeClasses.headerBorder}`}>
        {!collapsed && <span className={`text-sm font-serif ${themeClasses.headerText}`}>{title}</span>}
        <button
          data-testid="briefing-list-column-toggle"
          onClick={onToggle}
          className={`w-7 h-7 rounded-full flex items-center justify-center text-sm transition-colors ${
            isAcademic ? 'text-parchment/60 hover:text-parchment hover:bg-parchment/10' : 'text-[#2a1f1a]/60 hover:text-[#2a1f1a] hover:bg-[#1a1a1a]/5'
          }`}
          title={collapsed ? '展开' : '折叠'}
        >
          {collapsed ? '▶' : '◀'}
        </button>
      </div>
      <div
        className="flex-1 min-h-0 overflow-y-auto overscroll-contain"
        style={{ willChange: 'transform', transform: 'translateZ(0)' }}
      >
        {children}
      </div>
    </aside>
  )
}
