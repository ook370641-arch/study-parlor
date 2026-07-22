import { useState, useRef } from 'react'
import type { BriefingResult } from '@/types'
import type { ParsedBriefing } from '@/lib/parse-briefing-markdown'
import { ArticleBodyChunks } from '@/components/article-assistant/ArticleBodyChunks'
import { ArticleAnnotations } from '@/components/article-assistant/ArticleAnnotations'
import type { ArticleAssistantChunk } from '@shared/index'
import type { TermDef } from '@/components/md/rehypeTermHighlight'
import { BriefingSourceItem } from './BriefingSourceItem'

export function AcademicBriefingLayout({
  result,
  parsed,
  displayDate,
  terms,
  chunks,
  swapButton,
  filePath,
}: {
  result: BriefingResult
  parsed: ParsedBriefing
  displayDate: string
  terms?: TermDef[]
  chunks?: ArticleAssistantChunk[]
  swapButton?: React.ReactNode
  filePath?: string
}) {
  const [expandedSources, setExpandedSources] = useState(false)
  const articleBodyRef = useRef<HTMLDivElement>(null)

  return (
    <main
      data-testid="briefing-academic-layout"
      className="relative z-[5] flex-1 overflow-y-auto"
    >
      <div ref={articleBodyRef} className="w-[95%] max-w-[1600px] min-w-[520px] mx-auto px-4 py-6 relative briefing-article-body">
        {swapButton && <div className="absolute top-4 right-4 z-10">{swapButton}</div>}
        <header className="text-center mb-8">
          <h1 className="text-[24px] font-bold font-serif text-[#f5e6cc] mb-2">{result.title}</h1>
          <p className="text-sm text-[#e8d5b7]/60">{displayDate}</p>
        </header>

        <div
          data-testid="briefing-markdown-body"
          className="briefing-body-academic space-y-6"
          style={{ fontSize: 'var(--briefing-body-size)', fontWeight: 'var(--briefing-body-weight)' }}
        >
          <ArticleBodyChunks
            content={result.content}
            chunks={chunks ?? []}
            fileName="briefing.md"
            theme="academic"
            terms={terms}
          />
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
      {filePath && (
        <ArticleAnnotations
          articlePath={filePath}
          articleRef={articleBodyRef}
          theme="academic"
        />
      )}
    </main>
  )
}
