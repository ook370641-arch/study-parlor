import { useEffect } from 'react'
import Markdown from 'react-markdown'
import { useStore } from '@/store'
import type { SearchSource } from '@shared/index'

const PANEL_WIDTH = 380

function SourceTag({ index }: { index: number }) {
  return (
    <a
      href={`#external-source-${index}`}
      className="text-ember text-[10px] ml-0.5 hover:underline"
      onClick={(e) => {
        e.preventDefault()
        const el = document.getElementById(`external-source-${index}`)
        el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      }}
    >
      [{index}]
    </a>
  )
}

function SourceList({ sources }: { sources: SearchSource[] }) {
  return (
    <div className="border-t border-parchment/10 pt-3 mt-4">
      <h4 className="text-ember text-[11px] font-semibold uppercase tracking-wider mb-2">来源</h4>
      <ul className="space-y-2">
        {sources.map((source, i) => {
          const num = i + 1
          return (
            <li
              key={num}
              id={`external-source-${num}`}
              data-testid={`external-summary-source-${num}`}
              className="text-[11px]"
            >
              <span className="text-ember font-semibold min-w-[1.25rem] inline-block">[{num}]</span>
              <a
                href={source.url}
                target="_blank"
                rel="noreferrer"
                className="text-ember hover:underline break-all"
                title={source.snippet}
              >
                {source.title || source.url}
              </a>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function SummaryContent({ summary, sources }: { summary: string; sources: SearchSource[] }) {
  // Convert plain [n] citations into markdown anchor links so they become clickable.
  const processed = summary.replace(/\[(\d+)\]/g, '[$1](#external-source-$1)')

  return (
    <>
      <Markdown
        components={{
          a: ({ href, children }) => {
            const match = href?.match(/^#external-source-(\d+)$/)
            if (match) {
              return <SourceTag index={Number(match[1])} />
            }
            return (
              <a href={href} target="_blank" rel="noreferrer" className="text-ember hover:underline">
                {children}
              </a>
            )
          },
          h1: ({ children }) => <h4 className="text-ember text-[11px] font-semibold uppercase tracking-wider mt-4 mb-2 first:mt-0">{children}</h4>,
          h2: ({ children }) => <h4 className="text-ember text-[11px] font-semibold uppercase tracking-wider mt-4 mb-2 first:mt-0">{children}</h4>,
          h3: ({ children }) => <h4 className="text-ember text-[11px] font-semibold uppercase tracking-wider mt-4 mb-2 first:mt-0">{children}</h4>,
          p: ({ children }) => <p className="mb-2 text-parchment/80 leading-relaxed">{children}</p>,
        }}
      >
        {processed}
      </Markdown>
      {sources.length > 0 && <SourceList sources={sources} />}
    </>
  )
}

export function ExternalSummaryPanel() {
  const isOpen = useStore(s => s.isExternalSummaryOpen)
  const materials = useStore(s => s.externalMaterials)
  const closeExternalSummary = useStore(s => s.closeExternalSummary)

  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeExternalSummary()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen, closeExternalSummary])

  if (!isOpen) return null

  const hasSummary = !!materials?.summary
  const sources = materials?.sources ?? []

  return (
    <>
      {/* Transparent click-capture layer between panel and chat */}
      <div
        data-testid="external-summary-backdrop"
        className="fixed inset-0 z-[14]"
        style={{ right: `${PANEL_WIDTH}px` }}
        onClick={closeExternalSummary}
        aria-hidden="true"
      />
      <div
        data-testid="external-summary-panel"
        className="fixed right-0 top-0 bottom-0 z-[15] flex flex-col bg-[rgba(22,17,14,0.98)] border-l border-parchment/15 shadow-[-10px_0_40px_rgba(0,0,0,0.5)]"
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
            <SummaryContent summary={materials.summary!} sources={sources} />
          )}
        </div>
      </div>
    </>
  )
}
