import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ipc } from '@/lib/ipc'
import { useStore } from '@/store'
import type { NoteCoverCandidate, NoteEntry } from '@shared/index'

export function NoteCoverGenerator({ entry, className = '' }: { entry: NoteEntry; className?: string }) {
  const loadNotes = useStore(state => state.loadNotes)
  const showToast = useStore(state => state.showToast)
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [candidates, setCandidates] = useState<NoteCoverCandidate[]>([])
  const requestId = useRef(0)
  const generating = useRef(false)

  const cancel = () => {
    requestId.current += 1
    generating.current = false
    setOpen(false)
    setLoading(false)
    setCandidates([])
  }

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') cancel() }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open])

  const generate = async () => {
    if (generating.current) return
    const id = ++requestId.current
    generating.current = true
    setOpen(true)
    setLoading(true)
    setCandidates([])
    try {
      const result = await ipc.notesGenerateCovers({ path: entry.path })
      if (requestId.current === id) setCandidates(result.candidates)
    } catch {
      if (requestId.current === id) {
        showToast('封面生成失败')
        setOpen(false)
      }
    } finally {
      if (requestId.current === id) {
        generating.current = false
        setLoading(false)
      }
    }
  }

  const select = async (candidate: NoteCoverCandidate) => {
    if (saving) return
    setSaving(true)
    try {
      await ipc.notesSaveCover({ path: entry.path, design: candidate.design })
      await loadNotes()
      setOpen(false)
    } catch {
      showToast('封面保存失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <button
        type="button"
        data-testid="note-cover-generate"
        className={`rounded border border-parchment/25 bg-black/45 px-2 py-1 text-[10px] text-parchment/80 hover:border-ember/60 hover:text-parchment ${className}`}
        onMouseDown={(event) => event.stopPropagation()}
        onClick={(event) => { event.stopPropagation(); void generate() }}
      >{entry.coverUrl ? '重新生成' : '生成封面'}</button>
      {open && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-5" onClick={cancel}>
          <div
            data-testid="note-cover-dialog"
            role="dialog"
            aria-label="选择笔记封面"
            className="max-h-full w-full max-w-4xl overflow-y-auto rounded-lg border border-parchment/20 bg-ink p-5 text-parchment shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start gap-4">
              <div>
                <h3 className="font-serif text-lg">为这篇笔记创造三枚符号</h3>
                <p className="mt-1 text-[11px] text-parchment/50">每一版都根据正文独立创作，选择后会保存为这篇笔记的封面。</p>
              </div>
              <button type="button" data-testid="note-cover-cancel" onClick={cancel} className="ml-auto text-parchment/50 hover:text-parchment">✕</button>
            </div>
            {loading ? (
              <div data-testid="note-cover-loading" className="py-20 text-center text-sm text-parchment/55">正在阅读笔记并创造符号…</div>
            ) : (
              <div className="mt-5 grid gap-4 sm:grid-cols-3">
                {candidates.map((candidate, index) => (
                  <div key={index} data-testid="note-cover-candidate" className="rounded-md border border-parchment/15 bg-parchment/5 p-2.5">
                    <img src={candidate.svgDataUrl} alt={`封面候选 ${index + 1}`} className="aspect-[3/4] w-full rounded object-cover" />
                    <p className="mt-2 min-h-8 text-[11px] leading-relaxed text-parchment/65">{candidate.design.concept}</p>
                    <button
                      type="button"
                      data-testid="note-cover-select"
                      disabled={saving}
                      onClick={() => void select(candidate)}
                      className="mt-2 w-full rounded bg-ember px-3 py-1.5 text-[11px] text-white disabled:opacity-50"
                    >{saving ? '保存中…' : `选择第 ${index + 1} 版`}</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
    </>
  )
}
