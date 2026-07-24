import { useState, useRef } from 'react'
import { useStore } from '@/store'
import type { BriefingResult } from '@/types'
import type { ParsedBriefing } from '@/lib/parse-briefing-markdown'
import { ArticleBodyChunks } from '@/components/article-assistant/ArticleBodyChunks'
import { ArticleAnnotations } from '@/components/article-assistant/ArticleAnnotations'
import type { ArticleAssistantChunk } from '@shared/index'
import type { TermDef } from '@/components/md/rehypeTermHighlight'
import { BriefingSourceCard } from './BriefingSourceCard'
import { BriefingMetaLine } from './BriefingMetaLine'
import { Quote } from '@/components/Quote'
import { TransferToWritingButton } from './TransferToWritingButton'
import { AnnotationListButton } from '@/components/article-assistant/AnnotationListButton'

export function AcademicBriefingLayout({
  result,
  parsed,
  displayDate,
  timeString,
  sourceStatus,
  cacheWriteFailed,
  terms,
  chunks,
  swapButton,
  filePath,
}: {
  result: BriefingResult
  parsed: ParsedBriefing
  displayDate: string
  timeString?: string
  sourceStatus?: Record<string, 'ok' | 'failed' | 'empty'>
  cacheWriteFailed?: boolean
  terms?: TermDef[]
  chunks?: ArticleAssistantChunk[]
  swapButton?: React.ReactNode
  filePath?: string
}) {
  const [expandedSources, setExpandedSources] = useState(false)
  const articleBodyRef = useRef<HTMLDivElement>(null)
  const activeChunkIndex = useStore((s) => s.assistantSession?.activeChunkIndex ?? null)
  const setAssistantActiveChunk = useStore((s) => s.setAssistantActiveChunk)
  const articleName = filePath?.split(/[\\/]/).pop()?.replace(/\.md$/, '') ?? result.title

  return (
    <main
      data-testid="briefing-academic-layout"
      className="relative z-[5] flex-1 overflow-y-auto"
    >
      <div ref={articleBodyRef} className="w-[95%] max-w-[1600px] min-w-[520px] mx-auto px-4 py-6 relative briefing-article-body">
        {swapButton && <div className="absolute top-4 right-4 z-10">{swapButton}</div>}
        <header className="text-center mb-8">
          <h1 className="text-[24px] font-bold font-serif text-[#f5e6cc] mb-2">{result.title}</h1>
          <BriefingMetaLine
            displayDate={displayDate}
            timeString={timeString}
            sourceStatus={sourceStatus}
            cacheWriteFailed={cacheWriteFailed}
            theme="academic"
          />
          <div className="mt-5 flex justify-center">
            <Quote surface="briefing" />
          </div>
          {filePath && (
            <div className="mt-3 flex items-center justify-center gap-2">
              <TransferToWritingButton
                name={articleName}
                content={result.content}
                sourceType="digest"
                sourcePath={filePath}
                theme="academic"
              />
              <AnnotationListButton articlePath={filePath} theme="academic" />
            </div>
          )}
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
            activeChunkIndex={activeChunkIndex}
            onChunkEnter={(i) => setAssistantActiveChunk(i)}
            onChunkLeave={() => setAssistantActiveChunk(null)}
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
              <div className="mt-4 space-y-4">
                {parsed.sources.map((group, i) => (
                  <div key={i} data-testid="briefing-source-group">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs tracking-[0.2em] text-ember" style={{ fontVariant: 'small-caps' }}>
                        {group.title}
                      </span>
                      <span className="flex-1 border-t border-ember/30" />
                    </div>
                    <div className="space-y-2">
                      {group.items.map((item, j) => (
                        <BriefingSourceCard key={j} item={item} theme="academic" />
                      ))}
                    </div>
                  </div>
                ))}
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
