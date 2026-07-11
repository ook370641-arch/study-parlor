import { useEffect, useState } from 'react'
import { ipc } from '@/lib/ipc'
import { MarkdownRenderer } from '@/components/md/MarkdownRenderer'
import { AnthropicErrorMessage } from './AnthropicErrorMessage'
import { ArticleAssistantPanel } from '@/components/article-assistant'
import type { Frontmatter, BriefingTheme } from '@shared/index'

interface Props {
  filePath: string
  onClose?: () => void
  theme?: BriefingTheme
}

async function inlineLocalImages(body: string, filePath: string): Promise<string> {
  const matches = Array.from(body.matchAll(/!\[([^\]]*)\]\(([^)]+)\)/g))
  const replacements = await Promise.all(
    matches.map(async (match) => {
      const [, alt, src] = match
      if (!src || /^https?:\/\//i.test(src) || /^data:/i.test(src)) return null
      if (!src.startsWith('./') && !src.startsWith('../')) return null
      try {
        const dataUrl = await ipc.readAssetAsDataUrl(filePath, src)
        return { full: match[0], replacement: `![${alt}](${dataUrl})` }
      } catch (err) {
        console.error(`[anthropic-reader] failed to inline image ${src}:`, err)
        return null
      }
    })
  )

  let result = body
  for (const r of replacements) {
    if (r) result = result.split(r.full).join(r.replacement)
  }
  return result
}

function formatDate(iso: string | undefined): string {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  } catch {
    return iso
  }
}

export function AnthropicArticleReader({ filePath, onClose, theme = 'academic' }: Props) {
  const isAcademic = theme !== 'newspaper'
  const [frontmatter, setFrontmatter] = useState<Frontmatter | null>(null)
  const [body, setBody] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<{ code: string; message: string } | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    ipc
      .readMd(filePath)
      .then(async ({ frontmatter: fm, body: rawBody }) => {
        if (cancelled) return
        setFrontmatter(fm)
        setBody(await inlineLocalImages(rawBody, filePath))
      })
      .catch((err) => {
        if (cancelled) return
        setError({
          code: 'read-error',
          message: err instanceof Error ? err.message : String(err),
        })
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [filePath])

  const themeClasses = isAcademic
    ? {
        bg: 'bg-transparent',
        text: 'text-parchment',
        headerBg: 'bg-ink/40 backdrop-blur-sm',
        headerBorder: 'border-[#3d2f27]',
        title: 'text-parchment',
        meta: 'text-parchment/60',
        summaryBox: 'bg-ink/50 border-l-ember',
        summaryText: 'text-parchment/90',
        link: 'text-ember',
        skeleton: 'bg-[#3d2f27]',
      }
    : {
        bg: 'bg-white',
        text: 'text-[#1a1a1a]',
        headerBg: 'bg-white/95',
        headerBorder: 'border-[#c9c3b8]',
        title: 'text-[#1a1a1a]',
        meta: 'text-[#6b5d52]',
        summaryBox: 'bg-[#f5f2ed] border-[#c9c3b8]',
        summaryText: 'text-[#555]',
        link: 'text-ember',
        skeleton: 'bg-[#e8e4de]',
      }

  return (
    <div
      data-testid="anthropic-article-reader"
      className={`relative flex h-full overflow-hidden ${themeClasses.bg} ${themeClasses.text}`}
    >
      <div className="flex-1 flex flex-col overflow-y-auto min-w-0">
      {onClose && (
        <div className={`sticky top-0 z-10 flex items-center justify-between px-6 py-3 border-b ${themeClasses.headerBorder} ${themeClasses.headerBg} backdrop-blur`}>
          <button
            data-testid="anthropic-reader-close"
            type="button"
            onClick={onClose}
            className={`text-sm ${themeClasses.link} hover:underline`}
          >
            ← 返回列表
          </button>
        </div>
      )}

      <div className="max-w-3xl mx-auto w-full px-6 py-10 pb-24">
        {loading && (
          <div className="space-y-4">
            <div className={`h-8 w-3/4 rounded animate-pulse ${themeClasses.skeleton}`} />
            <div className={`h-4 w-1/2 rounded animate-pulse ${themeClasses.skeleton}`} />
            <div className={`h-32 rounded animate-pulse mt-6 ${themeClasses.skeleton}`} />
          </div>
        )}

        {!loading && error && (
          <AnthropicErrorMessage
            error={{ code: 'unknown', message: error.message }}
            onRetry={() => window.location.reload()}
            theme={theme}
          />
        )}

        {!loading && frontmatter && (
          <>
            <header className={`mb-8 pb-8 border-b ${themeClasses.headerBorder}`}>
              <h1 data-testid="anthropic-reader-title" className={`text-3xl font-serif leading-tight mb-4 ${themeClasses.title}`}>
                {frontmatter.title}
              </h1>
              <div className={`flex flex-wrap items-center gap-x-4 gap-y-2 text-sm ${themeClasses.meta}`}>
                {frontmatter.source_url && (
                  <span>
                    来源：
                    <button
                      type="button"
                      onClick={() => ipc.openExternal(frontmatter.source_url!)}
                      className={`${themeClasses.link} hover:underline`}
                    >
                      Anthropic Engineering
                    </button>
                  </span>
                )}
                {frontmatter.published_at && (
                  <span>发布：{formatDate(frontmatter.published_at)}</span>
                )}
                {frontmatter.imported_at && (
                  <span>导入：{formatDate(frontmatter.imported_at)}</span>
                )}
                {frontmatter.authors && frontmatter.authors.length > 0 && (
                  <span>作者：{frontmatter.authors.join(', ')}</span>
                )}
              </div>
              {frontmatter.summary && (
                <div className={`mt-6 p-5 rounded-lg border-l-4 italic leading-relaxed ${themeClasses.summaryBox} ${themeClasses.summaryText}`}>
                  {frontmatter.summary}
                </div>
              )}
            </header>

            <article className={`prose max-w-none ${isAcademic ? 'prose-invert' : ''} briefing-body-${theme}`}>
              <MarkdownRenderer
                content={body}
                fileName={frontmatter.title ?? 'article.md'}
                hideHeader
                briefingStyle={theme}
              />
            </article>
          </>
        )}
      </div>
      </div>
      {!loading && frontmatter && body && (
        <ArticleAssistantPanel
          articleType="anthropic-article"
          parentPath={filePath}
          articleTitle={frontmatter.title}
          articleContent={body}
        />
      )}
    </div>
  )
}
