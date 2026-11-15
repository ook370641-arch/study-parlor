import type { CSSProperties, DragEvent, ReactNode } from 'react'

export function AlbumCard({
  testId, title, onOpen, fallback, cover, topLeft, topRight, meta, hoverMeta,
  className = '', titleClassName = '', footerClassName = 'p-3', scrimStyle,
  style, onDragOver, onDrop,
}: {
  testId: string
  title: string
  onOpen: () => void
  fallback?: ReactNode
  cover?: ReactNode
  topLeft?: ReactNode
  topRight?: ReactNode
  meta?: ReactNode
  hoverMeta?: ReactNode
  className?: string
  titleClassName?: string
  footerClassName?: string
  scrimStyle?: CSSProperties
  style?: CSSProperties
  onDragOver?: (event: DragEvent<HTMLElement>) => void
  onDrop?: (event: DragEvent<HTMLElement>) => void
}) {
  return (
    <article
      data-testid={testId}
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={event => {
        if (event.target !== event.currentTarget || (event.key !== 'Enter' && event.key !== ' ')) return
        event.preventDefault()
        onOpen()
      }}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={`group relative cursor-pointer overflow-hidden rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ember/70 ${className}`}
      style={{ aspectRatio: '3/4', boxShadow: '0 6px 16px rgba(0,0,0,.35)', ...style }}
    >
      {fallback}
      {cover}
      <div className="absolute inset-0" style={scrimStyle ?? { background: 'linear-gradient(180deg, rgba(20,12,8,0) 32%, rgba(20,12,8,.94))' }} />
      {topLeft}
      {topRight}
      <div className={`absolute inset-x-0 bottom-0 text-[#f0e2c8] ${footerClassName}`}>
        <div className={`leading-snug ${titleClassName}`}>{title}</div>
        {meta}
        {hoverMeta && <div className="mt-1 text-[0.833em] text-parchment/70 opacity-0 transition-opacity group-hover:opacity-100">{hoverMeta}</div>}
      </div>
    </article>
  )
}
