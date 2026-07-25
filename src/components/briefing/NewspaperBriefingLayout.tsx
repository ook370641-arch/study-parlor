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
import { TransferToWritingButton } from './TransferToWritingButton'
import { AnnotationListButton } from '@/components/article-assistant/AnnotationListButton'

export function NewspaperBriefingLayout({
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
  const articleBodyRef = useRef<HTMLElement>(null)
  const activeChunkIndex = useStore((s) => s.assistantSession?.activeChunkIndex ?? null)
  const setAssistantActiveChunk = useStore((s) => s.setAssistantActiveChunk)
  const articleName = filePath?.split(/[\\/]/).pop()?.replace(/\.md$/, '') ?? result.title

  return (
    <main
      data-testid="briefing-newspaper-layout"
      className="relative z-[5] flex-1 overflow-y-auto bg-white"
    >
      <article ref={articleBodyRef} className="w-[95%] max-w-[1600px] min-w-[520px] mx-auto px-4 py-6 relative briefing-article-body">
        {swapButton && <div className="absolute top-4 right-4 z-10">{swapButton}</div>}
        <header className="border-b-2 border-[#1a1a1a] pb-4 mb-6 text-center arrive-item">
          <h1 className="text-[28px] font-extrabold font-serif text-[#1a1a1a] mb-1">{result.title}</h1>
          <div className="flex items-center justify-center gap-3 text-xs text-[#555] uppercase tracking-widest">
            <span>夜航简报</span>
            <span>|</span>
            <BriefingMetaLine
              displayDate={displayDate}
              timeString={timeString}
              sourceStatus={sourceStatus}
              cacheWriteFailed={cacheWriteFailed}
              theme="newspaper"
            />
          </div>
          {filePath && (
            <div className="mt-3 flex items-center justify-center gap-2">
              <TransferToWritingButton
                name={articleName}
                content={result.content}
                sourceType="digest"
                sourcePath={filePath}
                theme="newspaper"
              />
              <AnnotationListButton articlePath={filePath} theme="newspaper" />
            </div>
          )}
        </header>

        <div
          data-testid="briefing-markdown-body"
          className="briefing-body-newspaper text-[#1a1a1a] space-y-6 arrive-item d3"
          style={{ fontSize: 'var(--briefing-body-size)', fontWeight: 'var(--briefing-body-weight)' }}
        >
          <ArticleBodyChunks
            content={result.content}
            chunks={chunks ?? []}
            fileName="briefing.md"
            theme="newspaper"
            terms={terms}
            activeChunkIndex={activeChunkIndex}
            onChunkEnter={(i) => setAssistantActiveChunk(i)}
            onChunkLeave={() => setAssistantActiveChunk(null)}
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
              <div className="mt-4 space-y-4">
                {parsed.sources.map((group, i) => (
                  <div key={i} data-testid="briefing-source-group">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs tracking-[0.2em] text-[#8a3a3a]" style={{ fontVariant: 'small-caps' }}>
                        {group.title}
                      </span>
                      <span className="flex-1 border-t border-[#1a1a1a]/20" />
                    </div>
                    <div className="space-y-2">
                      {group.items.map((item, j) => (
                        <BriefingSourceCard key={j} item={item} theme="newspaper" />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </article>
      {filePath && (
        <ArticleAnnotations
          articlePath={filePath}
          articleRef={articleBodyRef}
          theme="newspaper"
        />
      )}
    </main>
  )
}
