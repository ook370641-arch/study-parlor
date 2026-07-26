import type { Message } from '@shared/index'
import type { BriefingTheme } from '@shared/index'
import type { Components } from 'react-markdown'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

function makeChatComponents(isAcademic: boolean): Components {
  const textMain = isAcademic ? 'text-parchment' : 'text-[#1a1a1a]'
  const textMuted = isAcademic ? 'text-parchment/70' : 'text-[#555]'
  const textSubtle = isAcademic ? 'text-parchment/75' : 'text-[#444]'
  const accent = isAcademic ? 'text-ember' : 'text-[#1a1a1a]'
  const accentBg = isAcademic ? 'bg-ember/10' : 'bg-[#1a1a1a]/5'
  const accentLight = isAcademic ? 'border-ember/50 bg-ember/5' : 'border-[#1a1a1a]/15 bg-[#1a1a1a]/3'
  const codeBg = isAcademic ? 'bg-[rgba(42,31,26,0.8)]' : 'bg-[#f5f5f0]'
  const preBg = isAcademic ? 'bg-[#15100d] border-[rgba(148,137,121,0.12)]' : 'bg-white border-[#1a1a1a]/10'
  const hrBorder = isAcademic ? 'bg-slate/20' : 'bg-[#1a1a1a]/10'
  const linkHover = isAcademic ? 'hover:text-[#e8a07a]' : 'hover:text-[#1a1a1a]'
  const thBorder = isAcademic ? 'border-slate/15' : 'border-[#1a1a1a]/10'
  const h1Border = isAcademic ? 'border-ember/30' : 'border-[#1a1a1a]/15'
  const strongText = isAcademic ? 'text-parchment/95' : 'text-[#1a1a1a]'

  return {
    p: ({ children }) => <p className={`m-0 my-1 ${textMain}`}>{children}</p>,
    strong: ({ children }) => <strong className={`${strongText} font-semibold`}>{children}</strong>,
    em: ({ children }) => <em className={`italic ${textMuted}`}>{children}</em>,
    table: ({ children }) => <table className="w-full border-collapse my-2 text-sm">{children}</table>,
    thead: ({ children }) => <thead className={accentBg}>{children}</thead>,
    th: ({ children }) => (
      <th className={`px-2.5 py-2 text-left border-b ${thBorder} ${accent} text-xs uppercase tracking-wider`}>
        {children}
      </th>
    ),
    td: ({ children }) => (
      <td className={`px-2.5 py-1.5 border-b ${thBorder} ${textSubtle}`}>{children}</td>
    ),
    tr: ({ children }) => <tr className={textSubtle}>{children}</tr>,
    tbody: ({ children }) => <tbody>{children}</tbody>,
    blockquote: ({ children }) => (
      <blockquote className={`my-3 px-3.5 py-2.5 border-l-[3px] ${accentLight} rounded-r`}>
        {children}
      </blockquote>
    ),
    code: ({ children, className }) => {
      const isInline = !className
      if (isInline)
        return (
          <code className={`font-mono text-[13px] ${codeBg} px-1 py-0.5 rounded ${accent}`}>
            {children}
          </code>
        )
      return (
        <pre className={`${preBg} rounded p-3 my-2 overflow-auto`}>
          <code className="bg-transparent p-0 text-inherit font-mono text-[13px] leading-relaxed">
            {children}
          </code>
        </pre>
      )
    },
    ul: ({ children }) => <ul className={`my-2 pl-5 ${textMain}`}>{children}</ul>,
    ol: ({ children }) => <ol className={`my-2 pl-5 ${textMain}`}>{children}</ol>,
    li: ({ children }) => <li className={`my-1 ${textMain}`}>{children}</li>,
    hr: () => <hr className={`border-none my-4 h-px ${hrBorder}`} />,
    a: ({ href, children }) => (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={`${accent} underline ${isAcademic ? 'decoration-ember/40' : 'decoration-[#1a1a1a]/30'} ${linkHover}`}
      >
        {children}
      </a>
    ),
    h1: ({ children }) => (
      <h1 className={`font-mono text-lg ${textMain} mb-4 pb-2 border-b ${h1Border}`}>{children}</h1>
    ),
    h2: ({ children }) => <h2 className={`font-mono text-base ${textMain} mt-6 mb-2 font-normal`}>{children}</h2>,
    h3: ({ children }) => <h3 className={`font-mono text-sm ${accent} mt-4 mb-2 font-normal`}>{children}</h3>,
    h4: ({ children }) => (
      <h4 className={`font-mono text-[13px] ${isAcademic ? 'text-ember/80' : 'text-[#1a1a1a]'} mt-3 mb-1.5 font-normal`}>{children}</h4>
    ),
  }
}

export function ChatBubble({ msg, theme }: { msg: Message; theme?: BriefingTheme }) {
  if (msg.role === 'system') return null
  const isUser = msg.role === 'user'
  const content = msg.content.trim()
  if (!content) return null

  const isAcademic = theme !== 'newspaper'

  const userBubbleCls = isAcademic
    ? 'bg-ember/20 border border-ember/40 whitespace-pre-wrap'
    : 'bg-white border border-[#1a1a1a]/12 text-[#1a1a1a] whitespace-pre-wrap'

  const assistantBubbleCls = isAcademic
    ? 'bg-ink/65 backdrop-blur-md border border-slate/40'
    : 'bg-white border border-[#1a1a1a]/12 text-[#1a1a1a]'

  return (
    <div data-testid={isUser ? 'user-message' : 'assistant-message'} className={`flex ${isUser ? 'justify-end' : 'justify-start'} my-3`}>
      <div
        className={`max-w-[70%] px-4 py-3 rounded-md leading-relaxed ${isUser ? userBubbleCls : assistantBubbleCls}`}
      >
        {isUser ? (
          content
        ) : (
          <Markdown remarkPlugins={[remarkGfm]} components={makeChatComponents(isAcademic)}>
            {content}
          </Markdown>
        )}
      </div>
    </div>
  )
}
