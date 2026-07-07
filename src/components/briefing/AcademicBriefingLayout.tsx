import { useState } from 'react'
import type { BriefingResult } from '@/types'
import type { ParsedBriefing } from '@/lib/parse-briefing-markdown'
import { MarkdownRenderer } from '@/components/md/MarkdownRenderer'
import { SwapPaintingButton } from '@/components/SwapPaintingButton'

export function AcademicBriefingLayout({
  result,
  parsed,
  displayDate,
}: {
  result: BriefingResult
  parsed: ParsedBriefing
  displayDate: string
}) {
  const [expandedSources, setExpandedSources] = useState(false)

  return (
    <main
      data-testid="briefing-academic-layout"
      className="relative z-[5] flex-1 overflow-y-auto px-6 py-6 max-w-3xl mx-auto"
    >
      <div className="absolute top-4 left-4 z-10">
        <SwapPaintingButton
          surface="briefing"
          data-testid="briefing-swap-painting-button"
          className="text-parchment/70 hover:text-parchment"
        />
      </div>
      <article className="prose prose-invert max-w-none">
        <h1 className="text-[20px] font-bold font-serif text-parchment mb-2">{result.title}</h1>
        <p className="text-sm text-parchment/50 mb-6">{displayDate}</p>

        {parsed.sections.map((section, i) => (
          <section key={i} className="mb-8">
            <h2
              className="font-serif text-parchment/90 mb-3 border-b border-parchment/20 pb-2"
              style={{ fontSize: 'var(--briefing-heading-size)', fontWeight: 'var(--briefing-heading-weight)' }}
            >
              {section.title}
            </h2>
            <div
              data-testid="briefing-markdown-body"
              className="briefing-body-academic text-parchment/80 leading-[1.85]"
              style={{ fontSize: 'var(--briefing-body-size)', fontWeight: 'var(--briefing-body-weight)' }}
            >
              <MarkdownRenderer content={section.body} fileName="briefing.md" briefingStyle="academic" />
            </div>
          </section>
        ))}

        {parsed.sources.length > 0 && (
          <div className="mt-8 border-t border-parchment/20 pt-4">
            <button
              onClick={() => setExpandedSources((v) => !v)}
              className="text-sm text-parchment/60 hover:text-parchment/90 transition-colors"
            >
              {expandedSources ? '收起来源' : '展开来源'}
            </button>
            {expandedSources && (
              <div className="mt-4 space-y-4">
                {parsed.sources.map((group, i) => (
                  <div key={i}>
                    <h3 className="text-sm font-semibold text-parchment/70 mb-2">{group.title}</h3>
                    <ul className="text-sm text-parchment/50 space-y-1">
                      {group.items.map((item, j) => (
                        <li key={j}>{item}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </article>
    </main>
  )
}
