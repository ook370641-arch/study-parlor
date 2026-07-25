import { useEffect, useMemo, useState } from 'react'
import { useStore } from '@/store'
import { ipc } from '@/lib/ipc'
import { computeSealedChunks } from '@/lib/spine-seals'
import type { ArticleAssistantChunk } from '@shared/index'

interface Props {
  content: string
  chunks: ArticleAssistantChunk[]
  filePath: string
  visitedMax: number | null
  onNavigate?: (index: number) => void
}

export function InternalizationSpine({ content, chunks, filePath, visitedMax, onNavigate }: Props) {
  const setAssistantActiveChunk = useStore((s) => s.setAssistantActiveChunk)
  const [sealed, setSealed] = useState<Set<number>>(new Set())

  const headings = useMemo(() => {
    if (chunks.length > 0) return chunks.map((c) => c.heading)
    return [...content.matchAll(/^##\s+(.+)$/gm)].map((m) => m[1].trim())
  }, [content, chunks])

  useEffect(() => {
    let alive = true
    ipc.annotationsRead(filePath)
      .then((list) => { if (alive) setSealed(computeSealedChunks(content, chunks, list)) })
      .catch(() => {})
    return () => { alive = false }
  }, [filePath, content, chunks])

  if (headings.length === 0) return null

  return (
    <div data-testid="internalization-spine" className="internalization-spine" aria-hidden="true">
      {headings.map((_h, i) => {
        const state = sealed.has(i) ? 'sealed' : visitedMax !== null && i <= visitedMax ? 'visited' : 'unvisited'
        return (
          <button
            key={i}
            type="button"
            data-testid={`spine-node-${i}`}
            data-state={state}
            className={`spine-node spine-${state}`}
            style={{ top: `${(i + 1) * 48}px` }}
            onMouseEnter={() => setAssistantActiveChunk(i)}
            onMouseLeave={() => setAssistantActiveChunk(null)}
            onClick={() => onNavigate?.(i)}
            tabIndex={-1}
          />
        )
      })}
    </div>
  )
}
