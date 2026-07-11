import { useState } from 'react'
import type { BriefingResult } from '@/types'
import type { ParsedBriefing } from '@/lib/parse-briefing-markdown'
import { MarkdownRenderer } from '@/components/md/MarkdownRenderer'
import type { TermDef } from '@/components/md/rehypeTermHighlight'
import { BriefingSourceItem } from './BriefingSourceItem'

export function NewspaperBriefingLayout({
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
      data-testid="briefing-newspaper-layout"
      className="relative z-[5] flex-1 overflow-y-auto bg-white"
    >
      <article className="w-[90%] max-w-[1250px] min-w-[520px] mx-auto px-4 py-6">
        <header className="border-b-2 border-[#1a1a1a] pb-4 mb-6 text-center">
          <h1 className="text-[28px] font-extrabold font-serif text-[#1a1a1a] mb-1">{result.title}</h1>
          <div className="flex items-center justify-center gap-3 text-xs text-[#555] uppercase tracking-widest">
            <span>夜航简报</span>
            <span>|</span>
            <span>{displayDate}</span>
          </div>
        </header>

        {parsed.sections.map((section, i) => (
          <section key={i} className="mb-8">
            <h2
              className="text-[#1a1a1a] mb-3 uppercase tracking-wider border-b border-[#1a1a1a]/10 pb-2"
              style={{ fontSize: 'var(--briefing-heading-size)', fontWeight: 'var(--briefing-heading-weight)' }}
            >
              {section.title}
            </h2>
            <div
              data-testid="briefing-markdown-body"
              className="briefing-body-newspaper text-[#1a1a1a] leading-[1.85] columns-1 lg:columns-2 gap-8"
              style={{ fontSize: 'var(--briefing-body-size)', fontWeight: 'var(--briefing-body-weight)' }}
            >
              <MarkdownRenderer content={section.body} fileName="briefing.md" briefingStyle="newspaper" terms={terms} />
            </div>
            {i < parsed.sections.length - 1 && (
              <div className="text-center text-[#1a1a1a]/30 text-sm my-6">* * *</div>
            )}
          </section>
        ))}

        {parsed.sources.length > 0 && (
          <div className="mt-8 border-t border-[#1a1a1a]/20 pt-4">
            <button
              onClick={() => setExpandedSources((v) => !v)}
              className="text-sm text-[#555] hover:text-[#1a1a1a] transition-colors"
              data-testid="briefing-source-expand-toggle"
            >
              {expandedSources ? '收起来源' : '展开来源'}
            </button>
            {expandedSources && (
              <div className="mt-4 flex flex-wrap gap-2">
                {parsed.sources.map((group, i) =>
                  group.items.map((item, j) => (
                    <BriefingSourceItem key={`${i}-${j}`} item={item} theme="newspaper" variant="pill" />
                  ))
                )}
              </div>
            )}
          </div>
        )}
      </article>
    </main>
  )
}
