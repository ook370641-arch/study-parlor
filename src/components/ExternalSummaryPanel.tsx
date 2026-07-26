import { useEffect, useRef, useState } from 'react'
import { useStore } from '@/store'
import { ExternalSummaryContent } from './ExternalSummaryContent'
import { SUMMARY_BASE_STYLES } from '@/lib/external-summary-font-size'
import { normalizeSummaryFontSize } from '@/lib/external-summary-font-size'

const PANEL_WIDTH = 760
const SLIDE_DURATION_MS = 300

export function ExternalSummaryPanel() {
  const theme = useStore((s) => s.briefingTheme)
  const isAcademic = theme !== 'newspaper'
  const isOpen = useStore(s => s.isExternalSummaryOpen)
  const materials = useStore(s => s.externalMaterials)
  const closeExternalSummary = useStore(s => s.closeExternalSummary)
  const fontSize = useStore(s => s.externalSummaryFontSize)
  const increaseFontSize = useStore(s => s.increaseExternalSummaryFontSize)
  const decreaseFontSize = useStore(s => s.decreaseExternalSummaryFontSize)
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
  const baseStyle = SUMMARY_BASE_STYLES[normalizeSummaryFontSize(fontSize)]

  return (
    <div
      ref={panelRef}
      data-testid="external-summary-panel"
      role="dialog"
      aria-modal="true"
      aria-label="外部资料摘要"
      className={`fixed right-0 top-16 bottom-0 z-[15] flex flex-col transition-transform duration-300 ease-out ${
        isOpen ? 'translate-x-0' : 'translate-x-full'
      } ${isAcademic ? 'bg-[rgba(22,17,14,0.98)] border-l border-parchment/15 shadow-[-10px_0_40px_rgba(0,0,0,0.5)]' : 'bg-white border-l border-[#1a1a1a]/10 shadow-[-10px_0_40px_rgba(0,0,0,0.08)]'}`}
      style={{ width: `${PANEL_WIDTH}px` }}
    >
      <div className={`h-12 border-b px-4 flex items-center justify-between shrink-0 ${isAcademic ? 'border-parchment/10' : 'border-[#1a1a1a]/10'}`}>
        <div className={`flex items-center gap-2 text-sm font-sans ${isAcademic ? 'text-parchment' : 'text-[#1a1a1a]'}`}>
          <span>🌐</span>
          <span>外部资料摘要</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={decreaseFontSize}
            className={`w-7 h-7 flex items-center justify-center rounded transition-colors ${isAcademic ? 'text-parchment/60 hover:text-parchment hover:bg-parchment/10' : 'text-[#555] hover:text-[#1a1a1a] hover:bg-[#1a1a1a]/5'}`}
            aria-label="缩小摘要字号"
            title="缩小字号"
          >
            -
          </button>
          <button
            onClick={increaseFontSize}
            className={`w-7 h-7 flex items-center justify-center rounded transition-colors ${isAcademic ? 'text-parchment/60 hover:text-parchment hover:bg-parchment/10' : 'text-[#555] hover:text-[#1a1a1a] hover:bg-[#1a1a1a]/5'}`}
            aria-label="放大摘要字号"
            title="放大字号"
          >
            +
          </button>
          <button
            data-testid="external-summary-close"
            onClick={closeExternalSummary}
            className={`text-sm px-1 ml-1 ${isAcademic ? 'text-parchment/50 hover:text-parchment' : 'text-[#777] hover:text-[#1a1a1a]'}`}
            aria-label="关闭摘要面板"
          >
            ✕
          </button>
        </div>
      </div>

      <div
        className={`flex-1 overflow-y-auto px-4 py-4 leading-[1.75] font-serif ${isAcademic ? 'text-parchment/80' : 'text-[#1a1a1a]'}`}
        style={{ fontSize: baseStyle.size }}
      >
        {!hasSummary ? (
          <div className={`italic ${isAcademic ? 'text-parchment/50' : 'text-[#777]'}`}>暂无摘要</div>
        ) : (
          <ExternalSummaryContent summary={materials.summary!} sources={sources} theme={theme} />
        )}
      </div>
    </div>
  )
}
