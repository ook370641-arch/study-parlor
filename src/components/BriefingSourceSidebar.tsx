import { useStore } from '@/store'
import type { BriefingTheme } from '@shared/index'

interface Props {
  collapsed: boolean
  onToggle: () => void
  theme: BriefingTheme
}

function DigestIcon({ className }: { className?: string }) {
  return (
    <svg
      data-testid="briefing-source-icon"
      className={className}
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="5" width="18" height="14" rx="1" />
      <path d="M7 9h10M7 13h10M7 17h6" />
    </svg>
  )
}

function AnthropicIcon({ className }: { className?: string }) {
  return (
    <svg
      data-testid="briefing-source-icon"
      className={className}
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 4 L20 8 L12 12 L4 8 Z" />
      <path d="M4 8v8l8 4 8-4V8" />
      <path d="M12 12v8" />
    </svg>
  )
}

export function BriefingSourceSidebar({ collapsed, onToggle, theme }: Props) {
  const source = useStore((s) => s.briefingSource)
  const setSource = useStore((s) => s.setBriefingSource)

  const isAcademic = theme === 'academic'

  const themeClasses = isAcademic
    ? {
        bg: 'bg-[#3d2f27]',
        border: 'border-r border-[rgba(232,213,183,0.18)]',
        headerText: 'text-parchment',
        toggle: 'text-parchment/60 hover:text-parchment',
        active: 'bg-[rgba(232,213,183,0.1)] text-parchment border-l-[3px] border-l-[#d97757]',
        inactive: 'text-parchment/70 hover:bg-[rgba(232,213,183,0.06)]',
        headerBorder: 'border-b border-[rgba(232,213,183,0.18)]',
      }
    : {
        bg: 'bg-[#e8e4de]',
        border: 'border-r border-[#c9c3b8]',
        headerText: 'text-[#2a1f1a]',
        toggle: 'text-[#2a1f1a]/60 hover:text-[#2a1f1a]',
        active: 'bg-[rgba(0,0,0,0.06)] text-[#2a1f1a] border-l-[3px] border-l-[#1a1a1a]',
        inactive: 'text-[#2a1f1a]/70 hover:bg-[rgba(0,0,0,0.04)]',
        headerBorder: 'border-b border-[#c9c3b8]',
      }

  const base = `w-full text-left px-3 py-2 rounded transition-colors flex items-center gap-3 ${collapsed ? 'justify-center' : ''}`

  const navItems = [
    {
      id: 'digest',
      label: 'AI 日报',
      icon: DigestIcon,
      testId: 'briefing-source-digest',
    },
    {
      id: 'anthropic',
      label: 'Anthropic 博客',
      icon: AnthropicIcon,
      testId: 'briefing-source-anthropic',
    },
  ] as const

  return (
    <aside
      data-testid="briefing-source-sidebar"
      className={`h-full flex flex-col transition-all ${collapsed ? 'w-14' : 'w-48'} ${themeClasses.bg} ${themeClasses.border}`}
    >
      <div className={`flex items-center justify-between px-3 py-4 ${themeClasses.headerBorder}`}>
        {!collapsed && <span className={`text-sm font-serif ${themeClasses.headerText}`}>来源</span>}
        <button
          data-testid="briefing-sidebar-toggle"
          onClick={onToggle}
          className={themeClasses.toggle}
          title={collapsed ? '展开' : '折叠'}
        >
          {collapsed ? '▶' : '◀'}
        </button>
      </div>
      <nav className="flex-1 p-2 space-y-2">
        {navItems.map((item) => {
          const Icon = item.icon
          const isActive = source === item.id
          return (
            <button
              key={item.id}
              data-testid={item.testId}
              onClick={() => {
                setSource(item.id)
                if (collapsed) onToggle()
              }}
              className={`${base} ${isActive ? themeClasses.active : themeClasses.inactive}`}
              title={item.label}
            >
              <Icon className={isActive ? (isAcademic ? 'text-parchment' : 'text-[#2a1f1a]') : ''} />
              {!collapsed && <span>{item.label}</span>}
            </button>
          )
        })}
      </nav>
    </aside>
  )
}
