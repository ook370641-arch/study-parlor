import { useStore } from '@/store'
import type { BriefingTheme } from '@shared/index'
import { BackToCover } from './BackToCover'
import { Button } from './Button'
import { BriefingThemeToggle } from './briefing/BriefingThemeToggle'

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
  const increase = useStore((s) => s.increaseBriefingFontSize)
  const decrease = useStore((s) => s.decreaseBriefingFontSize)
  const fontSize = useStore((s) => s.briefingFontSize)
  const goto = useStore((s) => s.goto)
  const canDecrease = fontSize !== 'sm'
  const canIncrease = fontSize !== '7xl'

  const isAcademic = theme !== 'newspaper'

  const themeClasses = isAcademic
    ? {
        bg: 'bg-ink/45 backdrop-blur-md border border-parchment/15 rounded-xl',
        border: '',
        headerText: 'text-parchment',
        toggle: 'text-parchment/60 hover:text-parchment',
        active: 'bg-[rgba(232,213,183,0.1)] text-parchment',
        inactive: 'text-parchment/70 hover:bg-[rgba(232,213,183,0.06)]',
        headerBorder: 'border-b border-[rgba(232,213,183,0.18)]',
        railBorder: 'border-t border-[rgba(232,213,183,0.18)]',
      }
    : {
        bg: 'bg-[#e8e4de]',
        border: 'border-r border-[#c9c3b8]',
        headerText: 'text-[#2a1f1a]',
        toggle: 'text-[#2a1f1a]/60 hover:text-[#2a1f1a]',
        active: 'bg-[rgba(0,0,0,0.06)] text-[#2a1f1a]',
        inactive: 'text-[#2a1f1a]/70 hover:bg-[rgba(0,0,0,0.04)]',
        headerBorder: 'border-b border-[#c9c3b8]',
        railBorder: 'border-t border-[#c9c3b8]',
      }

  const base = `w-full text-left py-2 transition-colors flex items-center gap-3 ${collapsed ? 'justify-center px-2' : 'px-3'} ${collapsed ? '' : 'rounded'}`

  const navItems = [
    {
      id: 'writing',
      label: '写作',
      icon: () => <span>✍️</span>,
      testId: 'briefing-source-writing',
    },
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
      <div className={`flex items-center ${collapsed ? 'justify-center' : 'justify-between'} px-3 py-4 ${themeClasses.headerBorder}`}>
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
              className={`${base} ${isActive ? `${themeClasses.active} ${
                isAcademic
                  ? source === 'job-briefing'
                    ? 'border-[#7fa8d9] rounded-none border-l-[3px]'
                    : 'border-[#d97757] rounded-none border-l-[3px]'
                  : 'border-[#1a1a1a] rounded-none border-l-[3px]'
              }` : themeClasses.inactive}`}
              title={item.label}
            >
              <Icon />
              {!collapsed && <span>{item.label}</span>}
            </button>
          )
        })}
      </nav>
      <div
        data-testid="briefing-rail-controls"
        className={`flex ${collapsed ? 'flex-col items-center' : 'flex-row items-center'} gap-1 p-2 ${themeClasses.railBorder}`}
      >
        <BackToCover className={isAcademic ? '' : 'text-[#1a1a1a] hover:text-[#555]'} />
        <Button
          variant="ghost"
          onClick={decrease}
          disabled={!canDecrease}
          data-testid="briefing-font-size-decrease"
          className={isAcademic ? '' : 'text-[#1a1a1a] hover:text-[#555]'}
          title="减小字号"
        >
          -
        </Button>
        <Button
          variant="ghost"
          onClick={increase}
          disabled={!canIncrease}
          data-testid="briefing-font-size-increase"
          className={isAcademic ? '' : 'text-[#1a1a1a] hover:text-[#555]'}
          title="增大字号"
        >
          +
        </Button>
        <BriefingThemeToggle />
        {source === 'job-briefing' && (
          <Button
            variant="ghost"
            data-testid="job-briefing-profile-entry"
            onClick={() => goto('settings')}
            className={isAcademic ? '' : 'text-[#1a1a1a] hover:text-[#555]'}
            title="编辑求职档案（意向岗位、方向、经历）"
          >
            档案
          </Button>
        )}
      </div>
    </aside>
  )
}
