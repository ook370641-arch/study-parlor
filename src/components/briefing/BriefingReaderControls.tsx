import { SwapPaintingButton } from '@/components/SwapPaintingButton'
import type { BriefingFontSize, BriefingTheme } from '@shared/index'

type Props = {
  theme: BriefingTheme
  fontSize: BriefingFontSize
  onDecrease: () => void
  onIncrease: () => void
  swapTestId: string
  fontTestIdPrefix: string
  disabled?: boolean
  disabledTitle?: string
  label?: string
}

export function BriefingReaderControls({
  theme,
  fontSize,
  onDecrease,
  onIncrease,
  swapTestId,
  fontTestIdPrefix,
  disabled = false,
  disabledTitle,
  label = '字号',
}: Props) {
  const isAcademic = theme !== 'newspaper'
  const fontSizeBtnCls = `pointer-events-auto ${isAcademic ? 'swap-btn' : 'swap-btn-newspaper w-9 h-9 flex items-center justify-center'}`

  return (
    <div className="pointer-events-none absolute top-4 right-4 z-20 flex items-start gap-1">
      {isAcademic && (
        <SwapPaintingButton
          surface="briefing"
          data-testid={swapTestId}
          className="pointer-events-auto text-parchment/70 hover:text-parchment"
        />
      )}
      <button
        type="button"
        data-testid={`${fontTestIdPrefix}-font-size-decrease`}
        disabled={disabled || fontSize === 'sm'}
        onClick={onDecrease}
        className={`text-sm disabled:opacity-20 disabled:cursor-not-allowed ${fontSizeBtnCls}`}
        title={disabled && disabledTitle ? disabledTitle : `减小${label}`}
      >
        −
      </button>
      <button
        type="button"
        data-testid={`${fontTestIdPrefix}-font-size-increase`}
        disabled={disabled || fontSize === '7xl'}
        onClick={onIncrease}
        className={`text-sm disabled:opacity-20 disabled:cursor-not-allowed ${fontSizeBtnCls}`}
        title={disabled && disabledTitle ? disabledTitle : `增大${label}`}
      >
        +
      </button>
    </div>
  )
}
