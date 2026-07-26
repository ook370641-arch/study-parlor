import { memo, useMemo } from 'react'
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
}

export const ArticleBodyChunks = memo(function ArticleBodyChunks({ content, chunks, fileName, theme = 'academic', terms, activeChunkIndex, onChunkEnter, onChunkLeave }: Props) {
  const articleChunks = useMemo(() => splitArticleIntoChunks(content, chunks.map((c) => c.heading)), [content, chunks])
  const isAcademic = theme !== 'newspaper'

  if (articleChunks.length === 1 && !articleChunks[0].heading) {
    return (
      <div className="space-y-4">
        <MarkdownRenderer content={articleChunks[0].body} fileName={fileName} hideHeader briefingStyle={theme} terms={terms} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {articleChunks.map((chunk, i) => {
        const isActive = activeChunkIndex === i
        const borderColor = isAcademic
          ? isActive ? 'border-ember' : 'border-parchment/20'
          : isActive ? 'border-ember' : 'border-[#1a1a1a]/10'
        return (
          <section
            key={i}
            data-testid="article-body-chunk"
            data-chunk-index={i}
            className={`rounded-r-lg border-l-4 pl-4 py-2 transition-colors ${borderColor} ${isActive ? 'bg-ember/5' : ''}`}
            onMouseEnter={() => onChunkEnter?.(i)}
            onMouseLeave={() => onChunkLeave?.()}
          >
            {chunk.heading && (
              <div data-testid="article-chunk-plaque" className="flex items-center gap-2 mb-2">
                <span className="text-ember text-sm leading-none">
                  ❧<span className="text-xs align-top">{i + 1}</span>
                </span>
                <span className="text-ember text-sm tracking-[0.2em]" style={{ fontVariant: 'small-caps' }}>
                  {chunk.heading}
                </span>
                <span className="flex-1 border-t border-ember/40" />
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
  prev.terms === next.terms
)
