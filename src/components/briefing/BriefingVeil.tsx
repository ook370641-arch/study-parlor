import { useEffect, useState } from 'react'
import { useStore } from '@/store'

export function BriefingVeil() {
  const arrivedAt = useStore((s) => s.briefingArrivedAt)
  const [flash, setFlash] = useState(false)

  useEffect(() => {
    if (!arrivedAt) return
    setFlash(true)
    const t = setTimeout(() => setFlash(false), 900)
    return () => clearTimeout(t)
  }, [arrivedAt])

  return (
    <div
      data-testid="briefing-veil"
      className="fixed inset-0 z-[1] pointer-events-none transition-opacity duration-500"
      style={{
        opacity: flash ? 0.82 : 1,
        background:
          'linear-gradient(180deg, rgba(12,8,6,0.30) 0%, rgba(12,8,6,0.62) 26%, rgba(12,8,6,0.86) 55%, rgba(12,8,6,0.94) 100%)',
      }}
      aria-hidden="true"
    />
  )
}
