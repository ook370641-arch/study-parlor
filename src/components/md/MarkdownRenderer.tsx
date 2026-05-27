import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import matter from 'gray-matter'
import rehypeShiki from '@shikijs/rehype'
import './markdown.css'
import { detectDocType } from './fileType'
import { reportComponents, fableComponents, dialogueComponents } from './components'
import { warmDarkTheme } from './shiki-theme'
import { ReportHeader } from './ReportHeader'
import { parseFrontmatter } from '@electron/lib/frontmatter'
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

  // Parse frontmatter and strip it before rendering
  let body = content
  let frontmatter = parseFrontmatter(content, { filename: fileName }).frontmatter
  try {
    const parsed = matter(content)
    body = parsed.content
    frontmatter = parseFrontmatter(content, { filename: fileName }).frontmatter
    console.log('[MD] frontmatter parsed, title:', frontmatter.title)
  } catch (e) {
    console.log('[MD] frontmatter parse failed, using raw content')
  }

  const components = docType === 'report' ? reportComponents
    : docType === 'fable' ? fableComponents
    : dialogueComponents

  return (
    <div className="md-container">
      <ReportHeader frontmatter={frontmatter} />
      <div className={`md-body ${getDocTypeClass(docType)}`}>
        <Markdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={getRehypePlugins()}
          components={components}
        >
          {body}
        </Markdown>
      </div>
    </div>
  )
}
