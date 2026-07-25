import { useEffect, useRef, useState } from 'react'
import { useStore } from '@/store'
import { formatAttribution } from '@/lib/paintings'

interface Props {
  surface: 'cover' | 'home' | 'study' | 'briefing'
  className?: string
}

// 美术馆展签：平时不在场，观者走近（hover 换画按钮所在 group）才显现；
// 换画后浮现一次（1.8s）作为「已挂上」的确认，然后隐退。替换原 title tooltip。
export function PaintingLabel({ surface, className = '' }: Props) {
  const painting = useStore(s => s.currentPaintings[surface])
  const [flash, setFlash] = useState(false)
  const prevUrl = useRef(painting?.url)

  useEffect(() => {
    if (!painting?.url || painting.url === prevUrl.current) return
    prevUrl.current = painting.url
    setFlash(true)
    const t = setTimeout(() => setFlash(false), 1800)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [painting?.url])

  if (!painting) return null

  return (
    <span
      data-testid="painting-label"
      data-flash={flash ? '' : undefined}
      className={`italic tracking-widest text-[11px] transition-all duration-300 ${
        flash ? 'opacity-70 translate-y-0' : 'opacity-0 translate-y-[2px]'
      } group-hover:opacity-70 group-hover:translate-y-0 ${className}`}
    >
      {formatAttribution(painting)}
    </span>
  )
}
