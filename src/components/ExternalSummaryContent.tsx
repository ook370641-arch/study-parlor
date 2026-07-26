import type { Components } from 'react-markdown'
import { MarkdownContent } from './md/MarkdownContent'
import type { SearchSource } from '@shared/index'

function SourceTag({ index, isAcademic }: { index: number; isAcademic: boolean }) {
  return (
    <a
      href={`#external-source-${index}`}
      className={`text-[0.75em] ml-0.5 hover:underline ${isAcademic ? 'text-ember' : 'text-[#1a1a1a]'}`}
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

function SourceList({ sources, isAcademic }: { sources: SearchSource[]; isAcademic: boolean }) {
  return (
    <div className={`border-t pt-3 mt-4 ${isAcademic ? 'border-parchment/10' : 'border-[#1a1a1a]/10'}`}>
      <h4 className={`text-[0.85em] font-semibold uppercase tracking-wider mb-2 ${isAcademic ? 'text-ember' : 'text-[#1a1a1a]'}`}>来源</h4>
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
              <span className={`font-semibold min-w-[1.25rem] inline-block ${isAcademic ? 'text-ember' : 'text-[#1a1a1a]'}`}>[{num}]</span>
              <a
                href={source.url}
                target="_blank"
                rel="noreferrer"
                className={`hover:underline break-all ${isAcademic ? 'text-ember' : 'text-[#1a1a1a]'}`}
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
  theme?: string
}

export function ExternalSummaryContent({ summary, sources, theme }: SummaryContentProps) {
  const isAcademic = theme !== 'newspaper'

  const summaryComponents: Components = {
    h1: ({ children }) => (
      <h1 className={`text-[1.35em] font-bold font-serif mb-3 mt-4 first:mt-0 border-b pb-2 ${isAcademic ? 'text-parchment border-parchment/10' : 'text-[#1a1a1a] border-[#1a1a1a]/10'}`}>
        {children}
      </h1>
    ),
    h2: ({ children }) => (
      <h2 className={`text-[1.2em] font-semibold mt-5 mb-2 font-serif ${isAcademic ? 'text-ember' : 'text-[#1a1a1a]'}`}>
        {children}
      </h2>
    ),
    h3: ({ children }) => (
      <h3 className={`text-[1.1em] font-medium mt-4 mb-1.5 font-serif ${isAcademic ? 'text-ember/90' : 'text-[#1a1a1a]/90'}`}>
        {children}
      </h3>
    ),
    h4: ({ children }) => (
      <h4 className={`text-[1.05em] font-medium mt-3 mb-1 font-serif ${isAcademic ? 'text-ember/80' : 'text-[#1a1a1a]/80'}`}>
        {children}
      </h4>
    ),
    p: ({ children }) => (
      <p className={`mb-2.5 leading-relaxed ${isAcademic ? 'text-parchment/80' : 'text-[#1a1a1a]'}`}>
        {children}
      </p>
    ),
    ul: ({ children }) => (
      <ul className={`list-disc pl-5 mb-3 space-y-1 ${isAcademic ? 'text-parchment/80' : 'text-[#1a1a1a]'}`}>
        {children}
      </ul>
    ),
    ol: ({ children }) => (
      <ol className={`list-decimal pl-5 mb-3 space-y-1 ${isAcademic ? 'text-parchment/80' : 'text-[#1a1a1a]'}`}>
        {children}
      </ol>
    ),
    li: ({ children }) => (
      <li className="leading-relaxed">{children}</li>
    ),
    blockquote: ({ children }) => (
      <blockquote className={`border-l-2 pl-3 py-1 my-2 italic rounded-r ${isAcademic ? 'border-ember/50 text-parchment/60 bg-parchment/[0.03]' : 'border-[#1a1a1a]/25 text-[#777] bg-[#1a1a1a]/[0.02]'}`}>
        {children}
      </blockquote>
    ),
    strong: ({ children }) => (
      <strong className={`font-semibold ${isAcademic ? 'text-parchment' : 'text-[#1a1a1a]'}`}>{children}</strong>
    ),
    em: ({ children }) => (
      <em className={`italic ${isAcademic ? 'text-parchment/70' : 'text-[#555]'}`}>{children}</em>
    ),
    hr: () => <hr className={`my-4 ${isAcademic ? 'border-parchment/15' : 'border-[#1a1a1a]/15'}`} />,
    a: ({ href, children }) => {
      const match = href?.match(/^#external-source-(\d+)$/)
      if (match) {
        return <SourceTag index={Number(match[1])} isAcademic={isAcademic} />
      }
      return (
        <a href={href} target="_blank" rel="noreferrer" className={`hover:underline ${isAcademic ? 'text-ember' : 'text-[#1a1a1a]'}`}>
          {children}
        </a>
      )
    },
    code: ({ children, className }) => {
      const isInline = !className
      if (isInline) {
        return (
          <code className={`px-1 py-0.5 rounded text-[0.9em] font-mono ${isAcademic ? 'bg-parchment/10 text-ember' : 'bg-[#1a1a1a]/5 text-[#1a1a1a]'}`}>
            {children}
          </code>
        )
      }
      return (
        <pre className={`border p-3 rounded my-3 overflow-auto ${isAcademic ? 'bg-black/30 border-parchment/10' : 'bg-[#1a1a1a]/5 border-[#1a1a1a]/10'}`}>
          <code className={`${className} text-[0.9em] font-mono leading-relaxed`}>{children}</code>
        </pre>
      )
    },
    table: ({ children }) => (
      <table className="w-full border-collapse my-3 text-[0.95em]">{children}</table>
    ),
    thead: ({ children }) => (
      <thead className={isAcademic ? 'bg-ember/10' : 'bg-[#1a1a1a]/5'}>{children}</thead>
    ),
    th: ({ children }) => (
      <th className={`text-left p-2 text-[0.85em] uppercase tracking-wider border-b ${isAcademic ? 'text-ember border-ember/30' : 'text-[#1a1a1a] border-[#1a1a1a]/15'}`}>
        {children}
      </th>
    ),
    td: ({ children }) => (
      <td className={`p-2 border-b ${isAcademic ? 'border-parchment/10 text-parchment/80' : 'border-[#1a1a1a]/10 text-[#1a1a1a]'}`}>{children}</td>
    ),
  }

  const sourceCount = sources.length
  const processed = summary.replace(/\[(\d+)\]/g, (match, numStr) => {
    const num = Number(numStr)
    if (num < 1 || num > sourceCount) return match
    return `[${num}](#external-source-${num})`
  })

  return (
    <>
      <MarkdownContent components={summaryComponents}>{processed}</MarkdownContent>
      {sources.length > 0 && <SourceList sources={sources} isAcademic={isAcademic} />}
    </>
  )
}
