import { useEffect, useRef, useCallback } from 'react'
import dragDemoImg from '@/assets/group-guide-drag-demo.png'
import strategyDemoImg from '@/assets/group-guide-strategy-demo.png'

interface GuidePopoverProps {
  open: boolean
  anchorRef: React.RefObject<HTMLElement | null>
  onClose: () => void
}

const GUIDE_ITEMS = [
  {
    text: '分组用来管理主题，例如「工作」「数学」等分组各自包含相关主题',
  },
  {
    text: '新创建的主题学习默认保存到「默认」分组中',
  },
  {
    text: '每个分组可包含多个主题，点击 + 号可新建分组',
  },
  {
    text: '左侧新主题推荐会根据你的分组智能推荐，点击策略标签（v1/v2/v3）可切换推荐模式',
    extra: (
      <div className="mt-2">
        <img
          src={strategyDemoImg}
          alt="推荐策略切换示意图"
          className="w-full rounded-md opacity-80"
          draggable={false}
        />
      </div>
    ),
  },
  {
    text: '长按主题卡片并拖动，可将其移入其他分组',
    extra: (
      <div className="mt-2">
        <p className="text-[11px] text-parchment/40 mb-1">拖拽到目标分组附近即可</p>
        <img
          src={dragDemoImg}
          alt="拖拽分组示意图"
          className="w-full rounded-md opacity-80"
          draggable={false}
        />
      </div>
    ),
  },
]

export function GuidePopover({ open, anchorRef, onClose }: GuidePopoverProps) {
  const panelRef = useRef<HTMLDivElement>(null)

  const updatePosition = useCallback(() => {
    const panel = panelRef.current
    const anchor = anchorRef.current
    if (!panel || !anchor) return

    const rect = anchor.getBoundingClientRect()
    const panelWidth = 320
    const margin = 8

    let left = rect.left + rect.width / 2 - panelWidth / 2
    let top = rect.bottom + margin

    // Keep within viewport
    if (left < margin) left = margin
    if (left + panelWidth > window.innerWidth - margin) {
      left = window.innerWidth - panelWidth - margin
    }

    panel.style.left = `${left}px`
    panel.style.top = `${top}px`
  }, [anchorRef])

  useEffect(() => {
    if (!open) return

    updatePosition()

    const handleResize = () => {
      // Close on resize to avoid drift
      onClose()
    }
    window.addEventListener('resize', handleResize)

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node
      if (
        panelRef.current &&
        !panelRef.current.contains(target) &&
        anchorRef.current &&
        !anchorRef.current.contains(target)
      ) {
        onClose()
      }
    }
    // Use capture phase to catch clicks before they bubble
    document.addEventListener('mousedown', handleClickOutside, true)

    return () => {
      window.removeEventListener('resize', handleResize)
      window.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('mousedown', handleClickOutside, true)
    }
  }, [open, onClose, updatePosition, anchorRef])

  if (!open) return null

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-label="分组使用指南"
      className="fixed z-50 w-[320px] bg-[#1e1612] border border-parchment/20 rounded-xl shadow-xl p-4"
      style={{ left: 0, top: 0 }}
    >
      <div className="text-sm font-semibold text-parchment mb-3">
        分组使用指南
      </div>
      <div className="flex flex-col gap-3">
        {GUIDE_ITEMS.map((item, i) => (
          <div key={i} className="flex gap-2.5 items-start">
            <span className="shrink-0 w-5 h-5 rounded-full bg-ember/20 text-ember text-[11px] flex items-center justify-center font-semibold mt-0.5">
              {i + 1}
            </span>
            <div>
              <p className="text-[13px] leading-relaxed text-parchment/80">
                {item.text}
              </p>
              {item.extra}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
