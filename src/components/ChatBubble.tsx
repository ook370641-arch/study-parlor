import type { Message } from '@shared/index'
import type { Components } from 'react-markdown'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

const chatComponents: Components = {
  p: ({ children }) => <p className="m-0 my-1">{children}</p>,
  strong: ({ children }) => <strong className="text-parchment/95 font-semibold">{children}</strong>,
  em: ({ children }) => <em className="italic text-parchment/70">{children}</em>,
  table: ({ children }) => <table className="w-full border-collapse my-2 text-sm">{children}</table>,
  thead: ({ children }) => <thead className="bg-ember/10">{children}</thead>,
  th: ({ children }) => (
    <th className="px-2.5 py-2 text-left border-b border-ember/30 text-ember text-xs uppercase tracking-wider">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="px-2.5 py-1.5 border-b border-slate/15 text-parchment/75">{children}</td>
  ),
  tr: ({ children }) => <tr>{children}</tr>,
  tbody: ({ children }) => <tbody>{children}</tbody>,
  blockquote: ({ children }) => (
    <blockquote className="my-3 px-3.5 py-2.5 border-l-[3px] border-ember/50 bg-ember/5 rounded-r">
      {children}
    </blockquote>
  ),
  code: ({ children, className }) => {
    const isInline = !className
    if (isInline)
      return (
        <code className="font-mono text-[13px] bg-[rgba(42,31,26,0.8)] px-1 py-0.5 rounded text-ember">
          {children}
        </code>
      )
    return (
      <pre className="bg-[#15100d] border border-[rgba(148,137,121,0.12)] rounded p-3 my-2 overflow-auto">
        <code className="bg-transparent p-0 text-inherit font-mono text-[13px] leading-relaxed">
          {children}
        </code>
      </pre>
    )
  },
  ul: ({ children }) => <ul className="my-2 pl-5">{children}</ul>,
  ol: ({ children }) => <ol className="my-2 pl-5">{children}</ol>,
  li: ({ children }) => <li className="my-1">{children}</li>,
  hr: () => <hr className="border-none my-4 h-px bg-slate/20" />,
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-ember underline decoration-ember/40 hover:text-[#e8a07a]"
    >
      {children}
    </a>
  ),
  h1: ({ children }) => (
    <h1 className="font-mono text-lg text-parchment mb-4 pb-2 border-b border-ember/30">{children}</h1>
  ),
  h2: ({ children }) => <h2 className="font-mono text-base text-parchment mt-6 mb-2 font-normal">{children}</h2>,
  h3: ({ children }) => <h3 className="font-mono text-sm text-ember mt-4 mb-2 font-normal">{children}</h3>,
  h4: ({ children }) => (
    <h4 className="font-mono text-[13px] text-ember/80 mt-3 mb-1.5 font-normal">{children}</h4>
  ),
}

export function ChatBubble({ msg }: { msg: Message }) {
  if (msg.role === 'system') return null
  const isUser = msg.role === 'user'
  const content = msg.content.trim()
  if (!content) return null

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} my-3`}>
      <div
        className={`max-w-[70%] px-4 py-3 rounded-md leading-relaxed
        ${isUser
          ? 'bg-ember/20 border border-ember/40 whitespace-pre-wrap'
          : 'bg-ink/65 backdrop-blur-md border border-slate/40'}`}
      >
        {isUser ? (
          content
        ) : (
          <Markdown remarkPlugins={[remarkGfm]} components={chatComponents}>
            {content}
          </Markdown>
        )}
      </div>
    </div>
  )
}
