import Markdown from 'react-markdown'
import type { SearchSource } from '@shared/index'

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

interface SummaryContentProps {
  summary: string
  sources: SearchSource[]
}

export function ExternalSummaryContent({ summary, sources }: SummaryContentProps) {
  const sourceCount = sources.length
  const processed = summary.replace(/\[(\d+)\]/g, (match, numStr) => {
    const num = Number(numStr)
    if (num < 1 || num > sourceCount) return match
    return `[${num}](#external-source-${num})`
  })

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
