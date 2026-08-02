import type { Components } from 'react-markdown'

/**
 * 助手消息（旁注 / 写作助手）共用的 react-markdown 组件映射。
 * 单例：映射对象无状态，避免每条消息渲染时重建。
 * 放在 src/lib 而非组件目录 —— 组件文件只导出组件（ui-styling §10）。
 */
export const assistantMdComponents: Components = (() => {
  const textMain = 'text-parchment/90'
  const textMuted = 'text-parchment/60'
  const accent = 'text-ember'
  const accentLight = 'border-ember/30 bg-ember/5'
  const codeBg = 'bg-[rgba(42,31,26,0.8)]'
  const preBg = 'bg-[#15100d] border-[rgba(148,137,121,0.12)]'
  const linkHover = 'hover:text-[#e8a07a]'

  return {
    p: ({ children }) => <p className={`m-0 my-1 ${textMain}`}>{children}</p>,
    strong: ({ children }) => <strong className={`${textMain} font-semibold`}>{children}</strong>,
    em: ({ children }) => <em className={`italic ${textMuted}`}>{children}</em>,
    blockquote: ({ children }) => (
      <blockquote className={`my-2 px-3 py-2 border-l-[3px] ${accentLight} rounded-r text-sm`}>
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
        <pre className={`${preBg} border rounded p-2.5 my-2 overflow-auto`}>
          <code className="bg-transparent p-0 text-inherit font-mono text-[12px] leading-relaxed">
            {children}
          </code>
        </pre>
      )
    },
    ul: ({ children }) => <ul className={`my-2 pl-5 ${textMain}`}>{children}</ul>,
    ol: ({ children }) => <ol className={`my-2 pl-5 ${textMain}`}>{children}</ol>,
    li: ({ children }) => <li className={`my-0.5 ${textMain}`}>{children}</li>,
    hr: () => <hr className="border-none my-3 h-px bg-slate/20" />,
    a: ({ href, children }) => (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={`${accent} underline decoration-ember/30 ${linkHover}`}
      >
        {children}
      </a>
    ),
    h1: ({ children }) => <h1 className={`font-mono text-sm ${textMain} mb-3 pb-1.5 border-b border-ember/20`}>{children}</h1>,
    h2: ({ children }) => <h2 className={`font-mono text-[13px] ${textMain} mt-5 mb-2 font-normal`}>{children}</h2>,
    h3: ({ children }) => <h3 className={`font-mono text-xs ${accent} mt-4 mb-1.5 font-normal`}>{children}</h3>,
    table: ({ children }) => <table className="w-full border-collapse my-2 text-xs">{children}</table>,
    thead: ({ children }) => <thead className="bg-ember/5">{children}</thead>,
    th: ({ children }) => (
      <th className={`px-2 py-1.5 text-left border-b border-slate/15 ${accent} text-[11px]`}>
        {children}
      </th>
    ),
    td: ({ children }) => (
      <td className={`px-2 py-1 border-b border-slate/10 ${textMain}`}>{children}</td>
    ),
    tr: ({ children }) => <tr>{children}</tr>,
    tbody: ({ children }) => <tbody>{children}</tbody>,
  }
})()
