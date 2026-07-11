import React from 'react'

// Matches either a Markdown link [text](url) or a bare http(s) URL.
const LINK_PATTERN = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)|(https?:\/\/[^\s<>"{}|\\^`\[\]]+)/g

interface Props {
  item: string
  theme: 'academic' | 'newspaper'
  variant?: 'inline' | 'pill'
}

export function BriefingSourceItem({ item, theme, variant = 'inline' }: Props) {
  const inlineClass =
    theme === 'academic'
      ? 'text-ember hover:text-[#e8a07a] underline underline-offset-2'
      : 'text-[#d97757] hover:text-[#b55c3e] underline underline-offset-2'

  const pillClass =
    theme === 'academic'
      ? 'inline-flex items-center gap-1 rounded-full bg-ember/15 text-ember hover:bg-ember/25 px-2 py-0.5 text-xs'
      : 'inline-flex items-center gap-1 rounded-full bg-[#1a1a1a] text-white hover:bg-[#333] px-2 py-0.5 text-xs'

  const linkClass = variant === 'pill' ? pillClass : inlineClass
  const arrow = variant === 'pill' ? <span className="text-[10px]">↗</span> : null

  const parts: React.ReactNode[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null

  // Reset lastIndex to handle repeated renders safely.
  LINK_PATTERN.lastIndex = 0

  while ((match = LINK_PATTERN.exec(item)) !== null) {
    if (match.index > lastIndex) {
      parts.push(<span key={`text-${match.index}`}>{item.slice(lastIndex, match.index)}</span>)
    }

    const full = match[0]
    const mdText = match[1]
    const mdUrl = match[2]
    const bareUrl = match[3]
    const url = mdUrl || bareUrl
    const text = mdText || bareUrl

    parts.push(
      <a
        key={`link-${match.index}`}
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className={linkClass}
      >
        {arrow}
        {text}
      </a>
    )

    lastIndex = match.index + full.length
  }

  if (lastIndex < item.length) {
    parts.push(<span key="text-end">{item.slice(lastIndex)}</span>)
  }

  return <>{parts}</>
}
