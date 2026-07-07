import type { Components } from 'react-markdown'
import { MarkdownContent } from './md/MarkdownContent'
import type { SearchSource } from '@shared/index'

function SourceTag({ index }: { index: number }) {
  return (
    <a
      href={`#external-source-${index}`}
      className="text-ember text-[0.75em] ml-0.5 hover:underline"
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
      <h4 className="text-ember text-[0.85em] font-semibold uppercase tracking-wider mb-2">来源</h4>
      <ul className="space-y-2">
        {sources.map((source, i) => {
          const num = i + 1
          return (
            <li
              key={num}
              id={`external-source-${num}`}
              data-testid={`external-summary-source-${num}`}
              className="text-[0.85em]"
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

const summaryComponents: Components = {
  h1: ({ children }) => (
    <h1 className="text-parchment text-[1.35em] font-bold font-serif mb-3 mt-4 first:mt-0 border-b border-parchment/10 pb-2">
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 className="text-ember text-[1.2em] font-semibold mt-5 mb-2 font-serif">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="text-ember/90 text-[1.1em] font-medium mt-4 mb-1.5 font-serif">
      {children}
    </h3>
  ),
  h4: ({ children }) => (
    <h4 className="text-ember/80 text-[1.05em] font-medium mt-3 mb-1 font-serif">
      {children}
    </h4>
  ),
  p: ({ children }) => (
    <p className="mb-2.5 text-parchment/80 leading-relaxed">
      {children}
    </p>
  ),
  ul: ({ children }) => (
    <ul className="list-disc pl-5 mb-3 space-y-1 text-parchment/80">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="list-decimal pl-5 mb-3 space-y-1 text-parchment/80">
      {children}
    </ol>
  ),
  li: ({ children }) => (
    <li className="leading-relaxed">{children}</li>
  ),
  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-ember/50 pl-3 py-1 my-2 italic text-parchment/60 bg-parchment/[0.03] rounded-r">
      {children}
    </blockquote>
  ),
  strong: ({ children }) => (
    <strong className="text-parchment font-semibold">{children}</strong>
  ),
  em: ({ children }) => (
    <em className="italic text-parchment/70">{children}</em>
  ),
  hr: () => <hr className="my-4 border-parchment/15" />,
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
  code: ({ children, className }) => {
    const isInline = !className
    if (isInline) {
      return (
        <code className="bg-parchment/10 text-ember px-1 py-0.5 rounded text-[0.9em] font-mono">
          {children}
        </code>
      )
    }
    return (
      <pre className="bg-black/30 border border-parchment/10 p-3 rounded my-3 overflow-auto">
        <code className={`${className} text-[0.9em] font-mono leading-relaxed`}>{children}</code>
      </pre>
    )
  },
  table: ({ children }) => (
    <table className="w-full border-collapse my-3 text-[0.95em]">{children}</table>
  ),
  thead: ({ children }) => (
    <thead className="bg-ember/10">{children}</thead>
  ),
  th: ({ children }) => (
    <th className="text-left p-2 text-ember text-[0.85em] uppercase tracking-wider border-b border-ember/30">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="p-2 border-b border-parchment/10 text-parchment/80">{children}</td>
  ),
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
      <MarkdownContent components={summaryComponents}>{processed}</MarkdownContent>
      {sources.length > 0 && <SourceList sources={sources} />}
    </>
  )
}
