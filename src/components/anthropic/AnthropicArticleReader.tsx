import { useEffect, useState } from 'react'
import { ipc } from '@/lib/ipc'
import { useStore } from '@/store'
import { AnthropicErrorMessage } from './AnthropicErrorMessage'
import { ArticleAssistantPanel } from '@/components/article-assistant'
import { SwapPaintingButton } from '@/components/SwapPaintingButton'
import { ArticleBodyChunks } from '@/components/article-assistant/ArticleBodyChunks'
import type { Frontmatter, BriefingTheme } from '@shared/index'

interface Props {
  filePath: string
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

export function AnthropicArticleReader({ filePath, theme = 'academic' }: Props) {
  const isAcademic = theme !== 'newspaper'
  const guideChunks = useStore((s) => s.assistantSession?.guide?.chunks ?? [])
  const terms = useStore((s) => s.assistantSession?.guide?.chunks.flatMap((c) => c.terms) ?? [])
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
        headerBorder: 'border-[#3d2f27]',
        title: 'text-parchment',
        meta: 'text-parchment/60',
        summaryBox: 'bg-ink/50 border-l-4 border-l-ember',
        summaryText: 'text-parchment/90',
        link: 'text-ember',
        pillBorder: 'border-ember/30',
        pillBg: 'bg-ember/10',
        pillHover: 'hover:bg-ember/20',
        skeleton: 'bg-[#3d2f27]',
      }
    : {
        bg: 'bg-white',
        text: 'text-[#1a1a1a]',
        headerBorder: 'border-[#c9c3b8]',
        title: 'text-[#1a1a1a]',
        meta: 'text-[#6b5d52]',
        summaryBox: 'bg-[#f5f2ed] border-l-4 border-l-ember',
        summaryText: 'text-[#555]',
        link: 'text-ember',
        pillBorder: 'border-[#1a1a1a]/20',
        pillBg: 'bg-[#f5f2ed]',
        pillHover: 'hover:bg-[#e8e4de]',
        skeleton: 'bg-[#e8e4de]',
      }

  const articleStyles = `
    .briefing-body-academic blockquote {
      border-left: 4px solid #d97757;
      background: rgba(42, 31, 26, 0.5);
      padding: 1rem 1.25rem;
      margin: 1.25rem 0;
      border-radius: 0.5rem;
      font-style: italic;
      color: rgba(232, 213, 183, 0.9);
    }
    .briefing-body-newspaper blockquote {
      border-left: 4px solid #d97757;
      background: #f5f2ed;
      padding: 1rem 1.25rem;
      margin: 1.25rem 0;
      border-radius: 0.5rem;
      font-style: italic;
      color: #555;
    }
    .briefing-body-newspaper p {
      text-indent: 2em;
    }
    .briefing-body-newspaper p:first-of-type {
      text-indent: 0;
    }
  `

  return (
    <div
      data-testid="anthropic-article-reader"
      className={`relative flex h-full overflow-hidden ${themeClasses.bg} ${themeClasses.text}`}
    >
      <div className="flex-1 flex flex-col overflow-y-auto min-w-0">
        <style dangerouslySetInnerHTML={{ __html: articleStyles }} />
        <div className="relative w-[90%] max-w-[1250px] min-w-[520px] mx-auto px-6 py-10 pb-24">
          <div className="absolute top-4 right-4 z-10">
            <SwapPaintingButton
              surface="briefing"
              data-testid="anthropic-swap-painting-button"
              className="text-parchment/70 hover:text-parchment"
            />
          </div>
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
                    <button
                      type="button"
                      onClick={() => ipc.openExternal(frontmatter.source_url!)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs border transition-colors ${themeClasses.pillBorder} ${themeClasses.pillBg} ${themeClasses.link} ${themeClasses.pillHover}`}
                    >
                      <span>Anthropic Engineering</span>
                      <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M7 17L17 7M17 7H9M17 7V15" />
                      </svg>
                    </button>
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
                  <div className={`mt-6 p-5 rounded-lg italic leading-relaxed ${themeClasses.summaryBox} ${themeClasses.summaryText}`}>
                    {frontmatter.summary}
                  </div>
                )}
              </header>

              <article className={`prose max-w-none ${isAcademic ? 'prose-invert' : ''} briefing-body-${theme}`}>
                <ArticleBodyChunks
                  content={body}
                  chunks={guideChunks}
                  fileName={frontmatter.title ?? 'article.md'}
                  theme={theme}
                  terms={terms}
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
          autoGenerateGuide
          theme={theme}
        />
      )}
    </div>
  )
}
