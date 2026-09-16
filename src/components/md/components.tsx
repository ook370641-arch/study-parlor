import { useState, useEffect, useRef } from 'react'
import type { Components } from 'react-markdown'
import type { Element } from 'hast'
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
    if (href?.toLowerCase().startsWith('file://')) {
      return <span className="text-current/70">{children}</span>
    }
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
  useEffect(() => {
    setError(false)
  }, [src])
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
      data-testid="md-image"
      src={src}
      alt={alt ?? ''}
      className="max-w-full h-auto rounded my-4 block"
      onError={() => setError(true)}
      loading="lazy"
    />
  )
}

// ===== Code block with copy bar (briefing readers only) =====
function MdCodeBlock({ className, children }: { className?: string; children: React.ReactNode }) {
  const [copied, setCopied] = useState(false)
  const timerRef = useRef<number | null>(null)
  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current) }, [])
  const lang = /language-(\w+)/.exec(className ?? '')?.[1] ?? null
  const handleCopy = async () => {
    try {
      // remark fenced code 的文本节点自带尾部换行，复制时剥掉
      await navigator.clipboard.writeText(extractText(children).replace(/\n$/, ''))
      setCopied(true)
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = window.setTimeout(() => setCopied(false), 1500)
    } catch (err) {
      console.error('[md-codeblock] copy failed:', err)
    }
  }
  return (
    <div className="md-codeblock">
      <div className="md-codeblock-bar">
        {lang && <span className="md-codeblock-lang">{lang}</span>}
        <button
          type="button"
          data-testid="md-codeblock-copy"
          className="md-codeblock-copy"
          onClick={() => void handleCopy()}
        >
          {copied ? '已复制 ✓' : '复制'}
        </button>
      </div>
      <pre>{children}</pre>
    </div>
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
    // inline code 与块级 code 都先渲染成裸 <code>；块级的外壳由下方的 pre 接管
    code: ({ children, className }) => <code className={className}>{children}</code>,
    // fenced code 的默认结构是 pre > code（无语言时 code 无 className，无法在 code
    // 层区分 inline/block），所以在 pre 层接管整块并渲染 MdCodeBlock
    pre: ({ children, node }) => {
      const codeEl = node?.children.find(
        (c): c is Element => c.type === 'element' && (c as Element).tagName === 'code'
      )
      const cls = codeEl?.properties?.className
      const className = Array.isArray(cls) && cls.length > 0 ? String(cls[0]) : undefined
      return <MdCodeBlock className={className}>{children}</MdCodeBlock>
    },
  }
}
