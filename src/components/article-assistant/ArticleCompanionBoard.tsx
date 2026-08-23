import { useEffect } from 'react'
import { useStore } from '@/store'
import { WritingEditor } from '@/components/writing/WritingEditor'
import { HtmlPreview } from '@/components/writing/HtmlPreview'
import { MarkdownRenderer } from '@/components/md/MarkdownRenderer'
import type { BriefingTheme } from '@shared/index'

export function ArticleCompanionBoard({ theme = 'academic' }: { theme?: BriefingTheme }) {
  const file = useStore((s) => s.articleCompanion)
  const updateBody = useStore((s) => s.updateArticleCompanionBody)
  const save = useStore((s) => s.saveArticleCompanion)
  const close = useStore((s) => s.closeArticleCompanion)

  useEffect(() => {
    if (!file?.dirty) return
    const t = setTimeout(() => void save(), 1500)
    return () => clearTimeout(t)
  }, [file?.body, file?.dirty])

  if (!file) {
    return (
      <div className="flex h-full items-center justify-center px-6">
        <p data-testid="article-companion-empty" className="text-center text-parchment/40 text-xs leading-relaxed">
          在对照模式下点击左侧文章，在此展开对照
        </p>
      </div>
    )
  }

  const base = file.filePath.split(/[\\/]/).pop() || file.filePath

  return (
    <div data-testid="article-companion-board" className="flex flex-col h-full min-h-0">
      <div className="flex items-center gap-2 px-3 h-9 border-b border-parchment/10 shrink-0">
        <span className="truncate text-[11px] min-w-0 font-serif text-parchment/80">{base}</span>
        <span data-testid="article-companion-save-status" className="shrink-0 text-[10px]">
          {file.saving === 'saving' ? <span className="text-parchment/50">保存中…</span>
           : file.saving === 'saved' ? <span className="text-emerald-400/70">已保存 ✓</span>
           : file.saving === 'error' ? <span className="text-red-400/70">保存失败</span> : null}
        </span>
        <div className="flex-1" />
        <button data-testid="article-companion-close" className="text-parchment/60 hover:text-ember text-sm leading-none px-1" onClick={() => void close()} aria-label="关闭对照">✕</button>
      </div>
      {file.kind === 'md' && !file.readonly ? (
        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 text-parchment/90">
          <WritingEditor key={file.filePath} initial={file.body} onChange={(md) => updateBody(md)} registerToolbarAction={false} theme={theme} filePath={file.filePath} />
        </div>
      ) : file.kind === 'html' ? (
        <div className="flex-1 min-h-0"><HtmlPreview file={{ path: file.filePath, body: file.body }} /></div>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4">
          <MarkdownRenderer content={file.body} fileName={base} hideHeader briefingStyle="academic" />
        </div>
      )}
    </div>
  )
}
