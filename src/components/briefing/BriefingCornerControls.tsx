import { useStore } from '@/store'

export function BriefingCornerControls() {
  const theme = useStore((s) => s.briefingTheme)
  const candle = useStore((s) => s.candlelightEnabled)
  const plate = useStore((s) => s.paintingPlateEnabled)
  const painting = useStore((s) => s.currentPaintings.briefing)
  const toggleCandle = useStore((s) => s.toggleCandlelight)
  const togglePlate = useStore((s) => s.togglePaintingPlate)
  const isAcademic = theme !== 'newspaper'

  return (
    <div className="fixed left-3 bottom-3 z-[6] flex flex-col gap-2">
      <button type="button" data-testid="briefing-candlelight-toggle" aria-pressed={candle}
        disabled={!isAcademic} title={isAcademic ? '烛光随行' : 'Academic 主题下可用'}
        onClick={() => void toggleCandle()}
        className={`w-8 h-8 rounded-full border flex items-center justify-center transition-colors ${
          candle && isAcademic ? 'border-ember/60 text-ember bg-ember/10' : 'border-parchment/25 text-parchment/50'
        } ${!isAcademic ? 'opacity-40 cursor-not-allowed' : ''}`}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
          <path d="M12 3c1.5 2.5 3.5 4.2 3.5 7a3.5 3.5 0 1 1-7 0c0-1.5.6-2.6 1.4-3.7.3 1 .9 1.7 1.6 2.2C11.6 6.6 11.7 4.8 12 3z"/><path d="M9 21h6"/>
        </svg>
      </button>
      <button type="button" data-testid="painting-plate-toggle" aria-pressed={plate}
        disabled={!isAcademic || !painting} title={isAcademic ? '并置画框' : 'Academic 主题下可用'}
        onClick={() => void togglePlate()}
        className={`w-8 h-8 rounded-full border flex items-center justify-center transition-colors ${
          plate && isAcademic ? 'border-ember/60 text-ember bg-ember/10' : 'border-parchment/25 text-parchment/50'
        } ${!isAcademic || !painting ? 'opacity-40 cursor-not-allowed' : ''}`}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
          <rect x="3" y="5" width="18" height="14" rx="1"/><rect x="6.5" y="8" width="11" height="8"/>
        </svg>
      </button>
    </div>
  )
}
