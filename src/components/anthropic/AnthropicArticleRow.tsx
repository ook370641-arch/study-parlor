import { useState } from 'react'
import { useStore } from '@/store'
import { ipc } from '@/lib/ipc'
import type { AnthropicArticleMeta, BriefingTheme } from '@shared/index'

interface Props {
  article: AnthropicArticleMeta
  theme?: BriefingTheme
}

function formatDate(iso: string | null | undefined) {
  if (!iso) return '未知日期'
  try {
    return new Date(iso).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })
  } catch {
    return iso
  }
}

export function AnthropicArticleRow({ article, theme = 'academic' }: Props) {
  const isAcademic = theme !== 'newspaper'
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

  const cardClasses = isAcademic
    ? 'border-slate/30 bg-ink/60 hover:border-ember/50 text-parchment'
    : 'border-[#c9c3b8] bg-white hover:border-[#1a1a1a]/50 text-[#1a1a1a]'

  const mutedText = isAcademic ? 'text-parchment/50' : 'text-[#6b5d52]'
  const secondaryText = isAcademic ? 'text-parchment/70' : 'text-[#555]'
  const placeholderBg = isAcademic ? 'bg-parchment/10' : 'bg-[#e8e4de]'
  const placeholderText = isAcademic ? 'text-parchment/40' : 'text-[#6b5d52]/60'
  const savedBadge = isAcademic
    ? 'bg-ember/20 text-ember'
    : 'bg-[#1a1a1a] text-white'
  const actionBorder = isAcademic ? 'border-slate/30' : 'border-[#c9c3b8]'
  const actionText = isAcademic ? 'text-parchment/70' : 'text-[#555]'
  const hintText = isAcademic ? 'text-parchment/40' : 'text-[#999]'
  const titleHover = isAcademic ? 'group-hover:text-ember' : 'group-hover:text-[#1a1a1a]'
  const cancelText = isAcademic ? 'text-ember' : 'text-[#1a1a1a]'

  return (
    <button
      data-testid="anthropic-article-row"
      onClick={handleClick}
      disabled={importing}
      className={`w-full text-left rounded border p-4 transition-colors group disabled:opacity-70 ${cardClasses}`}
    >
      <div className="flex items-start gap-4">
        {article.imageUrl ? (
          <img
            src={article.imageUrl}
            alt=""
            className={`shrink-0 w-20 h-20 object-cover rounded ${placeholderBg}`}
            loading="lazy"
          />
        ) : (
          <div className={`shrink-0 w-20 h-20 rounded flex items-center justify-center text-xs ${placeholderBg} ${placeholderText}`}>
            无配图
          </div>
        )}

        <div className="flex-1 min-w-0">
          <h3
            data-testid="anthropic-article-title"
            className={`text-base font-serif ${titleHover} transition-colors truncate ${isAcademic ? '' : 'text-[#1a1a1a]'}`}
          >
            {article.title}
          </h3>
          <p className={`text-xs mt-1 ${mutedText}`}>{formatDate(article.publishedAt)}</p>
          {article.summary && (
            <p className={`text-sm mt-2 line-clamp-2 ${secondaryText}`}>{article.summary}</p>
          )}
        </div>

        <div className="shrink-0 flex flex-col items-end gap-2 min-w-[4.5rem]">
          {article.isSaved ? (
            <span data-testid="anthropic-article-saved" className={`text-xs px-2 py-0.5 rounded ${savedBadge}`}>
              已保存
            </span>
          ) : (
            <span className={`text-xs px-2 py-0.5 rounded border ${actionBorder} ${actionText}`}>
              导入阅读
            </span>
          )}

          {importing ? (
            <button
              type="button"
              onClick={handleCancel}
              className={`text-xs underline ${cancelText}`}
            >
              取消
            </button>
          ) : (
            <span className={`text-xs ${hintText}`}>
              {article.isSaved ? '阅读' : '点击导入'}
            </span>
          )}
        </div>
      </div>
    </button>
  )
}
