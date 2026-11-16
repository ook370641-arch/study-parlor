import type { KeyboardEvent, MouseEvent } from 'react'
import type { BriefingTheme } from '@shared/index'

// 博客面板统一图标族（spec: 2026-09-23-blog-panel-ui-polish-design.md §5）
// 内联 SVG，stroke 1.8；颜色由 className 传入（未激活 parchment/30，激活 text-ember）
interface BlogIconProps {
  active?: boolean
  size?: number
  className?: string
  title?: string
}

export function BookIcon({ active = false, size = 14, className }: BlogIconProps) {
  return (
    <svg data-testid="blog-icon-book" width={size} height={size} viewBox="0 0 24 24"
      fill={active ? 'currentColor' : 'none'} stroke="currentColor"
      strokeWidth={active ? 1.2 : 1.8} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 7v14" fill="none" />
      <path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"
        opacity={active ? 0.4 : 1} />
    </svg>
  )
}

export function BookmarkIcon({ active = false, size = 14, className, title }: BlogIconProps) {
  return (
    <svg data-testid="blog-icon-bookmark" width={size} height={size} viewBox="0 0 24 24"
      fill={active ? 'currentColor' : 'none'} stroke="currentColor"
      strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className}>
      {title && <title>{title}</title>}
      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
    </svg>
  )
}

export function HistoryIcon({ size = 14, className }: BlogIconProps) {
  return (
    <svg data-testid="blog-icon-history" width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
      <path d="M12 7v5l4 2" />
    </svg>
  )
}

export function RefreshIcon({ size = 14, className }: BlogIconProps) {
  return (
    <svg data-testid="blog-icon-refresh" width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
      <path d="M3 21v-5h5" />
    </svg>
  )
}

export function TrashIcon({ size = 14, className }: BlogIconProps) {
  return (
    <svg data-testid="blog-icon-trash" width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M3 6h18" />
      <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
      <path d="m19 6-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  )
}

export function BlogDeleteButton({ theme, testId, title, onClick, className = '' }: {
  theme: BriefingTheme
  testId: string
  title: string
  onClick: () => void
  className?: string
}) {
  const isAcademic = theme !== 'newspaper'
  const handleClick = (event: MouseEvent<HTMLSpanElement>) => {
    event.stopPropagation()
    event.preventDefault()
    onClick()
  }
  const handleKeyDown = (event: KeyboardEvent<HTMLSpanElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.stopPropagation()
    event.preventDefault()
    onClick()
  }
  return (
    <span
      data-testid={testId}
      role="button"
      tabIndex={0}
      aria-label={title}
      title={title}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className={`inline-flex h-7 w-7 shrink-0 cursor-pointer select-none items-center justify-center rounded-md border transition-colors ${
        isAcademic
          ? 'border-red-400/30 bg-red-400/10 text-red-300 hover:border-red-300/60 hover:bg-red-400/20 hover:text-red-200'
          : 'border-red-700/25 bg-red-700/5 text-red-700/70 hover:border-red-700/50 hover:bg-red-700/15 hover:text-red-700'
      } ${className}`}
    >
      <TrashIcon size={15} />
    </span>
  )
}
