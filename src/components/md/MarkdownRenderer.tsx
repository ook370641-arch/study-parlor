import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import matter from 'gray-matter'
import rehypeShiki from '@shikijs/rehype'
import './markdown.css'
import { detectDocType } from './fileType'
import { reportComponents, fableComponents, dialogueComponents } from './components'
import { warmDarkTheme } from './shiki-theme'
import type { DocType } from './fileType'

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

function getRehypePlugins() {
  try {
    return [[rehypeShiki, { theme: warmDarkTheme }]]
  } catch {
    console.warn('[MarkdownRenderer] Shiki not available, using plain code blocks')
    return []
  }
}

export function MarkdownRenderer({ content, fileName }: Props) {
  const docType = detectDocType(content, fileName)

  // Strip frontmatter before rendering
  let body = content
  try {
    const parsed = matter(content)
    body = parsed.content
  } catch {
    // keep original if parsing fails
  }

  const components = docType === 'report' ? reportComponents
    : docType === 'fable' ? fableComponents
    : dialogueComponents

  return (
    <div className={`md-body ${getDocTypeClass(docType)}`}>
      <Markdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={getRehypePlugins()}
        components={components}
      >
        {body}
      </Markdown>
    </div>
  )
}
