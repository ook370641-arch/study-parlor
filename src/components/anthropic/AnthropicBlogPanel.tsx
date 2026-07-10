import { useMemo, useState } from 'react'
import { useStore } from '@/store'
import { AnthropicArticleRow } from './AnthropicArticleRow'
import { AnthropicArticleReader } from './AnthropicArticleReader'
import { AnthropicErrorMessage } from './AnthropicErrorMessage'
import type { BriefingTheme } from '@shared/index'

interface Props {
  theme?: BriefingTheme
}

export function AnthropicBlogPanel({ theme = 'academic' }: Props) {
  const isAcademic = theme === 'academic'
  const themeClasses = isAcademic
    ? {
        panelBg: 'bg-ink/60',
        sidebarBg: 'bg-ink/80',
        border: 'border-slate/30',
        text: 'text-parchment',
        muted: 'text-parchment/50',
        inputBg: 'bg-parchment/10',
        inputText: 'text-parchment',
        inputPlaceholder: 'placeholder:text-parchment/40',
        inputBorder: 'border-slate/30 focus:border-ember/50',
        button: 'bg-ember/20 text-parchment hover:bg-ember/30',
        emptyIcon: 'text-parchment/20',
        skeleton: 'bg-parchment/10',
      }
    : {
        panelBg: 'bg-white',
        sidebarBg: 'bg-[#e8e4de]',
        border: 'border-[#c9c3b8]',
        text: 'text-[#1a1a1a]',
        muted: 'text-[#6b5d52]',
        inputBg: 'bg-white',
        inputText: 'text-[#1a1a1a]',
        inputPlaceholder: 'placeholder:text-[#6b5d52]/60',
        inputBorder: 'border-[#c9c3b8] focus:border-[#1a1a1a]/50',
        button: 'bg-[#1a1a1a] text-white hover:bg-[#333]',
        emptyIcon: 'text-[#c9c3b8]',
        skeleton: 'bg-[#e8e4de]',
      }

  const { articles, loading, error, lastFetchedAt } = useStore((s) => s.anthropicBlogCache)
  const readerFilePath = useStore((s) => s.anthropicReaderFilePath)
  const discover = useStore((s) => s.discoverAnthropicArticles)
  const closeReader = useStore((s) => s.closeAnthropicReader)

  const [query, setQuery] = useState('')
  const [listVisible, setListVisible] = useState(true)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return articles
    return articles.filter(
      (a) =>
        a.title?.toLowerCase().includes(q) ||
        (a.summary ?? '').toLowerCase().includes(q)
    )
  }, [articles, query])

  const readerSidebarToggle = readerFilePath ? (
    <button
      type="button"
      onClick={() => setListVisible((v) => !v)}
      className={`text-sm ${
        isAcademic
          ? 'text-parchment/70 hover:text-parchment'
          : 'text-[#6b5d52] hover:text-[#1a1a1a]'
      }`}
      title={listVisible ? '隐藏列表' : '显示列表'}
    >
      {listVisible ? '隐藏列表' : '显示列表'}
    </button>
  ) : null

  return (
    <div
      data-testid="anthropic-blog-panel"
      className={`relative flex-1 flex min-w-0 overflow-hidden ${themeClasses.panelBg}`}
    >
      <div
        className={`flex flex-col border-r ${themeClasses.border} ${themeClasses.sidebarBg} transition-all duration-200 ${
          listVisible ? 'w-80 min-w-[20rem]' : 'w-0 opacity-0 overflow-hidden'
        }`}
      >
        <div className={`flex items-center justify-between px-4 py-3 border-b ${themeClasses.border} shrink-0`}>
          <div className="min-w-0">
            <h2 className={`text-base font-serif truncate ${themeClasses.text}`}>Anthropic Engineering</h2>
            {lastFetchedAt && (
              <p className={`text-[10px] ${themeClasses.muted}`}>
                更新于 {new Date(lastFetchedAt).toLocaleString('zh-CN')}
              </p>
            )}
          </div>
          <button
            data-testid="anthropic-refresh-button"
            onClick={() => discover()}
            disabled={loading}
            className={`ml-2 px-2.5 py-1 rounded text-xs disabled:opacity-50 shrink-0 ${themeClasses.button}`}
          >
            {loading ? '刷新中' : '刷新'}
          </button>
        </div>

        <div className={`px-4 py-2 border-b ${themeClasses.border} shrink-0`}>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索标题或摘要…"
            className={`w-full px-3 py-1.5 rounded text-sm outline-none border ${themeClasses.inputBg} ${themeClasses.inputText} ${themeClasses.inputPlaceholder} ${themeClasses.inputBorder}`}
          />
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3">
          {loading && articles.length === 0 && (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className={`h-24 rounded animate-pulse ${themeClasses.skeleton}`} />
              ))}
            </div>
          )}

          {error && (
            <AnthropicErrorMessage error={error} onRetry={() => discover()} />
          )}

          {!loading && !error && filtered.length === 0 && (
            <div className={`text-center py-12 text-sm ${themeClasses.muted}`}>
              {articles.length === 0 ? (
                <p>暂无文章，点击右上角刷新列表。</p>
              ) : (
                <p>没有匹配“{query}”的文章。</p>
              )}
            </div>
          )}

          <div className="space-y-3">
            {filtered.map((article) => (
              <AnthropicArticleRow key={article.url} article={article} theme={theme} />
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 min-w-0 flex flex-col">
        {readerFilePath ? (
          <AnthropicArticleReader
            filePath={readerFilePath}
            onClose={closeReader}
            sidebarToggle={readerSidebarToggle}
          />
        ) : (
          <div className={`flex-1 flex flex-col items-center justify-center px-6 ${themeClasses.muted}`}>
            <svg
              className={`w-12 h-12 mb-4 ${themeClasses.emptyIcon}`}
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
              />
            </svg>
            <p className="text-sm">从左侧列表选择一篇文章开始阅读</p>
          </div>
        )}
      </div>
    </div>
  )
}
