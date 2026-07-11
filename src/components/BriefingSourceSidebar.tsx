import { useStore } from '@/store'
import type { BriefingTheme } from '@shared/index'

interface Props {
  collapsed: boolean
  onToggle: () => void
  theme: BriefingTheme
}

function DigestIcon() {
  return (
    <svg
      data-testid="briefing-source-icon-digest"
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

function AnthropicIcon() {
  return (
    <svg
      data-testid="briefing-source-icon-anthropic"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 4l7 16H5l7-16z" />
      <path d="M9 13h6" />
    </svg>
  )
}

function JobBriefingIcon() {
  return (
    <svg
      data-testid="briefing-source-icon-job-briefing"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="7" width="18" height="13" rx="1.5" />
      <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18" />
    </svg>
  )
}

export function BriefingSourceSidebar({ collapsed, onToggle, theme }: Props) {
  const source = useStore((s) => s.briefingSource)
  const setSource = useStore((s) => s.setBriefingSource)

  const isAcademic = theme !== 'newspaper'

  const themeClasses = isAcademic
    ? {
        bg: 'bg-ink/70',
        border: 'border-r border-[rgba(232,213,183,0.18)]',
        headerText: 'text-parchment',
        toggle: 'text-parchment/60 hover:text-parchment',
        active: 'bg-[rgba(232,213,183,0.1)] text-parchment border-[#d97757]',
        inactive: 'text-parchment/70 hover:bg-[rgba(232,213,183,0.06)]',
        headerBorder: 'border-b border-[rgba(232,213,183,0.18)]',
      }
    : {
        bg: 'bg-[#e8e4de]',
        border: 'border-r border-[#c9c3b8]',
        headerText: 'text-[#2a1f1a]',
        toggle: 'text-[#2a1f1a]/60 hover:text-[#2a1f1a]',
        active: 'bg-[rgba(0,0,0,0.06)] text-[#2a1f1a] border-[#1a1a1a]',
        inactive: 'text-[#2a1f1a]/70 hover:bg-[rgba(0,0,0,0.04)]',
        headerBorder: 'border-b border-[#c9c3b8]',
      }

  const base = `w-full text-left py-2 transition-colors flex items-center gap-3 ${collapsed ? 'justify-center px-2' : 'px-3'} ${collapsed ? '' : 'rounded'}`

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
    {
      id: 'job-briefing',
      label: '求职简报',
      icon: JobBriefingIcon,
      testId: 'briefing-source-job-briefing',
    },
  ] as const

  return (
    <aside
      data-testid="briefing-source-sidebar"
      className={`h-full flex flex-col transition-all ${collapsed ? 'w-14' : 'w-48'} ${themeClasses.bg} ${themeClasses.border} z-[5]`}
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
              className={`${base} ${isActive ? `rounded-none border-l-[3px] ${themeClasses.active}` : themeClasses.inactive}`}
              title={item.label}
            >
              <Icon />
              {!collapsed && <span>{item.label}</span>}
            </button>
          )
        })}
      </nav>
    </aside>
  )
}
