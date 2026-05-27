import React, { useState, useEffect } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import matter from 'gray-matter'
import './markdown.css'
import { detectDocType } from './fileType'
import { reportComponents, fableComponents, dialogueComponents } from './components'
import { ReportHeader } from './ReportHeader'
import { parseFrontmatter } from '@electron/lib/frontmatter'
import type { DocType } from './fileType'
import type { Frontmatter } from '@shared/index'

interface Props {
  content: string
  fileName: string
}

function getDocTypeClass(docType: DocType): string {
  switch (docType) {
    case 'report': return 'md-report'
    case 'fable': return 'md-fable'
    case 'dialogue': return 'md-dialogue'
  }
}

class MdErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { hasError: false, error: null }
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error }
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[MD ErrorBoundary]', error.message, info.componentStack)
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ color: '#d97757', padding: '16px' }}>
          <p>渲染失败: {this.state.error?.message}</p>
          <pre style={{ fontSize: '11px', whiteSpace: 'pre-wrap', color: '#a09080' }}>
            {this.state.error?.stack}
          </pre>
        </div>
      )
    }
    return this.props.children
  }
}

/**
 * Force-strip frontmatter using regex.
 * Matches --- at start, any content, then --- followed by newline.
 */
function forceStripFrontmatter(raw: string): { body: string; stripped: boolean } {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/)
  if (match && match[0]) {
    return { body: raw.slice(match[0].length), stripped: true }
  }
  return { body: raw, stripped: false }
}

export function MarkdownRenderer({ content, fileName }: Props) {
  const [diag, setDiag] = useState<string>('')

  // Defensive: ensure content is a string
  const safeContent = typeof content === 'string' ? content : String(content ?? '')

  // Parse frontmatter with full error isolation
  let body = safeContent
  let frontmatter: Frontmatter = {
    title: fileName?.replace(/\.md$/, '') || 'untitled',
    created: new Date().toISOString(),
    review_count: 0,
    difficulty: 'mid',
    tags: [],
  }

  // Structured frontmatter parsing (for ReportHeader)
  try {
    const parsedFm = parseFrontmatter(safeContent, { filename: fileName })
    frontmatter = parsedFm.frontmatter
  } catch (e) {
    console.error('[MD] parseFrontmatter failed:', e)
  }

  // Body extraction: always force-strip, matter() as extra
  const forceResult = forceStripFrontmatter(safeContent)
  if (forceResult.stripped) {
    body = forceResult.body
  }

  // Also try matter() — if it gives a shorter body, use that
  try {
    const parsed = matter(safeContent)
    if (parsed.content.length < body.length) {
      body = parsed.content
    }
  } catch (e) {
    console.error('[MD] matter() failed:', e)
  }

  // Diagnostic: check if body still contains frontmatter-like content
  const stillHasFm = /^title\s*:/m.test(body) || /^type\s*:/m.test(body)
  const docType = detectDocType(content, fileName)

  useEffect(() => {
    const lines = [
      `file: ${fileName}`,
      `docType: ${docType}`,
      `content length: ${safeContent.length}`,
      `body length: ${body.length}`,
      `force stripped: ${forceResult.stripped}`,
      `still has frontmatter: ${stillHasFm}`,
      `body starts: ${JSON.stringify(body.slice(0, 60))}`,
    ]
    setDiag(lines.join(' | '))
    console.log('[MD]', lines.join(' | '))
  }, [safeContent, fileName])

  const components = docType === 'report' ? reportComponents
    : docType === 'fable' ? fableComponents
    : dialogueComponents

  return (
    <div className="md-container">
      {/* Dev diagnostic — remove before release */}
      {stillHasFm && (
        <div style={{
          background: '#8a3a3a',
          color: '#e8d5b7',
          padding: '8px 12px',
          fontSize: '11px',
          fontFamily: 'monospace',
          marginBottom: '8px',
          borderRadius: '2px',
        }}>
          <strong>DIAGNOSTIC:</strong> {diag}
        </div>
      )}

      <MdErrorBoundary>
        <ReportHeader frontmatter={frontmatter} />
      </MdErrorBoundary>
      <div className={`md-body ${getDocTypeClass(docType)}`}>
        <MdErrorBoundary>
          <Markdown
            remarkPlugins={[remarkGfm]}
            components={components}
          >
            {body}
          </Markdown>
        </MdErrorBoundary>
      </div>
    </div>
  )
}
