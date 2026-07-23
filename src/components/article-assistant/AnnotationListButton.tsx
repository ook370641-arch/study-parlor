import { useEffect, useState } from 'react'
import { ipc } from '@/lib/ipc'
import type { ArticleAnnotation } from '@shared/index'

interface Props {
  articlePath: string
  theme?: 'academic' | 'newspaper'
}

export function AnnotationListButton({ articlePath, theme = 'academic' }: Props) {
  const [open, setOpen] = useState(false)
  const [annotations, setAnnotations] = useState<ArticleAnnotation[]>([])
  const isAcademic = theme !== 'newspaper'

  const load = async () => {
    try {
      setAnnotations(await ipc.annotationsRead(articlePath))
    } catch {
      setAnnotations([])
    }
  }

  useEffect(() => {
    setOpen(false)
    void load()
  }, [articlePath])

  if (annotations.length === 0) return null

  const jumpTo = (id: string) => {
    const el = document.querySelector(`[data-anno-id="${id}"]`) as HTMLElement | null
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    el.style.outline = '2px solid #d97757'
    el.style.outlineOffset = '2px'
    setTimeout(() => { el.style.outline = '' }, 1200)
  }

  return (
    <div className="relative">
      <button
        data-testid="annotation-list-button"
        onClick={() => { const next = !open; setOpen(next); if (next) void load() }}
        className={`text-xs px-3 py-1 rounded-full border transition-colors ${
          isAcademic
            ? 'border-parchment/30 text-parchment/70 hover:text-parchment hover:border-ember/60'
            : 'border-[#1a1a1a]/30 text-[#6b5d52] hover:text-[#1a1a1a] hover:border-[#1a1a1a]/60'
        }`}
      >
        标注 ({annotations.length})
      </button>
      {open && (
        <div
          data-testid="annotation-list-panel"
          className={`absolute left-1/2 -translate-x-1/2 top-full mt-2 z-30 w-72 max-h-64 overflow-y-auto rounded-lg border p-2 shadow-xl ${
            isAcademic ? 'bg-ink border-parchment/20' : 'bg-white border-[#1a1a1a]/20'
          }`}
        >
          {annotations.map((a) => (
            <button
              key={a.id}
              data-testid="annotation-list-item"
              data-anno-id={a.id}
              onClick={() => jumpTo(a.id)}
              className={`w-full text-left rounded px-2 py-1.5 text-xs transition-colors ${
                isAcademic ? 'text-parchment/80 hover:bg-parchment/10' : 'text-[#1a1a1a] hover:bg-[#f5f2ed]'
              }`}
            >
              <div className="truncate">「{a.selectedText}」</div>
              <div className="flex items-baseline justify-between gap-2 mt-0.5">
                <span className={`truncate ${isAcademic ? 'text-parchment/50' : 'text-[#6b5d52]'}`}>
                  {a.note || '（无备注）'}
                </span>
                <span className="shrink-0 opacity-50">§{a.paragraphIndex}</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
