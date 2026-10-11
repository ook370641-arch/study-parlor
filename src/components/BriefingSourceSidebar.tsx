import { useStore } from '@/store'
import type { BriefingTheme } from '@shared/index'
import { BriefingThemeToggle } from './briefing/BriefingThemeToggle'
import { companionPickerTarget } from '@/lib/companion-picker'

interface Props {
  collapsed: boolean
  onToggle: () => void
  theme: BriefingTheme
}

function AnthropicIcon() {
  return (
    <svg
      data-testid="briefing-source-icon-anthropic"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
    >
      <path
        fill="#d97757"
        fillRule="evenodd"
        d="M12 3 21 21h-4.2l-1.6-3.8H8.8L7.2 21H3L12 3Zm0 5.6 1.7 5h-3.4l1.7-5Z"
      />
    </svg>
  )
}

export function BriefingSourceSidebar({ collapsed, onToggle, theme }: Props) {
  const source = useStore((s) => s.briefingSource)
  const setSource = useStore((s) => s.setBriefingSource)
  const picker = useStore((s) => s.writingCompanionPicker)
  const goto = useStore((s) => s.goto)

  // 对照挑选器语境下的来源点击拦截（spec 2026-09-16）：
  // 对照 tab 下点「写作」= 左栏换写作树挑选器（不跳转）；再点「写作」或当前栏目 = 回文章列表。
  const handleNavClick = (id: string) => {
    const s = useStore.getState()
    if (id === 'writing') {
      if (s.writingCompanionPicker) { s.closeWritingCompanionPicker(); return }
      const target = companionPickerTarget({
        briefingSource: s.briefingSource,
        articlePanelMode: s.articlePanelMode,
        articleAssistantGuideCollapsed: s.articleAssistantGuideCollapsed,
        anthropicReaderFilePath: s.anthropicReaderFilePath,
      })
      if (target) { s.openWritingCompanionPicker(target); return }
    } else if (s.writingCompanionPicker && id === s.briefingSource) {
      s.closeWritingCompanionPicker()
      return
    }
    setSource(id as typeof source)
  }
  const candle = useStore((s) => s.candlelightEnabled)
  const plate = useStore((s) => s.paintingPlateEnabled)
  const painting = useStore((s) => s.currentPaintings.briefing)
  const toggleCandle = useStore((s) => s.toggleCandlelight)
  const togglePlate = useStore((s) => s.togglePaintingPlate)
  const isAcademic = theme !== 'newspaper'

  const themeClasses = isAcademic
    ? {
        bg: 'border border-parchment/15 rounded-xl',
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
      id: 'anthropic',
      label: '博客',
      icon: AnthropicIcon,
      testId: 'briefing-source-anthropic',
    },
  ] as const

  return (
    <aside
      data-testid="briefing-source-sidebar"
      className={`h-full flex flex-col transition-[width] duration-200 ease-out ${collapsed ? 'w-14 overflow-hidden' : 'w-40'} ${themeClasses.bg} ${themeClasses.border} z-[5]`}
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
          // picker 打开时来源未切换（仍是博客栏目），active 样式移到「写作」上提示挑选模式
          const isActive = picker ? item.id === 'writing' : source === item.id
          return (
            <button
              key={item.id}
              data-testid={item.testId}
              onClick={() => handleNavClick(item.id)}
              className={`${base} ${isActive ? `${themeClasses.active} ${
                isAcademic
                  ? 'border-[#d97757] rounded-none border-l-[3px]'
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
        className={`flex flex-col items-center gap-2 p-2 ${themeClasses.railBorder}`}
      >
        {/* Candlelight — academic only */}
        {isAcademic && (
          <button type="button" data-testid="briefing-candlelight-toggle" aria-pressed={candle}
            onClick={() => void toggleCandle()}
            className={`w-8 h-8 rounded-full border flex items-center justify-center transition-colors ${
              candle
                ? 'border-ember/60 text-ember bg-ember/10'
                : 'border-parchment/25 text-parchment/50'
            }`}
            title="烛光随行">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
              <path d="M12 3c1.5 2.5 3.5 4.2 3.5 7a3.5 3.5 0 1 1-7 0c0-1.5.6-2.6 1.4-3.7.3 1 .9 1.7 1.6 2.2C11.6 6.6 11.7 4.8 12 3z"/><path d="M9 21h6"/>
            </svg>
          </button>
        )}

        {/* Painting plate — academic only */}
        {isAcademic && painting && (
          <button type="button" data-testid="painting-plate-toggle" aria-pressed={plate}
            onClick={() => void togglePlate()}
            className={`w-8 h-8 rounded-full border flex items-center justify-center transition-colors ${
              plate
                ? 'border-ember/60 text-ember bg-ember/10'
                : 'border-parchment/25 text-parchment/50'
            }`}
            title="并置画框">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
              <rect x="3" y="5" width="18" height="14" rx="1"/><rect x="6.5" y="8" width="11" height="8"/>
            </svg>
          </button>
        )}

        {/* Spacer — pushes navigation controls to bottom */}
        <div className="flex-1" />

        {/* Back to cover */}
        <button
          type="button"
          data-testid="briefing-back-to-cover"
          aria-label="返回封面"
          onClick={() => goto('cover')}
          className={`w-8 h-8 rounded-full border flex items-center justify-center transition-colors ${
            isAcademic ? 'border-parchment/25 text-parchment/50 hover:text-parchment hover:border-parchment/40' : 'border-[#2a1f1a]/25 text-[#2a1f1a]/50 hover:text-[#2a1f1a]'
          }`}
          title="返回封面"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
            <polyline points="9 22 9 12 15 12 15 22"/>
          </svg>
        </button>

        {/* Theme toggle */}
        <BriefingThemeToggle />
      </div>
    </aside>
  )
}
