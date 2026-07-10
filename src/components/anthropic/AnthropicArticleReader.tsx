import { useEffect, useState } from 'react'
import { ipc } from '@/lib/ipc'
import { MarkdownRenderer } from '@/components/md/MarkdownRenderer'
import { AnthropicErrorMessage } from './AnthropicErrorMessage'
import type { Frontmatter } from '@shared/index'

interface Props {
  filePath: string
  onClose?: () => void
  sidebarToggle?: React.ReactNode
}

function toAbsoluteAssetUrl(filePath: string, src: string): string {
  if (!src) return src
  if (/^https?:\/\//i.test(src) || /^file:/i.test(src)) return src
  const normalizedFile = filePath.replace(/\\/g, '/')
  const dir = normalizedFile.replace(/\/[^/]*$/, '')
  let relative = src
  if (relative.startsWith('./')) relative = relative.slice(2)
  const absolute = `${dir}/${relative}`
  const encoded = absolute
    .split('/')
    .map((seg) => encodeURIComponent(seg).replace(/%2F/g, '/'))
    .join('/')
  return `file:///${encoded}`
}

function rewriteLocalImagePaths(body: string, filePath: string): string {
  return body.replace(
    /!\[([^\]]*)\]\(([^)]+)\)/g,
    (_full, alt: string, src: string) => {
      return `![${alt}](${toAbsoluteAssetUrl(filePath, src)})`
    }
  )
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

export function AnthropicArticleReader({ filePath, onClose, sidebarToggle }: Props) {
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
      .then(({ frontmatter: fm, body: rawBody }) => {
        if (cancelled) return
        setFrontmatter(fm)
        setBody(rewriteLocalImagePaths(rawBody, filePath))
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

  return (
    <div
      data-testid="anthropic-article-reader"
      className="relative flex flex-col h-full bg-[#0d0d0d] text-[#e6e6e6] overflow-y-auto"
    >
      {onClose && (
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-3 border-b border-[#333] bg-[#0d0d0d]/95 backdrop-blur">
          <button
            data-testid="anthropic-reader-close"
            type="button"
            onClick={onClose}
            className="text-sm text-[#d97757] hover:underline"
          >
            ← 返回列表
          </button>
          {sidebarToggle}
        </div>
      )}

      <div className="max-w-3xl mx-auto w-full px-6 py-10 pb-24">
        {loading && (
          <div className="space-y-4">
            <div className="h-8 w-3/4 rounded bg-[#1a1a1a] animate-pulse" />
            <div className="h-4 w-1/2 rounded bg-[#1a1a1a] animate-pulse" />
            <div className="h-32 rounded bg-[#1a1a1a] animate-pulse mt-6" />
          </div>
        )}

        {!loading && error && (
          <AnthropicErrorMessage
            error={{ code: 'unknown', message: error.message }}
            onRetry={() => window.location.reload()}
          />
        )}

        {!loading && frontmatter && (
          <>
            <header className="mb-8 pb-8 border-b border-[#333]">
              <h1 data-testid="anthropic-reader-title" className="text-3xl font-serif leading-tight text-white mb-4">
                {frontmatter.title}
              </h1>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-[#999]">
                {frontmatter.source_url && (
                  <span>
                    来源：
                    <button
                      type="button"
                      onClick={() => ipc.openExternal(frontmatter.source_url!)}
                      className="text-[#d97757] hover:underline"
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
                <div className="mt-6 p-5 rounded-lg bg-[#1a1a1a] border-l-4 border-[#d97757] text-[#ccc] italic leading-relaxed">
                  {frontmatter.summary}
                </div>
              )}
            </header>

            <article className="prose prose-invert max-w-none">
              <MarkdownRenderer
                content={body}
                fileName={frontmatter.title ?? 'article.md'}
                hideHeader
              />
            </article>
          </>
        )}
      </div>
    </div>
  )
}
