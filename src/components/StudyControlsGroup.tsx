import { useStore } from '@/store'
import { SwapPaintingButton } from './SwapPaintingButton'

interface Props {
  surface: 'home' | 'study'
  className?: string
  fontMode?: 'theme' | 'writing' | 'study'
}

export function StudyControlsGroup({ surface, className = '', fontMode = 'theme' }: Props) {
  const theme = useStore((s) => s.briefingTheme)
  const setTheme = useStore((s) => s.setBriefingTheme)
  const writingUIFontSize = useStore((s) => s.writingUIFontSize)
  const decreaseWritingUIFontSize = useStore((s) => s.decreaseWritingUIFontSize)
  const increaseWritingUIFontSize = useStore((s) => s.increaseWritingUIFontSize)
  const studyFontSize = useStore((s) => s.studyFontSize)
  const decreaseStudyFontSize = useStore((s) => s.decreaseStudyFontSize)
  const increaseStudyFontSize = useStore((s) => s.increaseStudyFontSize)
  const isAcademic = theme !== 'newspaper'

  const toggleTheme = () => {
    setTheme(isAcademic ? 'newspaper' : 'academic')
  }

  const btnCls = isAcademic
    ? 'border-parchment/25 text-parchment/50 hover:text-parchment hover:border-parchment/40'
    : 'border-[#2a1f1a]/25 text-[#2a1f1a]/50 hover:text-[#2a1f1a] hover:border-[#2a1f1a]/40'

  return (
    <div className={`flex items-center gap-1 ${className}`}>
      {isAcademic && (
        <SwapPaintingButton
          surface={surface}
          theme={theme}
          data-testid="study-controls-swap-painting"
        />
      )}
      {fontMode !== 'theme' ? (
        <>
          <button
            type="button"
            data-testid="study-controls-font-size-decrease"
            disabled={fontMode === 'study' ? studyFontSize === 'sm' : writingUIFontSize === 'sm'}
            onClick={() => void (fontMode === 'study' ? decreaseStudyFontSize() : decreaseWritingUIFontSize())}
            className={`w-7 h-7 rounded-full border flex items-center justify-center text-sm transition-colors disabled:opacity-20 disabled:cursor-not-allowed ${btnCls}`}
            title="减小界面字号"
          >
            −
          </button>
          <button
            type="button"
            data-testid="study-controls-font-size-increase"
            disabled={fontMode === 'study' ? studyFontSize === '3xl' : writingUIFontSize === '7xl'}
            onClick={() => void (fontMode === 'study' ? increaseStudyFontSize() : increaseWritingUIFontSize())}
            className={`w-7 h-7 rounded-full border flex items-center justify-center text-sm transition-colors disabled:opacity-20 disabled:cursor-not-allowed ${btnCls}`}
            title="增大界面字号"
          >
            +
          </button>
        </>
      ) : (
        <button
          type="button"
          data-testid="study-controls-theme-toggle"
          onClick={toggleTheme}
          className={`w-7 h-7 rounded-full border flex items-center justify-center transition-colors ${btnCls}`}
          title={isAcademic ? '切换报纸版式' : '切换学术版式'}
        >
          {isAcademic ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <line x1="3" y1="9" x2="21" y2="9" />
              <line x1="9" y1="21" x2="9" y2="9" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
              <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
            </svg>
          )}
        </button>
      )}
    </div>
  )
}
