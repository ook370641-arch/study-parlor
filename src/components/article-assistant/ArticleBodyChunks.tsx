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
  onChunkClick?: (index: number) => void
}

export const ArticleBodyChunks = memo(function ArticleBodyChunks({ content, chunks, fileName, theme = 'academic', terms, activeChunkIndex, onChunkEnter, onChunkLeave, onChunkClick }: Props) {
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
            className={`rounded-r-lg border-l-4 pl-4 py-2 transition-colors cursor-pointer ${borderColor} ${isActive ? 'bg-ember/5' : ''}`}
            onMouseEnter={() => hasHeading && onChunkEnter?.(guideIndex)}
            onMouseLeave={() => onChunkLeave?.()}
            onClick={() => {
              if (!hasHeading) return
              // 仅纯点击（无选区）触发导读定位；拖拽选字后 click 也会触发，
              // 此时选区仍在，跳过导航让旁注系统接管
              const sel = window.getSelection()
              if (sel && !sel.isCollapsed) return
              onChunkClick?.(guideIndex)
            }}
          >
            {chunk.heading && (
              <div data-testid="article-chunk-plaque" className="flex items-center gap-2 mb-2">
                <span className="text-ember text-sm leading-none">
                  ❧<span className="text-xs align-top">{headingIndex}</span>
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
  prev.terms === next.terms &&
  prev.activeChunkIndex === next.activeChunkIndex
)
