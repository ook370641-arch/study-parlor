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
      className={`p-2 rounded-md transition-colors ${
        isAcademic
          ? 'text-parchment/70 hover:text-parchment hover:bg-parchment/10'
          : 'text-[#1a1a1a] hover:text-[#555] hover:bg-[#1a1a1a]/5'
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
