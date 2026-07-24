import { memo, useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useStore } from '@/store'
import { ipc } from '@/lib/ipc'
import type { AnthropicArticleMeta, BriefingTheme } from '@shared/index'

interface Props {
  article: AnthropicArticleMeta
  theme?: BriefingTheme
  onRequestDelete?: (article: AnthropicArticleMeta) => void
}

function formatDate(iso: string | null | undefined) {
  if (!iso) return '未知日期'
  try {
    return new Date(iso).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })
  } catch {
    return iso
  }
}

export const AnthropicArticleRow = memo(function AnthropicArticleRow({ article, theme = 'academic', onRequestDelete }: Props) {
  const isAcademic = theme !== 'newspaper'
  const importArticle = useStore((s) => s.importAnthropicArticle)
  const cancelImport = useStore((s) => s.cancelAnthropicImport)
  const openReader = useStore((s) => s.openAnthropicReader)
  const [importing, setImporting] = useState(false)

  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  useEffect(() => {
    if (!menu) return
    const h = () => setMenu(null)
    document.addEventListener('click', h)
    return () => document.removeEventListener('click', h)
  }, [menu])

  const handleClick = async () => {
    if (importing) {
      // Clicking during import cancels it
      cancelImport()
      setImporting(false)
      return
    }

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

  // --- Theme-dependent classes ---
  const bgClass = isAcademic ? 'bg-ink/30' : 'bg-white'
  const hoverBorder = isAcademic ? 'hover:border-ember/50' : 'hover:border-[#1a1a1a]/50'
  const titleColor = isAcademic ? 'text-parchment' : 'text-[#1a1a1a]'
  const mutedText = isAcademic ? 'text-parchment/50' : 'text-[#6b5d52]'
  const placeholderBg = isAcademic ? 'bg-parchment/10' : 'bg-[#e8e4de]'
  const placeholderText = isAcademic ? 'text-parchment/40' : 'text-[#6b5d52]/60'
  const titleHover = isAcademic ? 'group-hover:text-ember' : 'group-hover:text-[#1a1a1a]'

  // Left border by state
  let borderClass: string
  const borderStyle: React.CSSProperties = importing
    ? { animation: `borderPulse${isAcademic ? '' : 'Newspaper'} 1s ease-in-out infinite` }
    : {}
  if (importing) {
    borderClass = isAcademic
      ? 'border-l-[3px] border-l-ember border-t-[rgba(232,213,183,0.12)] border-r-[rgba(232,213,183,0.12)] border-b-[rgba(232,213,183,0.12)]'
      : 'border-l-[3px] border-l-[#1a1a1a] border-t-[#c9c3b8]/30 border-r-[#c9c3b8]/30 border-b-[#c9c3b8]/30'
  } else if (article.isSaved) {
    borderClass = isAcademic
      ? 'border-l-[3px] border-l-ember border-t-[rgba(232,213,183,0.12)] border-r-[rgba(232,213,183,0.12)] border-b-[rgba(232,213,183,0.12)]'
      : 'border-l-[3px] border-l-[#1a1a1a] border-t-[#c9c3b8]/30 border-r-[#c9c3b8]/30 border-b-[#c9c3b8]/30'
  } else {
    borderClass = isAcademic
      ? 'border-l-[3px] border-l-[rgba(232,213,183,0.12)] border-t-[rgba(232,213,183,0.12)] border-r-[rgba(232,213,183,0.12)] border-b-[rgba(232,213,183,0.12)]'
      : 'border-l-[3px] border-l-[#c9c3b8]/30 border-t-[#c9c3b8]/30 border-r-[#c9c3b8]/30 border-b-[#c9c3b8]/30'
  }

  // Spinner SVG for importing state
  const Spinner = () => (
    <svg
      className="inline-flex ml-1.5 animate-spin align-middle"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      style={{ opacity: 0.8 }}
    >
      <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
      <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
    </svg>
  )

  return (
    <button
      data-testid="anthropic-article-row"
      onClick={handleClick}
      onContextMenu={(e) => {
        if (!article.isSaved || !article.filePath) return
        e.preventDefault()
        setMenu({ x: e.clientX, y: e.clientY })
      }}
      disabled={false}
      className={`w-full text-left rounded border p-4 transition-colors group relative overflow-hidden ${borderClass} ${bgClass} ${hoverBorder}`}
      style={borderStyle}
    >
      {/* Shimmer sweep line during import */}
      {importing && (
        <div
          className="absolute top-0 h-[2px] pointer-events-none z-10"
          style={{
            background: isAcademic
              ? 'linear-gradient(90deg, transparent, #d97757, transparent)'
              : 'linear-gradient(90deg, transparent, #1a1a1a, transparent)',
            width: '60%',
            animation: 'shimmer 1.2s ease-in-out infinite',
          }}
        />
      )}

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
            className={`font-serif transition-colors line-clamp-1 ${
              importing ? '' : 'group-hover:line-clamp-none'
            } ${titleColor} ${titleHover}`}
            style={{ fontSize: 'var(--briefing-list-title-size)' }}
          >
            {article.title}
            {importing && <Spinner />}
          </h3>
          <p className={`mt-1 ${mutedText}`} style={{ fontSize: 'var(--briefing-list-meta-size)' }}>
            {importing ? '导入中…' : formatDate(article.publishedAt)}
          </p>
        </div>
      </div>
      {/* Hidden element for E2E selectors — indicates saved state without text badge */}
      {article.isSaved && <span data-testid="anthropic-article-saved" className="sr-only" />}
      {menu && createPortal(
        <div
          data-testid="anthropic-row-menu"
          className="fixed z-50 bg-ink border border-parchment/20 rounded shadow-lg py-1 text-xs"
          style={{ left: menu.x, top: menu.y }}
        >
          <button
            type="button"
            data-testid="anthropic-row-delete"
            className="block w-full text-left px-3 py-1.5 hover:bg-parchment/10 text-red-400"
            onClick={() => {
              setMenu(null)
              onRequestDelete?.(article)
            }}
          >
            删除
          </button>
        </div>,
        document.body
      )}
    </button>
  )
})
