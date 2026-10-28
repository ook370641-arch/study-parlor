import { useStore } from '@/store'
import { formatAttribution } from '@/lib/paintings'

/** 画作展板（简报 / 写作 / 笔记 / 书籍章节 / 文章阅读器共用）。
 *  统一受左下角「并置画框」开关（`paintingPlateEnabled`）控制。
 *  className 用于覆盖默认 21:9 宽幅与 620px 上限。 */
export function PaintingPlate({ className = '', caption = '今日展品' }: { className?: string; caption?: string }) {
  const enabled = useStore((s) => s.paintingPlateEnabled)
  const painting = useStore((s) => s.currentPaintings.briefing)
  if (!enabled || !painting) return null

  return (
    <figure data-testid="painting-plate" className={`relative mx-auto mb-8 w-full p-2.5 bg-[#1c130d] border border-parchment/15 shadow-[0_18px_50px_rgba(0,0,0,0.5)] ${className || 'max-w-[620px]'}`}>
      <div className="aspect-[21/9] w-full overflow-hidden">
        <img src={painting.url} alt={formatAttribution(painting)} className="w-full h-full object-cover"
          style={{ filter: 'brightness(1.1) saturate(1.06)', objectPosition: painting.focus ?? '50% 50%' }} />
      </div>
      <figcaption data-testid="painting-plate-caption" className="mt-1.5 flex justify-between text-[10px] italic tracking-wider text-parchment/50">
        <span>{formatAttribution(painting)}</span><span>{caption}</span>
      </figcaption>
    </figure>
  )
}
