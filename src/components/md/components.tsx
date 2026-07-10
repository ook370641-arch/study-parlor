import { useState } from 'react'
import type { Components } from 'react-markdown'
import { ipc } from '@/lib/ipc'

// ===== Section label mapping =====
const sectionLabelMap: Record<string, string> = {
  '核心概念': '概念',
  '学习记录': '记录',
  '学习要点': '要点',
  '认知缺口': '缺口',
  '掌握检验': '检验',
  '未来发展建议': '下一步',
  '洞见': '一闪',
  '代码示例': '代码',
  '诊断阶段': '诊察',
  '学习阶段': '研习',
  '症状描述': '症状',
  '关键机制': '机制',
  '矛盾点': '矛盾',
  '有效元素': '有效',
  '待判断的问题': '待定',
  '结束': '止',
  '这个寓言真正讲的概念': '所指',
}

function extractText(node: React.ReactNode): string {
  if (typeof node === 'string') return node
  if (typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(extractText).join('')
  if (node && typeof node === 'object' && 'props' in node) {
    return extractText((node as React.ReactElement).props.children)
  }
  return ''
}

// ===== Heading with section labels =====
function Heading({ level, children }: { level: number; children: React.ReactNode }) {
  const text = extractText(children).trim()
  const label = sectionLabelMap[text]

  if (level === 2 && label) {
    return (
      <div className="md-section-header">
        <div className="md-section-label">{label}</div>
        <h2>{children}</h2>
      </div>
    )
  }

  const Tag = `h${level}` as keyof JSX.IntrinsicElements
  return <Tag>{children}</Tag>
}

// ===== Shared base components =====
const baseComponents: Components = {
  h1: ({ children }) => <h1>{children}</h1>,
  h2: ({ children }) => <Heading level={2}>{children}</Heading>,
  h3: ({ children }) => <Heading level={3}>{children}</Heading>,
  h4: ({ children }) => <Heading level={4}>{children}</Heading>,
  p: ({ children }) => <p>{children}</p>,
  ul: ({ children }) => <ul>{children}</ul>,
  ol: ({ children }) => <ol>{children}</ol>,
  li: ({ children }) => <li>{children}</li>,
  blockquote: ({ children }) => <blockquote>{children}</blockquote>,
  hr: () => <hr />,
  strong: ({ children }) => <strong>{children}</strong>,
  em: ({ children }) => <em>{children}</em>,
  a: ({ href, children }) => {
    const handleClick = (e: React.MouseEvent) => {
      if (href && /^https?:\/\//i.test(href)) {
        e.preventDefault()
        ipc.openExternal(href).catch((err) => console.error('[openExternal]', err))
      }
    }
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" onClick={handleClick}>
        {children}
      </a>
    )
  },
  table: ({ children }) => <table>{children}</table>,
  thead: ({ children }) => <thead>{children}</thead>,
  tbody: ({ children }) => <tbody>{children}</tbody>,
  tr: ({ children }) => <tr>{children}</tr>,
  th: ({ children }) => <th>{children}</th>,
  td: ({ children }) => <td>{children}</td>,
  code: ({ children, className }) => {
    const isInline = !className
    if (isInline) return <code>{children}</code>
    return (
      <pre>
        <code className={className}>{children}</code>
      </pre>
    )
  },
  img: ({ src, alt }) => <MdImage src={src} alt={alt} />,
}

// ===== Image with error placeholder =====
function MdImage({ src, alt }: { src?: string; alt?: string }) {
  const [error, setError] = useState(false)
  if (error) {
    return (
      <span
        data-testid="md-image-error"
        className="inline-block min-w-[120px] min-h-[80px] px-3 py-2 rounded border border-dashed border-current/30 text-current/50 text-sm"
      >
        图片加载失败
      </span>
    )
  }
  return (
    <img
      src={src}
      alt={alt ?? ''}
      className="max-w-full h-auto rounded my-4 block"
      onError={() => setError(true)}
      loading="lazy"
    />
  )
}

// ===== Dialogue paragraph parser =====
function DialogueParagraph({ children }: { children: React.ReactNode }) {
  const text = extractText(children)
  const match = text.match(/^(.+?)：(.+)$/)
  if (match) {
    const isUser = match[1].includes('你')
    return (
      <p className="md-dialogue-line">
        <span className={`md-dialogue-name ${isUser ? 'md-dialogue-user' : 'md-dialogue-ai'}`}>
          {match[1]}：
        </span>
        {match[2]}
      </p>
    )
  }
  return <p>{children}</p>
}

// ===== Fable paragraph parser =====
function FableParagraph({ children }: { children: React.ReactNode }) {
  const text = extractText(children)
  // Detect dialogue format: "Name: content" or "Name：content"
  const match = text.match(/^(.+?)[：:](.+)$/)
  if (match && match[1].length < 15) {
    return (
      <p className="md-dialogue-line">
        <span className="md-dialogue-name">{match[1]}：</span>
        {match[2]}
      </p>
    )
  }
  return <p>{children}</p>
}

export const reportComponents: Components = baseComponents

export const fableComponents: Components = {
  ...baseComponents,
  p: ({ children }) => <FableParagraph>{children}</FableParagraph>,
}

export const dialogueComponents: Components = {
  ...baseComponents,
  p: ({ children }) => <DialogueParagraph>{children}</DialogueParagraph>,
}

// ===== Briefing paragraph styling =====
function BriefingParagraph({ children }: { children: React.ReactNode }) {
  const text = extractText(children)
  const hasCJK = /[一-龥぀-ゟ゠-ヿ]/.test(text)
  const isNonCJK = text.length > 0 && !hasCJK
  if (isNonCJK) {
    return <p lang="en">{children}</p>
  }
  return <p>{children}</p>
}

export function briefingComponents(_style: 'academic' | 'newspaper'): Components {
  return {
    ...baseComponents,
    p: ({ children }) => <BriefingParagraph>{children}</BriefingParagraph>,
  }
}
