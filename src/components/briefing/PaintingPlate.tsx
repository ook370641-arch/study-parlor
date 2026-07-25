import { useStore } from '@/store'
import { formatAttribution } from '@/lib/paintings'

export function PaintingPlate() {
  const enabled = useStore((s) => s.paintingPlateEnabled)
  const painting = useStore((s) => s.currentPaintings.briefing)
  if (!enabled || !painting) return null

  return (
    <figure data-testid="painting-plate" className="mx-auto mb-8 w-full max-w-[620px] p-2.5 bg-[#1c130d] border border-parchment/15">
      <div className="aspect-[21/9] w-full overflow-hidden">
        <img src={painting.url} alt={formatAttribution(painting)} className="w-full h-full object-cover"
          style={{ filter: 'brightness(1.1) saturate(1.06)' }} />
      </div>
      <figcaption data-testid="painting-plate-caption" className="mt-1.5 flex justify-between text-[10px] italic tracking-wider text-parchment/50">
        <span>{formatAttribution(painting)}</span><span>今日展品</span>
      </figcaption>
    </figure>
  )
}
