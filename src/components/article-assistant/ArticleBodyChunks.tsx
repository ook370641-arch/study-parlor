import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MarkdownRenderer } from '@/components/md/MarkdownRenderer'
import { splitArticleIntoChunks } from '@/lib/article-chunks'
import { isSelectionActiveIn } from '@/lib/selection-busy'
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

/**
 * 导读（chunks/terms）异步到达会触发整篇文章 DOM 重建（章节切分 + 术语高亮注入），
 * 若此时用户正在划选，选区锚点被销毁——表现为「拖不动」或「复制结果只剩拖动的尾巴」。
 * 因此选区活跃（按住鼠标划选 / 选区未收敛且落在文章内）期间延迟应用导读变化，
 * 待选区收敛后补应用。
 */
function useDeferredGuideView(chunks: ArticleAssistantChunk[], terms: TermDef[] | undefined) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mouseDownInsideRef = useRef(false)
  const pendingRef = useRef<{ chunks: ArticleAssistantChunk[]; terms: TermDef[] | undefined } | null>(null)
  const [applied, setApplied] = useState<{ chunks: ArticleAssistantChunk[]; terms: TermDef[] | undefined }>({ chunks, terms })

  const selectionBusy = useCallback((): boolean => {
    return isSelectionActiveIn(containerRef.current, mouseDownInsideRef.current)
  }, [])

  const flushPending = useCallback(() => {
    const pending = pendingRef.current
    if (pending && !selectionBusy()) {
      pendingRef.current = null
      setApplied(pending)
    }
  }, [selectionBusy])

  useEffect(() => {
    if (chunks === applied.chunks && terms === applied.terms) return
    pendingRef.current = { chunks, terms }
    flushPending()
  }, [chunks, terms, applied, flushPending])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onMouseDown = (e: MouseEvent) => {
      if (el.contains(e.target as Node)) mouseDownInsideRef.current = true
    }
    const onMouseUp = () => {
      mouseDownInsideRef.current = false
      flushPending()
    }
    // 选区收敛（点击别处 / 全选取消等）时补应用
    const onSelectionChange = () => flushPending()
    document.addEventListener('mousedown', onMouseDown, true)
    document.addEventListener('mouseup', onMouseUp)
    document.addEventListener('selectionchange', onSelectionChange)
    return () => {
      document.removeEventListener('mousedown', onMouseDown, true)
      document.removeEventListener('mouseup', onMouseUp)
      document.removeEventListener('selectionchange', onSelectionChange)
    }
  }, [flushPending])

  return { containerRef, applied }
}

export const ArticleBodyChunks = memo(function ArticleBodyChunks({ content, chunks, fileName, theme = 'academic', terms, activeChunkIndex, onChunkEnter, onChunkLeave, onChunkClick }: Props) {
  const { containerRef, applied } = useDeferredGuideView(chunks, terms)
  const articleChunks = useMemo(() => splitArticleIntoChunks(content, applied.chunks.map((c) => c.heading)), [content, applied.chunks])
  const isAcademic = theme !== 'newspaper'

  if (articleChunks.length === 1 && !articleChunks[0].heading) {
    return (
      <div ref={containerRef} className="space-y-4">
        <MarkdownRenderer content={articleChunks[0].body} fileName={fileName} hideHeader briefingStyle={theme} terms={applied.terms} />
      </div>
    )
  }

  let headingIndex = 0
  return (
    <div ref={containerRef} className="space-y-6">
      {articleChunks.map((chunk, i) => {
        const hasHeading = !!chunk.heading
        // guideIndex maps to guide.chunks[N]: 引言(无标题)不参与同步，❧1↔§0, ❧2↔§1, ...
        const guideIndex = hasHeading ? headingIndex : -1
        if (hasHeading) headingIndex++
        const isActive = activeChunkIndex === guideIndex
        // 拖动划选中（e.buttons!==0）不做 hover 同步：enter/leave 会写 store 触发
        // 全量 react-markdown 重解析，拖动经过每个章节边界都卡一次
        const dragging = (e: React.MouseEvent) => e.buttons !== 0
        // 静止态不画竖线（用户反馈：灰色竖线像批注区隔，破坏阅读）；hover/激活时才亮琥珀线，
        // border 宽度不变仅换色，无布局抖动
        const borderColor = isActive ? 'border-ember' : 'border-transparent'
        return (
          <section
            key={i}
            data-testid="article-body-chunk"
            data-chunk-index={hasHeading ? guideIndex : undefined}
            className={`rounded-r-lg border-l-4 pl-4 py-2 transition-colors ${borderColor} ${isActive ? 'bg-ember/5' : ''}`}
            onMouseEnter={(e) => !dragging(e) && hasHeading && onChunkEnter?.(guideIndex)}
            onMouseLeave={(e) => !dragging(e) && onChunkLeave?.()}
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
              </div>
            )}
            <div className={isAcademic ? 'text-parchment/90' : 'text-[#1a1a1a]'}>
              <MarkdownRenderer content={chunk.body} fileName={fileName} hideHeader briefingStyle={theme} terms={applied.terms} />
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
