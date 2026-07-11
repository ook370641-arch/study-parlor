import { useEffect, useState } from 'react'
import { useStore } from '@/store'

interface Props {
  surface: 'cover' | 'home' | 'study' | 'briefing'
}

export function SurfaceBackground({ surface }: Props) {
  const painting = useStore(s => s.currentPaintings[surface])
  const [currentUrl, setCurrentUrl] = useState<string | null>(painting?.url ?? null)
  const [prevUrl, setPrevUrl] = useState<string | null>(null)
  // Fade in only on an actual painting change (swap). On first mount the
  // painting is shown immediately so navigating into a surface doesn't flash
  // the brown base for the 600ms fade-in.
  const [animate, setAnimate] = useState(false)

  useEffect(() => {
    if (!painting) return
    if (painting.url === currentUrl) return
    setPrevUrl(currentUrl)
    setCurrentUrl(painting.url)
    setAnimate(true)
    const t = setTimeout(() => setPrevUrl(null), 700)
    return () => clearTimeout(t)
  }, [painting?.url])

  if (!painting || !currentUrl) return null

  return (
    <div data-testid="surface-background" className="fixed inset-0 z-0 pointer-events-none">
      {prevUrl && (
        <img
          src={prevUrl}
          alt=""
          className="absolute inset-0 w-full h-full object-cover painting-fade-out"
        />
      )}
      <img
        key={currentUrl}
        src={currentUrl}
        alt=""
        className={`absolute inset-0 w-full h-full object-cover ${animate ? 'painting-fade-in' : ''}`}
      />
      <div className="absolute inset-0 painting-vignette" />
    </div>
  )
}
