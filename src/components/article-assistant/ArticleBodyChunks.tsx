import { memo, useMemo } from 'react'
import { useStore } from '@/store'
import { MarkdownRenderer } from '@/components/md/MarkdownRenderer'
import { splitArticleIntoChunks } from '@/lib/article-chunks'
import type { ArticleAssistantChunk } from '@shared/index'
import type { TermDef } from '@/components/md/rehypeTermHighlight'

interface Props {
  content: string
  chunks: ArticleAssistantChunk[]
  fileName: string
  theme?: 'academic' | 'newspaper'
  terms?: TermDef[]
  activeChunkIndex?: number | null
  onChunkEnter?: (index: number) => void
  onChunkLeave?: () => void
  onChunkClick?: (index: number) => void
  collectible?: boolean
}

export const ArticleBodyChunks = memo(function ArticleBodyChunks({ content, chunks, fileName, theme = 'academic', terms, activeChunkIndex, onChunkEnter, onChunkLeave, onChunkClick, collectible = false }: Props) {
  const collectionEntries = useStore((s) => s.collection.entries)
  const contextId = useStore((s) => s.assistantSession?.contextId ?? null)
  const collectChunk = useStore((s) => s.collectChunk)
  const articleChunks = useMemo(() => splitArticleIntoChunks(content, chunks.map((c) => c.heading)), [content, chunks])
  const isAcademic = theme !== 'newspaper'

  if (articleChunks.length === 1 && !articleChunks[0].heading) {
    return (
      <div className="space-y-4">
        <MarkdownRenderer content={articleChunks[0].body} fileName={fileName} hideHeader briefingStyle={theme} terms={terms} />
      </div>
    )
  }

  let headingIndex = 0
  return (
    <div className="space-y-6">
      {articleChunks.map((chunk, i) => {
        const hasHeading = !!chunk.heading
        // guideIndex maps to guide.chunks[N]: 引言(无标题)不参与同步，❧1↔§0, ❧2↔§1, ...
        const guideIndex = hasHeading ? headingIndex : -1
        if (hasHeading) headingIndex++
        const isActive = activeChunkIndex === guideIndex
        const borderColor = isAcademic
          ? isActive ? 'border-ember' : 'border-parchment/20'
          : isActive ? 'border-ember' : 'border-[#1a1a1a]/10'
        return (
          <section
            key={i}
            data-testid="article-body-chunk"
            data-chunk-index={hasHeading ? guideIndex : undefined}
            className={`rounded-r-lg border-l-4 pl-4 py-2 transition-colors ${borderColor} ${isActive ? 'bg-ember/5' : ''}`}
            onMouseEnter={() => hasHeading && onChunkEnter?.(guideIndex)}
            onMouseLeave={() => onChunkLeave?.()}
          >
            {chunk.heading && (
              <div
                data-testid="article-chunk-plaque"
                className="flex items-center gap-2 mb-2 cursor-pointer select-none"
                onClick={(e) => {
                  e.stopPropagation()
                  onChunkClick?.(guideIndex)
                }}
                title="点击定位到导读对应章节"
              >
                <span className="text-ember text-sm leading-none">
                  ❧<span className="text-xs align-top">{headingIndex}</span>
                </span>
                <span className="text-ember text-sm tracking-[0.2em]" style={{ fontVariant: 'small-caps' }}>
                  {chunk.heading}
                </span>
                <span className="flex-1 border-t border-ember/40" />
                {collectible && (() => {
                  const isCollected = collectionEntries.some(
                    (e) => e.briefingFilePath === contextId && e.chunkIndex === guideIndex
                  )
                  return (
                    <button
                      type="button"
                      data-testid={`chunk-collect-button-${guideIndex}`}
                      disabled={isCollected}
                      onClick={(e) => {
                        e.stopPropagation()
                        void collectChunk(guideIndex)
                      }}
                      className={`text-xs tracking-wider transition-colors flex-shrink-0 ${
                        isCollected
                          ? 'text-ember cursor-default'
                          : isAcademic
                            ? 'text-parchment/40 hover:text-ember'
                            : 'text-[#6b5d52]/60 hover:text-ember'
                      }`}
                    >
                      {isCollected ? '★ 已收藏' : '☆ 收入精选集'}
                    </button>
                  )
                })()}
              </div>
            )}
            <div className={isAcademic ? 'text-parchment/90' : 'text-[#1a1a1a]'}>
              <MarkdownRenderer content={chunk.body} fileName={fileName} hideHeader briefingStyle={theme} terms={terms} />
            </div>
          </section>
        )
      })}
    </div>
  )
}, (prev, next) =>
  prev.content === next.content &&
  prev.chunks === next.chunks &&
  prev.fileName === next.fileName &&
  prev.theme === next.theme &&
  prev.terms === next.terms &&
  prev.activeChunkIndex === next.activeChunkIndex &&
  prev.collectible === next.collectible
)
