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
      <div className="w-[90%] max-w-[1250px] min-w-[520px] mx-auto px-4 py-6">
        <header className="text-center mb-8">
          <h1 className="text-[24px] font-bold font-serif text-[#f5e6cc] mb-2">{result.title}</h1>
          <p className="text-sm text-[#e8d5b7]/60">{displayDate}</p>
        </header>

        <div className="space-y-6">
          {parsed.sections.map((section, i) => {
            const rotation = i % 2 === 0 ? '-rotate-[0.3deg]' : 'rotate-[0.3deg]'
            return (
              <section
                key={i}
                className={`p-5 rounded-sm border border-[#e8d5b7]/20 bg-[#e8d5b7] text-[#2a1f1a] shadow-sm ${rotation}`}
              >
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xs font-bold text-ember">{String(i + 1).padStart(2, '0')}</span>
                  <h2
                    className="font-serif text-[#2a1f1a] border-b border-[#2a1f1a]/10 pb-1 flex-1"
                    style={{ fontSize: 'var(--briefing-heading-size)', fontWeight: 'var(--briefing-heading-weight)' }}
                  >
                    {section.title}
                  </h2>
                </div>
                <div
                  data-testid="briefing-markdown-body"
                  className="briefing-body-academic text-[#2a1f1a]/90 leading-[1.85]"
                  style={{ fontSize: 'var(--briefing-body-size)', fontWeight: 'var(--briefing-body-weight)' }}
                >
                  <MarkdownRenderer content={section.body} fileName="briefing.md" briefingStyle="academic" terms={terms} />
                </div>
              </section>
            )
          })}
        </div>

        {parsed.sources.length > 0 && (
          <div className="mt-8 border-t border-[#e8d5b7]/20 pt-4">
            <button
              onClick={() => setExpandedSources((v) => !v)}
              className="text-sm text-[#e8d5b7]/70 hover:text-[#f5e6cc] transition-colors"
              data-testid="briefing-source-expand-toggle"
            >
              {expandedSources ? '收起来源' : '展开来源'}
            </button>
            {expandedSources && (
              <div className="mt-4 flex flex-wrap gap-2">
                {parsed.sources.map((group, i) =>
                  group.items.map((item, j) => (
                    <BriefingSourceItem key={`${i}-${j}`} item={item} theme="academic" variant="pill" />
                  ))
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  )
}
