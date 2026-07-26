import { useEffect, useRef, useState } from 'react'
import { useStore } from '@/store'
import { SWAP_DROP_DELAY_MS, SWAP_TOTAL_MS } from '@/lib/motion-presets'

// vignette 暗角与画作解耦：即使画作未就绪（时序/缓存/HMR），暗角也必须渲染，
// 保证文字可读性不依赖画作加载状态。inline style 优先级最高，不受 CSS 加载顺序影响。
const VIGNETTE_STYLE = {
  background: `
    linear-gradient(to right,
      rgba(15, 10, 8, 0.55) 0%,
      rgba(15, 10, 8, 0.08) 28%,
      rgba(15, 10, 8, 0.08) 72%,
      rgba(15, 10, 8, 0.55) 100%),
    linear-gradient(to bottom,
      rgba(15, 10, 8, 0.55) 0%,
      rgba(15, 10, 8, 0.05) 18%,
      rgba(15, 10, 8, 0.05) 80%,
      rgba(15, 10, 8, 0.55) 100%),
    radial-gradient(ellipse at center, transparent 35%, rgba(0,0,0,0.4) 100%)
  `.replace(/\s+/g, ' ').trim(),
}

interface Props {
  surface: 'cover' | 'home' | 'study' | 'briefing'
}

export function SurfaceBackground({ surface }: Props) {
  const theme = useStore((s) => s.briefingTheme)
  const painting = useStore(s => s.currentPaintings[surface])
  const [settledUrl, setSettledUrl] = useState<string | null>(painting?.url ?? null)
  const [outgoingUrl, setOutgoingUrl] = useState<string | null>(null)
  const [incomingUrl, setIncomingUrl] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!painting) return
    if (painting.url === settledUrl || painting.url === incomingUrl) return
    setOutgoingUrl(settledUrl)
    setIncomingUrl(painting.url)
    timer.current = window.setTimeout(() => {
      setSettledUrl(painting.url)
      setOutgoingUrl(null)
      setIncomingUrl(null)
    }, SWAP_TOTAL_MS)
    return () => { if (timer.current) clearTimeout(timer.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [painting?.url])

  // 报纸版式下仅封面保留画作
  if (theme === 'newspaper' && surface !== 'cover') return null

  // 始终渲染 vignette 暗角（保证文字可读性），画作就绪后才渲染图片层。
  if (!painting || !settledUrl) {
    return (
      <div
        data-testid="surface-background"
        className="fixed inset-0 z-0 pointer-events-none"
      >
        <div className="absolute inset-0" style={VIGNETTE_STYLE} />
      </div>
    )
  }

  const swapping = incomingUrl !== null

  return (
    <div
      data-testid="surface-background"
      data-swapping={swapping ? '' : undefined}
      className="fixed inset-0 z-0 pointer-events-none"
    >
      {outgoingUrl && (
        <img
          src={outgoingUrl}
          alt=""
          className="absolute inset-0 w-full h-full object-cover painting-fall-out"
        />
      )}
      <img
        key={incomingUrl ?? settledUrl}
        src={incomingUrl ?? settledUrl}
        alt=""
        className={`absolute inset-0 w-full h-full object-cover ${incomingUrl ? 'painting-drop-in' : ''}`}
        style={incomingUrl ? { animationDelay: `${SWAP_DROP_DELAY_MS}ms` } : undefined}
      />
      <div className={`absolute inset-0 painting-crt ${swapping ? 'on' : ''}`} />
      <div className="absolute inset-0" style={VIGNETTE_STYLE} />
    </div>
  )
}
