import { useEffect, useMemo, useState, useCallback } from 'react'
import { useStore } from '@/store'
import { ipc } from '@/lib/ipc'
import { BriefingListColumn } from '@/components/BriefingListColumn'
import { AnthropicArticleRow } from './AnthropicArticleRow'
import { AnthropicArticleReader } from './AnthropicArticleReader'
import { AnthropicErrorMessage } from './AnthropicErrorMessage'
import { ConstitutionReportView } from './ConstitutionReportView'
import { SwapPaintingButton } from '@/components/SwapPaintingButton'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { ArticleAssistantPanel } from '@/components/article-assistant'
import { findNewArticleUrls } from '@/lib/anthropic-articles'
import { withConstitutionEntry } from '@/lib/constitution-report'
import type { AnthropicArticleMeta, AnthropicError, BriefingTheme } from '@shared/index'

interface Props {
  theme?: BriefingTheme
}

// Keyframe styles extracted to module level to avoid re-injecting on every render
const KEYFRAME_STYLES = `
  @keyframes shimmer { 0% { left: -60%; } 100% { left: 100%; } }
  @keyframes borderPulse { 0%, 100% { border-left-color: #d97757; } 50% { border-left-color: rgba(217, 119, 87, 0.25); } }
  @keyframes borderPulseNewspaper { 0%, 100% { border-left-color: #1a1a1a; } 50% { border-left-color: rgba(26, 26, 26, 0.25); } }
`

