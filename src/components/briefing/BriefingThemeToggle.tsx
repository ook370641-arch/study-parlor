import { useStore } from '@/store'

export function BriefingThemeToggle() {
  const theme = useStore((s) => s.briefingTheme)
  const setBriefingTheme = useStore((s) => s.setBriefingTheme)

  const isAcademic = theme === 'academic'

  const handleClick = () => {
    setBriefingTheme(isAcademic ? 'newspaper' : 'academic')
  }

  return (
    <button
      data-testid="briefing-theme-toggle"
      onClick={handleClick}
      className={`w-8 h-8 rounded-full border flex items-center justify-center transition-colors ${
        isAcademic
          ? 'border-parchment/25 text-parchment/50 hover:text-parchment hover:border-parchment/40'
          : 'border-[#2a1f1a]/25 text-[#2a1f1a]/50 hover:text-[#2a1f1a]'
      }`}
      title={isAcademic ? '切换报纸版式' : '切换学术版式'}
    >
      {isAcademic ? (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <line x1="3" y1="9" x2="21" y2="9" />
          <line x1="9" y1="21" x2="9" y2="9" />
        </svg>
      ) : (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
          <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
        </svg>
      )}
    </button>
  )
}
