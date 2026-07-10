import { useMemo, useState } from 'react'
import { useStore } from '@/store'
import { AnthropicArticleRow } from './AnthropicArticleRow'
import { AnthropicArticleReader } from './AnthropicArticleReader'
import { AnthropicErrorMessage } from './AnthropicErrorMessage'

export function AnthropicBlogPanel() {
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
      className="text-sm text-parchment/70 hover:text-parchment"
      title={listVisible ? '隐藏列表' : '显示列表'}
    >
      {listVisible ? '隐藏列表' : '显示列表'}
    </button>
  ) : null

  return (
    <div
      data-testid="anthropic-blog-panel"
      className="relative flex-1 flex min-w-0 bg-ink/60 overflow-hidden"
    >
      <div
        className={`flex flex-col border-r border-slate/30 bg-ink/80 transition-all duration-200 ${
          listVisible ? 'w-80 min-w-[20rem]' : 'w-0 opacity-0 overflow-hidden'
        }`}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate/30 shrink-0">
          <div className="min-w-0">
            <h2 className="text-base font-serif text-parchment truncate">Anthropic Engineering</h2>
            {lastFetchedAt && (
              <p className="text-[10px] text-parchment/50">
                更新于 {new Date(lastFetchedAt).toLocaleString('zh-CN')}
              </p>
            )}
          </div>
          <button
            data-testid="anthropic-refresh-button"
            onClick={() => discover()}
            disabled={loading}
            className="ml-2 px-2.5 py-1 rounded bg-ember/20 text-xs text-parchment hover:bg-ember/30 disabled:opacity-50 shrink-0"
          >
            {loading ? '刷新中' : '刷新'}
          </button>
        </div>

        <div className="px-4 py-2 border-b border-slate/30 shrink-0">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索标题或摘要…"
            className="w-full px-3 py-1.5 rounded bg-parchment/10 text-sm text-parchment placeholder:text-parchment/40 border border-slate/30 focus:border-ember/50 outline-none"
          />
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3">
          {loading && articles.length === 0 && (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-24 rounded bg-parchment/10 animate-pulse" />
              ))}
            </div>
          )}

          {error && (
            <AnthropicErrorMessage error={error} onRetry={() => discover()} />
          )}

          {!loading && !error && filtered.length === 0 && (
            <div className="text-center text-parchment/60 py-12 text-sm">
              {articles.length === 0 ? (
                <p>暂无文章，点击右上角刷新列表。</p>
              ) : (
                <p>没有匹配“{query}”的文章。</p>
              )}
            </div>
          )}

          <div className="space-y-3">
            {filtered.map((article) => (
              <AnthropicArticleRow key={article.url} article={article} />
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
          <div className="flex-1 flex flex-col items-center justify-center text-parchment/50 px-6">
            <svg
              className="w-12 h-12 mb-4 text-parchment/20"
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
