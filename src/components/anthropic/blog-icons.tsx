// 博客面板统一图标族（spec: 2026-09-23-blog-panel-ui-polish-design.md §5）
// 内联 SVG，stroke 1.8；颜色由 className 传入（未激活 parchment/30，激活 text-ember）
interface BlogIconProps {
  active?: boolean
  size?: number
  className?: string
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

export function BookmarkIcon({ active = false, size = 14, className }: BlogIconProps) {
  return (
    <svg data-testid="blog-icon-bookmark" width={size} height={size} viewBox="0 0 24 24"
      fill={active ? 'currentColor' : 'none'} stroke="currentColor"
      strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className}>
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

export function UnimportIcon({ size = 14, className }: BlogIconProps) {
  return (
    <svg data-testid="blog-icon-unimport" width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M22 12h-6l-2 3h-4l-2-3H2" />
      <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
      <path d="M12 3v6" />
      <path d="m9 6 3-3 3 3" />
    </svg>
  )
}
