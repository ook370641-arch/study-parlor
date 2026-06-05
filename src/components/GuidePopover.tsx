import { useEffect, useRef, useCallback } from 'react'

interface GuidePopoverProps {
  open: boolean
  anchorRef: React.RefObject<HTMLElement | null>
  onClose: () => void
}

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
    document.addEventListener('keydown', handleKeyDown)

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
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('mousedown', handleClickOutside, true)
    }
  }, [open, onClose, updatePosition, anchorRef])

  if (!open) return null

  const items = [
    {
      text: '新创建的默认保存到「默认」分组中',
    },
    {
      text: '新建分组可包含多个主题，左侧推荐会根据你的分组智能推荐学习主题',
    },
    {
      text: '长按主题卡片并拖动，可将其移入其他分组',
      extra: (
        <div className="mt-2">
          <p className="text-[11px] text-parchment/40 mb-1">拖拽到目标分组附近即可</p>
          <img
            src="./src/assets/group-guide-drag-demo.png"
            alt="拖拽分组示意图"
            className="w-full rounded-md opacity-80"
            draggable={false}
          />
        </div>
      ),
    },
  ]

  return (
    <div
      ref={panelRef}
      className="fixed z-50 w-[320px] bg-[#1e1612] border border-parchment/20 rounded-xl shadow-xl p-4"
      style={{ left: 0, top: 0 }}
    >
      <div className="text-sm font-semibold text-parchment mb-3">
        分组使用指南
      </div>
      <div className="flex flex-col gap-3">
        {items.map((item, i) => (
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
