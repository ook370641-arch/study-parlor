import { SwapPaintingButton } from '@/components/SwapPaintingButton'
import { useStore } from '@/store'
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
  immersiveDisabled?: boolean
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
  immersiveDisabled = false,
}: Props) {
  const isAcademic = theme !== 'newspaper'
  const immersive = useStore((s) => s.immersiveMode)
  const toggleImmersive = useStore((s) => s.toggleImmersiveMode)
  const fontSizeBtnCls = `pointer-events-auto ${isAcademic ? 'swap-btn' : 'swap-btn-newspaper w-9 h-9 flex items-center justify-center'}`

  return (
    <div className={`absolute top-4 right-4 z-20 ${immersive ? 'group/reader -m-3 p-3' : ''}`}>
      <div
        data-testid="reader-controls"
        className={`pointer-events-none flex items-start gap-1 transition-opacity duration-200 ${immersive ? 'opacity-0 group-hover/reader:opacity-100 group-focus-within:opacity-100' : ''}`}
      >
        {isAcademic && (
          <SwapPaintingButton
            surface="briefing"
            data-testid={swapTestId}
            className="text-parchment/70 hover:text-parchment"
          />
        )}
        <button
          type="button"
          data-testid={`${fontTestIdPrefix}-immersive-toggle`}
          disabled={immersiveDisabled}
          onClick={toggleImmersive}
          aria-pressed={immersive}
          className={`${fontSizeBtnCls} disabled:opacity-20 disabled:cursor-not-allowed ${immersive ? 'text-ember' : ''}`}
          title={immersive ? '退出沉浸模式 (Esc)' : '沉浸模式'}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="w-4 h-4"
          >
            <path d="M8 3H5a2 2 0 0 0-2 2v3" />
            <path d="M16 3h3a2 2 0 0 1 2 2v3" />
            <path d="M8 21H5a2 2 0 0 1-2-2v-3" />
            <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
          </svg>
        </button>
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
    </div>
  )
}
