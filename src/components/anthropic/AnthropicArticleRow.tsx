import { useState } from 'react'
import { useStore } from '@/store'
import { ipc } from '@/lib/ipc'
import type { AnthropicArticleMeta } from '@shared/index'

interface Props {
  article: AnthropicArticleMeta
}

function formatDate(iso: string | null | undefined) {
  if (!iso) return '未知日期'
  try {
    return new Date(iso).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })
  } catch {
    return iso
  }
}

export function AnthropicArticleRow({ article }: Props) {
  const importArticle = useStore((s) => s.importAnthropicArticle)
  const cancelImport = useStore((s) => s.cancelAnthropicImport)
  const openReader = useStore((s) => s.openAnthropicReader)
  const [importing, setImporting] = useState(false)

  const handleClick = async () => {
    if (importing) return

    // If already saved, try to open directly; re-import if the file is missing.
    if (article.isSaved && article.filePath) {
      try {
        await ipc.readMd(article.filePath)
        await openReader(article.filePath)
        return
      } catch {
        // fall through to re-import
      }
    }

    setImporting(true)
    try {
      await importArticle(article.url)
    } finally {
      setImporting(false)
    }
  }

  const handleCancel = (e: React.MouseEvent) => {
    e.stopPropagation()
    cancelImport()
    setImporting(false)
  }

  return (
    <button
      data-testid="anthropic-article-row"
      onClick={handleClick}
      disabled={importing}
      className="w-full text-left rounded border border-slate/30 bg-ink/60 p-4 hover:border-ember/50 transition-colors group disabled:opacity-70"
    >
      <div className="flex items-start gap-4">
        {article.imageUrl ? (
          <img
            src={article.imageUrl}
            alt=""
            className="shrink-0 w-20 h-20 object-cover rounded bg-parchment/10"
            loading="lazy"
          />
        ) : (
          <div className="shrink-0 w-20 h-20 rounded bg-parchment/10 flex items-center justify-center text-xs text-parchment/40">
            无配图
          </div>
        )}

        <div className="flex-1 min-w-0">
          <h3
            data-testid="anthropic-article-title"
            className="text-base font-serif text-parchment group-hover:text-ember transition-colors truncate"
          >
            {article.title}
          </h3>
          <p className="text-xs text-parchment/50 mt-1">{formatDate(article.publishedAt)}</p>
          {article.summary && (
            <p className="text-sm text-parchment/70 mt-2 line-clamp-2">{article.summary}</p>
          )}
        </div>

        <div className="shrink-0 flex flex-col items-end gap-2 min-w-[4.5rem]">
          {article.isSaved ? (
            <span data-testid="anthropic-article-saved" className="text-xs px-2 py-0.5 rounded bg-ember/20 text-ember">
              已保存
            </span>
          ) : (
            <span className="text-xs px-2 py-0.5 rounded border border-slate/30 text-parchment/70">
              导入阅读
            </span>
          )}

          {importing ? (
            <button
              type="button"
              onClick={handleCancel}
              className="text-xs text-parchment/60 hover:text-ember underline"
            >
              取消
            </button>
          ) : (
            <span className="text-xs text-parchment/40">
              {article.isSaved ? '阅读' : '点击导入'}
            </span>
          )}
        </div>
      </div>
    </button>
  )
}
