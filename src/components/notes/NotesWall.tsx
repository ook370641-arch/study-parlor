import { useMemo } from 'react'
import { useStore } from '@/store'
import { sortNotes } from '@/lib/notes-list'
import { NoteCover } from './NoteCover'

function urlSlug(url: string): string {
  return url.split('/').pop() || 'note'
}

/** 主区专辑墙：无打开笔记时的笔记主页。排序/分类与第二列封面行共享 store 状态。 */
export function NotesWall() {
  const notesList = useStore(s => s.notesList)
  const notesCategory = useStore(s => s.notesCategory)
  const notesSortBy = useStore(s => s.notesSortBy)
  const selectWritingFile = useStore(s => s.selectWritingFile)

  const sorted = useMemo(() => sortNotes(notesList ?? [], notesSortBy, notesCategory), [notesList, notesSortBy, notesCategory])

  if (sorted.length === 0 && notesList !== null) {
    return (
      <div data-testid="notes-empty" className="flex h-full items-center justify-center px-6">
        <p className="text-center text-parchment/40 text-sm">
          {notesCategory === 'all' ? '书架还空着——点左侧「导入已读」把读过的文章放上架' : '该分类下暂无笔记'}
        </p>
      </div>
    )
  }

  return (
    <div data-testid="notes-wall" className="h-full overflow-y-auto px-8 py-6">
      <div className="grid gap-5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}>
        {sorted.map(entry => (
          <button
            key={entry.path}
            data-testid={`wall-album-${urlSlug(entry.meta.url)}`}
            className="group relative rounded-md overflow-hidden text-left transition-transform hover:-translate-y-0.5"
            style={{ aspectRatio: '3/4', boxShadow: '0 6px 16px rgba(0,0,0,.5)' }}
            onClick={() => { void selectWritingFile(entry.path) }}
          >
            <NoteCover entry={entry} className="absolute inset-0 w-full h-full" />
            <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(20,12,8,0) 40%, rgba(20,12,8,.88))' }} />
            <div className="absolute inset-x-0 bottom-0 p-2.5">
              <div className="text-[12px] leading-snug text-[#f0e2c8] line-clamp-2">{entry.meta.title}</div>
              <div className="mt-1 text-[10px] text-parchment/60">
                {entry.meta.rating > 0 ? '★'.repeat(entry.meta.rating) : '未评'}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
