import { useEffect, useRef, useState } from 'react'
import { useStore } from '@/store'
import { SWAP_TOTAL_MS } from '@/lib/motion-presets'
import { PaintingLabel } from './PaintingLabel'
import type { BriefingTheme } from '@shared/index'

interface Props {
  surface: 'cover' | 'home' | 'study' | 'briefing'
  theme?: BriefingTheme
  className?: string
  'data-testid'?: string
}

export function SwapPaintingButton({ surface, theme, className = '', 'data-testid': dataTestId }: Props) {
  const swap = useStore(s => s.swapPainting)
  const [locked, setLocked] = useState(false)
  const lockTimer = useRef<number | null>(null)

  useEffect(() => () => { if (lockTimer.current) clearTimeout(lockTimer.current) }, [])

  const onSwap = () => {
    if (locked) return
    setLocked(true)
    swap(surface)
    lockTimer.current = window.setTimeout(() => setLocked(false), SWAP_TOTAL_MS)
  }

  const isNewspaper = theme === 'newspaper'

  return (
    <span className={`group inline-flex items-center gap-2 ${className}`}>
      <PaintingLabel surface={surface} />
      <button
        data-testid={dataTestId}
        type="button"
        onClick={onSwap}
        disabled={locked}
        className={`${isNewspaper ? 'swap-btn-newspaper' : 'swap-btn'} ${locked ? 'opacity-50 cursor-default' : ''}`}
        aria-label="换一幅画"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="w-4 h-4 transition-transform duration-300 group-hover:rotate-180"
        >
          <path d="M21 12a9 9 0 1 1-3.51-7.13M21 4v5h-5"/>
        </svg>
      </button>
    </span>
  )
}
