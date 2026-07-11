import { useState } from 'react'
import type { BriefingResult } from '@/types'
import type { ParsedBriefing } from '@/lib/parse-briefing-markdown'
import { MarkdownRenderer } from '@/components/md/MarkdownRenderer'
import type { TermDef } from '@/components/md/rehypeTermHighlight'
import { BriefingSourceItem } from './BriefingSourceItem'

export function AcademicBriefingLayout({
  result,
  parsed,
  displayDate,
  terms,
}: {
  result: BriefingResult
  parsed: ParsedBriefing
  displayDate: string
  terms?: TermDef[]
}) {
  const [expandedSources, setExpandedSources] = useState(false)

  return (
    <main
      data-testid="briefing-academic-layout"
      className="relative z-[5] flex-1 overflow-y-auto"
    >
      <article className="relative z-10 prose prose-invert max-w-3xl mx-auto px-6 py-6">
        <h1 className="text-[24px] font-bold font-serif text-[#f5e6cc] mb-2">{result.title}</h1>
        <p className="text-sm text-[#e8d5b7]/60 mb-6">{displayDate}</p>

        {parsed.sections.map((section, i) => (
          <section key={i} className="mb-8">
            <h2
              className="font-serif text-[#f5e6cc] mb-3 border-b border-[#e8d5b7]/20 pb-2"
              style={{ fontSize: 'var(--briefing-heading-size)', fontWeight: 'var(--briefing-heading-weight)' }}
            >
              {section.title}
            </h2>
            <div
              data-testid="briefing-markdown-body"
              className="briefing-body-academic text-[#f5e6cc]/90 leading-[1.85]"
              style={{ fontSize: 'var(--briefing-body-size)', fontWeight: 'var(--briefing-body-weight)' }}
            >
              <MarkdownRenderer content={section.body} fileName="briefing.md" briefingStyle="academic" terms={terms} />
            </div>
          </section>
        ))}

        {parsed.sources.length > 0 && (
          <div className="mt-8 border-t border-[#e8d5b7]/20 pt-4">
            <button
              onClick={() => setExpandedSources((v) => !v)}
              className="text-sm text-[#e8d5b7]/70 hover:text-[#f5e6cc] transition-colors"
            >
              {expandedSources ? '收起来源' : '展开来源'}
            </button>
            {expandedSources && (
              <div className="mt-4 space-y-4">
                {parsed.sources.map((group, i) => (
                  <div key={i}>
                    <h3 className="text-sm font-semibold text-[#e8d5b7]/80 mb-2">{group.title}</h3>
                    <ul className="text-sm text-ember space-y-1">
                      {group.items.map((item, j) => (
                        <li key={j}>
                          <BriefingSourceItem item={item} theme="academic" />
                        </li>
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
