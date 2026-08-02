import type { Components } from 'react-markdown'
import { ANNOTATION_NOTE_SIZES, ANNOTATION_UI_SIZES } from '@/lib/briefing-font-size'
import type { BriefingFontSize } from '@shared/index'

/**
 * 助手消息（旁注 / 写作助手）共用的 react-markdown 组件映射工厂。
 * 根据 briefingFontSize 动态生成字号，使旁注面板随全局字体调配。
 */
export function createAssistantMdComponents(fontSize: BriefingFontSize): Components {
  const bodySize = ANNOTATION_NOTE_SIZES[fontSize]
  const uiSize = ANNOTATION_UI_SIZES[fontSize]
  // 代码块比正文略小
  const bodyPx = parseInt(bodySize)
  const codeSize = `${bodyPx - 2}px`
  const codeBlockSize = `${bodyPx - 3}px`

  const textMain = 'text-parchment/90'
  const textMuted = 'text-parchment/60'
  const accent = 'text-ember'
  const accentLight = 'border-ember/30 bg-ember/5'
  const codeBg = 'bg-[rgba(42,31,26,0.8)]'
  const preBg = 'bg-[#15100d] border-[rgba(148,137,121,0.12)]'
  const linkHover = 'hover:text-[#e8a07a]'

  return {
    p: ({ children }) => <p className={`m-0 my-1 ${textMain}`} style={{ fontSize: bodySize }}>{children}</p>,
    strong: ({ children }) => <strong className={`${textMain} font-semibold`} style={{ fontSize: bodySize }}>{children}</strong>,
    em: ({ children }) => <em className={`italic ${textMuted}`} style={{ fontSize: bodySize }}>{children}</em>,
    blockquote: ({ children }) => (
      <blockquote className={`my-2 px-3 py-2 border-l-[3px] ${accentLight} rounded-r`} style={{ fontSize: bodySize }}>
        {children}
      </blockquote>
    ),
    code: ({ children, className }) => {
      const isInline = !className
      if (isInline)
        return (
          <code className={`font-mono ${codeBg} px-1 py-0.5 rounded ${accent}`} style={{ fontSize: codeSize }}>
            {children}
          </code>
        )
      return (
        <pre className={`${preBg} border rounded p-2.5 my-2 overflow-auto`}>
          <code className="bg-transparent p-0 text-inherit font-mono leading-relaxed" style={{ fontSize: codeBlockSize }}>
            {children}
          </code>
        </pre>
      )
    },
    ul: ({ children }) => <ul className={`my-2 pl-5 ${textMain}`} style={{ fontSize: bodySize }}>{children}</ul>,
    ol: ({ children }) => <ol className={`my-2 pl-5 ${textMain}`} style={{ fontSize: bodySize }}>{children}</ol>,
    li: ({ children }) => <li className={`my-0.5 ${textMain}`} style={{ fontSize: bodySize }}>{children}</li>,
    hr: () => <hr className="border-none my-3 h-px bg-slate/20" />,
    a: ({ href, children }) => (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={`${accent} underline decoration-ember/30 ${linkHover}`}
        style={{ fontSize: bodySize }}
      >
        {children}
      </a>
    ),
    h1: ({ children }) => <h1 className={`font-mono ${textMain} mb-3 pb-1.5 border-b border-ember/20`} style={{ fontSize: bodySize }}>{children}</h1>,
    h2: ({ children }) => <h2 className={`font-mono ${textMain} mt-5 mb-2 font-normal`} style={{ fontSize: codeSize }}>{children}</h2>,
    h3: ({ children }) => <h3 className={`font-mono ${accent} mt-4 mb-1.5 font-normal`} style={{ fontSize: uiSize.small }}>{children}</h3>,
    table: ({ children }) => <table className="w-full border-collapse my-2" style={{ fontSize: uiSize.small }}>{children}</table>,
    thead: ({ children }) => <thead className="bg-ember/5">{children}</thead>,
    th: ({ children }) => (
      <th className={`px-2 py-1.5 text-left border-b border-slate/15 ${accent}`} style={{ fontSize: uiSize.small }}>
        {children}
      </th>
    ),
    td: ({ children }) => (
      <td className={`px-2 py-1 border-b border-slate/10 ${textMain}`} style={{ fontSize: uiSize.small }}>{children}</td>
    ),
    tr: ({ children }) => <tr>{children}</tr>,
    tbody: ({ children }) => <tbody>{children}</tbody>,
  }
}

/**
 * 静态回退：无 fontSize 参数时使用 base 档。
 * 仅用于无需响应字体调配的旧路径。
 */
export const assistantMdComponents: Components = createAssistantMdComponents('base')
