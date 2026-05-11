import { useStore } from '@/store'
import { formatAttribution } from '@/lib/paintings'

interface Props {
  surface: 'cover' | 'home' | 'study'
  className?: string
}

export function SwapPaintingButton({ surface, className = '' }: Props) {
  const painting = useStore(s => s.currentPaintings[surface])
  const swap = useStore(s => s.swapPainting)
  const tooltip = painting ? formatAttribution(painting) : ''

  return (
    <button
      type="button"
      onClick={() => swap(surface)}
      title={tooltip}
      className={`swap-btn group ${className}`}
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
  )
}
