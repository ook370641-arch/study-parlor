import React from 'react'
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

export function MarkdownRenderer({ content, fileName }: Props) {
  console.log('[MD] render called, fileName:', fileName, 'content length:', content?.length)

  const docType = detectDocType(content, fileName)
  console.log('[MD] detected docType:', docType)

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

  try {
    const parsed = matter(safeContent)
    body = parsed.content
    console.log('[MD] matter parsed, body length:', body.length)
  } catch (e) {
    console.error('[MD] matter() parse failed:', e)
    body = safeContent
  }

  try {
    const parsedFm = parseFrontmatter(safeContent, { filename: fileName })
    frontmatter = parsedFm.frontmatter
    console.log('[MD] parseFrontmatter ok, title:', frontmatter.title, 'type:', frontmatter.type)
  } catch (e) {
    console.error('[MD] parseFrontmatter failed:', e)
    // Keep fallback frontmatter
  }

  const components = docType === 'report' ? reportComponents
    : docType === 'fable' ? fableComponents
    : dialogueComponents

  return (
    <div className="md-container">
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
