import { useEffect, useRef, useState } from 'react'
import { useStore } from '@/store'
import { SWAP_DROP_DELAY_MS, SWAP_TOTAL_MS } from '@/lib/motion-presets'

interface Props {
  surface: 'cover' | 'home' | 'study' | 'briefing'
}

export function SurfaceBackground({ surface }: Props) {
  const painting = useStore(s => s.currentPaintings[surface])
  const [settledUrl, setSettledUrl] = useState<string | null>(painting?.url ?? null)
  const [outgoingUrl, setOutgoingUrl] = useState<string | null>(null)
  const [incomingUrl, setIncomingUrl] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!painting) return
    if (painting.url === settledUrl || painting.url === incomingUrl) return
    // 换画重量语法：旧画坠出（500ms），新画延迟 240ms 落入过冲回稳（550ms），
    // 中点 CRT 颗粒闪烁；SWAP_TOTAL_MS 后落定。cleanup 清定时器，快速切页无残留。
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

  if (!painting || !settledUrl) return null
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
      <div className="absolute inset-0 painting-vignette" />
    </div>
  )
}
