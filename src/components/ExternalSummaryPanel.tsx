import { useEffect, useRef, useState } from 'react'
import { useStore } from '@/store'
import { ExternalSummaryContent } from './ExternalSummaryContent'

const PANEL_WIDTH = 380
const SLIDE_DURATION_MS = 300

export function ExternalSummaryPanel() {
  const isOpen = useStore(s => s.isExternalSummaryOpen)
  const materials = useStore(s => s.externalMaterials)
  const closeExternalSummary = useStore(s => s.closeExternalSummary)
  const panelRef = useRef<HTMLDivElement>(null)
  const [rendered, setRendered] = useState(isOpen)

  // Keep the panel mounted briefly after closing so the exit slide animation can play.
  useEffect(() => {
    if (isOpen) {
      setRendered(true)
      return
    }
    if (!rendered) return
    const timer = setTimeout(() => setRendered(false), SLIDE_DURATION_MS)
    return () => clearTimeout(timer)
  }, [isOpen, rendered])

  // Close the panel when clicking outside of it, without blocking interactions
  // with the rest of the Study page.
  useEffect(() => {
    if (!isOpen) return
    const onPointerDown = (e: PointerEvent) => {
      if (!panelRef.current) return
      if (!panelRef.current.contains(e.target as Node)) {
        closeExternalSummary()
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [isOpen, closeExternalSummary])

  if (!rendered) return null

  const hasSummary = !!materials?.summary
  const sources = materials?.sources ?? []

  return (
    <div
      ref={panelRef}
      data-testid="external-summary-panel"
      role="dialog"
      aria-modal="true"
      aria-label="外部资料摘要"
      className={`fixed right-0 top-16 bottom-0 z-[15] flex flex-col bg-[rgba(22,17,14,0.98)] border-l border-parchment/15 shadow-[-10px_0_40px_rgba(0,0,0,0.5)] transition-transform duration-300 ease-out ${
        isOpen ? 'translate-x-0' : 'translate-x-full'
      }`}
      style={{ width: `${PANEL_WIDTH}px` }}
    >
      <div className="h-12 border-b border-parchment/10 px-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2 text-sm text-parchment font-sans">
          <span>🌐</span>
          <span>外部资料摘要</span>
        </div>
        <button
          data-testid="external-summary-close"
          onClick={closeExternalSummary}
          className="text-parchment/50 hover:text-parchment text-sm px-1"
          aria-label="关闭摘要面板"
        >
          ✕
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 text-[13px] leading-[1.75] text-parchment/80 font-serif">
        {!hasSummary ? (
          <div className="text-parchment/50 italic">暂无摘要</div>
        ) : (
          <ExternalSummaryContent summary={materials.summary!} sources={sources} />
        )}
      </div>
    </div>
  )
}
