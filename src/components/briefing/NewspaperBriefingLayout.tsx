import { useState } from 'react'
import type { BriefingResult } from '@/types'
import type { ParsedBriefing } from '@/lib/parse-briefing-markdown'
import { MarkdownRenderer } from '@/components/md/MarkdownRenderer'

export function NewspaperBriefingLayout({
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
      data-testid="briefing-newspaper-layout"
      className="relative z-[5] flex-1 overflow-y-auto px-6 py-6 max-w-3xl mx-auto bg-white"
    >
      <article className="max-w-none">
        <div className="border-b-2 border-[#1a1a1a] pb-4 mb-6">
          <h1 className="text-[24px] font-extrabold font-serif text-[#1a1a1a] mb-1">{result.title}</h1>
          <p className="text-sm text-[#555] uppercase tracking-wider">{displayDate}</p>
        </div>

        {parsed.sections.map((section, i) => (
          <section key={i} className="mb-8">
            <h2
              className="text-[#1a1a1a] mb-3 uppercase tracking-wide"
              style={{ fontSize: 'var(--briefing-heading-size)', fontWeight: 'var(--briefing-heading-weight)' }}
            >
              {section.title}
            </h2>
            <div
              data-testid="briefing-markdown-body"
              className="briefing-body-newspaper text-[#1a1a1a] leading-[1.85] columns-1"
              style={{ fontSize: 'var(--briefing-body-size)', fontWeight: 'var(--briefing-body-weight)' }}
            >
              <MarkdownRenderer content={section.body} fileName="briefing.md" briefingStyle="newspaper" />
            </div>
          </section>
        ))}

        {parsed.sources.length > 0 && (
          <div className="mt-8 border-t border-[#1a1a1a]/20 pt-4">
            <button
              onClick={() => setExpandedSources((v) => !v)}
              className="text-sm text-[#555] hover:text-[#1a1a1a] transition-colors"
            >
              {expandedSources ? '收起来源' : '展开来源'}
            </button>
            {expandedSources && (
              <div className="mt-4 space-y-4">
                {parsed.sources.map((group, i) => (
                  <div key={i}>
                    <h3 className="text-sm font-semibold text-[#555] mb-2">{group.title}</h3>
                    <ul className="text-sm text-[#777] space-y-1">
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
