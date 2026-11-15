import type { CSSProperties, ReactNode } from 'react'

export function AlbumWall({ domain, testId, toolbar, children, className = '', style }: {
  domain: 'blog' | 'notes' | 'writing' | 'repository'
  testId: string
  toolbar?: ReactNode
  children: ReactNode
  className?: string
  style?: CSSProperties
}) {
  return (
    <div data-testid={testId} data-album-wall={domain} className={`h-full overflow-y-auto px-8 py-6 ${className}`} style={style}>
      {toolbar}
      {children}
    </div>
  )
}

export function AlbumGrid({ children, minWidth = 170, testId, order }: {
  children: ReactNode
  minWidth?: number
  testId?: string
  order?: string
}) {
  return (
    <div
      data-testid={testId}
      data-order={order}
      className="grid gap-5"
      style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${minWidth}px, 1fr))` }}
    >
      {children}
    </div>
  )
}
