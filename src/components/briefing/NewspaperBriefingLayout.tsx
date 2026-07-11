import { useState } from 'react'
import type { BriefingResult } from '@/types'
import type { ParsedBriefing } from '@/lib/parse-briefing-markdown'
import { ArticleBodyChunks } from '@/components/article-assistant/ArticleBodyChunks'
import type { ArticleAssistantChunk } from '@shared/index'
import type { TermDef } from '@/components/md/rehypeTermHighlight'
import { BriefingSourceItem } from './BriefingSourceItem'

export function NewspaperBriefingLayout({
  result,
  parsed,
  displayDate,
  terms,
  chunks,
  swapButton,
}: {
  result: BriefingResult
  parsed: ParsedBriefing
  displayDate: string
  terms?: TermDef[]
  chunks?: ArticleAssistantChunk[]
  swapButton?: React.ReactNode
}) {
  const [expandedSources, setExpandedSources] = useState(false)

  return (
    <main
      data-testid="briefing-newspaper-layout"
      className="relative z-[5] flex-1 overflow-y-auto bg-white"
    >
      <article className="w-[90%] max-w-[1250px] min-w-[520px] mx-auto px-4 py-6 relative">
        {swapButton && <div className="absolute top-4 right-4 z-10">{swapButton}</div>}
        <header className="border-b-2 border-[#1a1a1a] pb-4 mb-6 text-center">
          <h1 className="text-[28px] font-extrabold font-serif text-[#1a1a1a] mb-1">{result.title}</h1>
          <div className="flex items-center justify-center gap-3 text-xs text-[#555] uppercase tracking-widest">
            <span>夜航简报</span>
            <span>|</span>
            <span>{displayDate}</span>
          </div>
        </header>

        <div
          data-testid="briefing-markdown-body"
          className="briefing-body-newspaper text-[#1a1a1a] space-y-6"
          style={{ fontSize: 'var(--briefing-body-size)', fontWeight: 'var(--briefing-body-weight)' }}
        >
          <ArticleBodyChunks
            content={result.content}
            chunks={chunks ?? []}
            fileName="briefing.md"
            theme="newspaper"
            terms={terms}
          />
        </div>

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
