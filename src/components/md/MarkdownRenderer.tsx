import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import matter from 'gray-matter'
import './markdown.css'
import { detectDocType } from './fileType'
import { reportComponents, fableComponents, dialogueComponents } from './components'
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
      <Markdown remarkPlugins={[remarkGfm]} components={components}>
        {body}
      </Markdown>
    </div>
  )
}