export function AnthropicBlogPanel({ theme = 'academic' }: Props) {
  const isAcademic = theme !== 'newspaper'
  const fontSizeBtnCls = isAcademic
    ? 'border-parchment/25 text-parchment/50 hover:text-parchment hover:border-parchment/40'
    : 'border-[#2a1f1a]/25 text-[#2a1f1a]/50 hover:text-[#2a1f1a] hover:border-[#2a1f1a]/40'
  const themeClasses = useMemo(() => isAcademic
    ? {
        panelBg: 'bg-transparent',
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
      }, [isAcademic])

  const { articles, loading, error, lastFetchedAt } = useStore((s) => s.anthropicBlogCache)
  const readerFilePath = useStore((s) => s.anthropicReaderFilePath)
  const readerBody = useStore((s) => s.anthropicReaderBody)
  const readerTitle = useStore((s) => s.anthropicReaderTitle)
  const discover = useStore((s) => s.discoverAnthropicArticles)
  const mergeArticles = useStore((s) => s.mergeAnthropicArticles)
  const importArticle = useStore((s) => s.importAnthropicArticle)
  const openReader = useStore((s) => s.openAnthropicReader)
  const constitutionReportOpen = useStore((s) => s.constitutionReportOpen)
  const openConstitutionReport = useStore((s) => s.openConstitutionReport)
  const deleteAnthropicArticle = useStore((s) => s.deleteAnthropicArticle)
  const fontSize = useStore((s) => s.briefingFontSize)
  const increaseFontSize = useStore((s) => s.increaseBriefingFontSize)
  const decreaseFontSize = useStore((s) => s.decreaseBriefingFontSize)

  const [query, setQuery] = useState('')
  const [listCollapsed, setListCollapsed] = useState(false)
  const [newArticleCount, setNewArticleCount] = useState(0)
  const [pendingArticles, setPendingArticles] = useState<AnthropicArticleMeta[]>([])
  const [pendingLastFetchedAt, setPendingLastFetchedAt] = useState<string | null>(null)
  const [checkError, setCheckError] = useState<AnthropicError | null>(null)
  const [checkKey, setCheckKey] = useState(0)
  const [pendingDelete, setPendingDelete] = useState<AnthropicArticleMeta | null>(null)

  // 宪法可视化报告是本地内置条目，不经过网络抓取，始终置顶合成
  const displayArticles = useMemo(() => withConstitutionEntry(articles), [articles])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return displayArticles
    return displayArticles.filter(
      (a) =>
        a.title?.toLowerCase().includes(q) ||
        (a.summary ?? '').toLowerCase().includes(q)
    )
  }, [displayArticles, query])

  // 自动检测新文章
  useEffect(() => {
    let cancelled = false
    const check = async () => {
      if (loading) return
      const result = await discover({ commit: false })
      if (cancelled) return
      if (result.ok) {
        const newUrls = findNewArticleUrls(articles, result.articles)
        if (newUrls.length > 0) {
          setNewArticleCount(newUrls.length)
          setPendingArticles(result.articles.filter((a) => newUrls.includes(a.url)))
          setPendingLastFetchedAt(result.lastFetchedAt)
        }
      } else {
        setCheckError(result.error)
      }
    }
    check()
    return () => {
      cancelled = true
    }
  }, [checkKey])

  const handleRefresh = async () => {
    if (pendingArticles.length > 0 && pendingLastFetchedAt) {
      mergeArticles(pendingArticles, pendingLastFetchedAt)
      setNewArticleCount(0)
      setPendingArticles([])
      setPendingLastFetchedAt(null)
    } else {
      await discover()
      setNewArticleCount(0)
    }
  }

  const handleRetryCheck = () => {
    setCheckError(null)
    setCheckKey((k) => k + 1)
  }

  const openOrImportArticle = useCallback(async (article: AnthropicArticleMeta) => {
    // 本地内置条目（宪法报告）直接打开报告视图
    if (article.local === 'constitution') {
      openConstitutionReport()
      return
    }
    // Same logic as AnthropicArticleRow: open saved file, or re-import if missing.
    if (article.isSaved && article.filePath) {
      try {
        await ipc.readMd(article.filePath)
        await openReader(article.filePath)
        return
      } catch {
        // fall through to re-import
      }
    }
    await importArticle(article.url)
  }, [importArticle, openReader, openConstitutionReport])

  return (
    <div
      data-testid="anthropic-blog-panel"
      className={`relative flex-1 flex min-w-0 overflow-hidden z-[5] ${themeClasses.panelBg}`}
    >
      <style>{KEYFRAME_STYLES}</style>
      <BriefingListColumn
        collapsed={listCollapsed}
        onToggle={() => setListCollapsed((c) => !c)}
        theme={theme}
        width={80}
        title="Anthropic Engineering"
      >
        {listCollapsed ? (
          <div className="flex flex-col items-center py-3 gap-3 overflow-y-auto h-full">
            {newArticleCount > 0 && (
              <span
                className={`min-w-[18px] px-1 py-0.5 rounded-full text-[10px] text-center ${
                  isAcademic ? 'bg-ember text-white' : 'bg-[#1a1a1a] text-white'
                }`}
              >
                {newArticleCount}
              </span>
            )}
            {filtered.map((article) => (
              <button
                key={article.url}
                type="button"
                data-testid="anthropic-list-rail-thumb"
                onClick={() => openOrImportArticle(article)}
                title={article.title}
                className={`shrink-0 rounded overflow-hidden focus:outline-none focus:ring-2 focus:ring-ember/50 ${
                  article.isSaved ? 'border-2 border-ember' : 'border-2 border-transparent'
                }`}
              >
                {article.imageUrl ? (
                  <img
                    src={article.imageUrl}
                    alt=""
                    className="w-10 h-10 object-cover"
                    loading="lazy"
                    decoding="async"
                  />
                ) : (
                  <div
                    className={`w-10 h-10 flex items-center justify-center text-sm font-serif ${themeClasses.skeleton} ${themeClasses.muted}`}
                  >
                    {article.local === 'constitution' ? '§' : 'A'}
                  </div>
                )}
              </button>
            ))}
          </div>
        ) : (
          <div className="flex flex-col h-full">
            {checkError && (
              <div className={`px-4 py-2 border-b ${themeClasses.border} shrink-0`}>
                <button
                  type="button"
                  data-testid="anthropic-list-check-error"
                  onClick={handleRetryCheck}
                  title={checkError.message || '检测失败，点击重试'}
                  className={`flex items-center gap-2 text-xs rounded transition-colors ${
                    isAcademic
                      ? 'text-wine hover:bg-wine/10'
                      : 'text-[#8a3a3a] hover:bg-[#8a3a3a]/10'
                  }`}
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <span>{checkError.message || '检测失败，点击重试'}</span>
                </button>
              </div>
            )}

            {lastFetchedAt && (
              <p className={`px-4 pt-3 text-[10px] ${themeClasses.muted}`}>
                更新于 {new Date(lastFetchedAt).toLocaleString('zh-CN')}
              </p>
            )}

            {newArticleCount > 0 && (
              <div className={`px-4 py-2 border-b ${themeClasses.border} shrink-0`}>
                <button
                  type="button"
                  data-testid="anthropic-new-articles-prompt"
                  onClick={handleRefresh}
                  disabled={loading}
                  className={`w-full text-left text-xs px-3 py-2 rounded flex items-center justify-between disabled:opacity-60 ${themeClasses.button}`}
                >
                  <span>发现 {newArticleCount} 篇新文章</span>
                  <span>刷新 →</span>
                </button>
              </div>
            )}

            <div className={`px-4 py-2 border-b ${themeClasses.border} shrink-0`}>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="搜索标题或摘要…"
                className={`w-full px-3 py-1.5 rounded text-sm outline-none border ${themeClasses.inputBg} ${themeClasses.inputText} ${themeClasses.inputPlaceholder} ${themeClasses.inputBorder}`}
              />
            </div>

            <div
              className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 py-3"
              style={{ willChange: 'transform', transform: 'translateZ(0)' }}
            >
              {loading && articles.length === 0 && (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className={`h-24 rounded animate-pulse ${themeClasses.skeleton}`} />
                  ))}
                </div>
              )}

              {error && (
                <AnthropicErrorMessage error={error} onRetry={() => discover()} theme={theme} />
              )}

              {!loading && !error && filtered.length === 0 && (
                <div className={`text-center py-12 text-sm ${themeClasses.muted}`}>
                  {articles.length === 0 ? (
                    <p>暂无文章，正在自动检测新文章…</p>
                  ) : (
                    <p>没有匹配"{query}"的文章。</p>
                  )}
                </div>
              )}

              <div className="space-y-3">
                {filtered.map((article) => (
                  <AnthropicArticleRow key={article.url} article={article} theme={theme} onRequestDelete={setPendingDelete} />
                ))}
              </div>
            </div>
          </div>
        )}
      </BriefingListColumn>

      <div className="flex-1 min-w-0 flex flex-col">
        {constitutionReportOpen ? (
          <ConstitutionReportView theme={theme} />
        ) : readerFilePath ? (
          <AnthropicArticleReader
            filePath={readerFilePath}
            theme={theme}
          />
        ) : (
          <div className={`relative flex-1 flex flex-col items-center justify-center px-6 ${themeClasses.muted}`}>
            {/* 空态下保留字号+换画按钮 — 全局 Chrome 不依赖内容状态；文章打开时由 Reader 渲染自己的按钮。
                报纸版式只显示字号按钮。 */}
            <div className="absolute top-4 right-4 z-20 flex items-start gap-1">
              <button type="button" data-testid="briefing-font-size-decrease"
                disabled={fontSize === 'sm'}
                onClick={() => void decreaseFontSize()}
                className={`w-9 h-9 rounded-full border flex items-center justify-center text-sm disabled:opacity-20 disabled:cursor-not-allowed ${fontSizeBtnCls}`}
                title="减小字号">−</button>
              <button type="button" data-testid="briefing-font-size-increase"
                disabled={fontSize === '7xl'}
                onClick={() => void increaseFontSize()}
                className={`w-9 h-9 rounded-full border flex items-center justify-center text-sm disabled:opacity-20 disabled:cursor-not-allowed ${fontSizeBtnCls}`}
                title="增大字号">+</button>
              {isAcademic && (
                <SwapPaintingButton
                  surface="briefing"
                  data-testid="anthropic-swap-painting-button"
                  className="text-parchment/70 hover:text-parchment"
                />
              )}
            </div>
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
            <p className="text-sm">{listCollapsed ? '从右侧缩略图选择一篇文章' : '从左侧列表选择一篇文章开始阅读'}</p>
          </div>
        )}
      </div>

      {readerFilePath && readerBody && (
        <ArticleAssistantPanel
          articleType="anthropic-article"
          parentPath={readerFilePath}
          articleTitle={readerTitle ?? undefined}
          articleContent={readerBody}
          autoGenerateGuide
          theme={theme}
        />
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        title="删除文章"
        icon="trash"
        confirmLabel="删除"
        confirmVariant="danger"
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          const target = pendingDelete
          setPendingDelete(null)
          if (target?.filePath) void deleteAnthropicArticle(target.filePath)
        }}
      >
        <p>即将删除「{pendingDelete?.title}」，文章卡片将从列表移除。</p>
        <p className="mt-2">将同时删除该文章的旁注对话、标注与导读。</p>
      </ConfirmDialog>
    </div>
  )
}
