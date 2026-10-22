import { useState } from 'react'
import { useStore } from '@/store'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { NoteCover } from './NoteCover'
import type { NoteEntry, NoteSource } from '@shared/index'

const SOURCE_LABEL: Record<NoteSource, string> = { anthropic: 'Anthropic', web: '网页', book: '书籍', unknown: '未知' }

function urlSlug(url: string): string {
  return url.split('/').pop() || 'note'
}

export function NoteRow({ entry, onOpen }: { entry: NoteEntry; onOpen: (path: string) => void }) {
  const deleteNoteAction = useStore(s => s.deleteNoteAction)
  const selected = useStore(s => s.writingFile?.path === entry.path)
  const [confirming, setConfirming] = useState(false)
  const { title, rating, source, collected_at } = entry.meta
  const slug = urlSlug(entry.meta.url)

  return (
    <>
      <div
        data-testid={`note-card-${slug}`}
        className="group relative flex items-center gap-2 px-1.5 py-1 rounded cursor-pointer"
        style={selected ? { background: 'rgba(217,119,87,.16)', boxShadow: 'inset 2px 0 0 #d97757' } : undefined}
        onClick={() => onOpen(entry.path)}
      >
        <NoteCover entry={entry} className="shrink-0 w-[18px] h-[24px] rounded-[2px]" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[11.5px] leading-snug text-parchment/90">{title}</div>
          <div className="mt-0.5 text-[9px] text-parchment/45">
            {rating > 0 ? '★'.repeat(rating) : '未评'} · {SOURCE_LABEL[source]} · {collected_at.slice(0, 10)}
          </div>
        </div>
        <button
          data-testid={`note-delete-${slug}`}
          title="删除笔记" aria-label="删除笔记"
          className="absolute top-0.5 right-1 opacity-0 group-hover:opacity-100 transition-opacity text-[11px] leading-none text-parchment/45"
          onClick={(e) => { e.stopPropagation(); setConfirming(true) }}
        >✕</button>
      </div>
      <ConfirmDialog
        open={confirming} title="删除笔记" icon="trash" confirmLabel="删除" confirmVariant="danger"
        onCancel={() => setConfirming(false)}
        onConfirm={() => { setConfirming(false); void deleteNoteAction(entry.path) }}
      >
        <p>确定删除笔记《{title}》？文件将被永久删除，无法恢复。</p>
      </ConfirmDialog>
    </>
  )
}
