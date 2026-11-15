import { CoverGenerator } from '@/components/album-wall/CoverGenerator'
import { ipc } from '@/lib/ipc'
import { useStore } from '@/store'
import type { NoteEntry } from '@shared/index'

export function NoteCoverGenerator({ entry, className = '', fillCover = false }: { entry: NoteEntry; className?: string; fillCover?: boolean }) {
  const loadNotes = useStore(state => state.loadNotes)
  const showToast = useStore(state => state.showToast)

  return (
    <CoverGenerator
      hasCover={!!entry.coverUrl}
      subject="笔记"
      testIdPrefix="note-cover"
      className={className}
      fillCover={fillCover}
      onGenerate={async () => (await ipc.notesGenerateCovers({ path: entry.path })).candidates}
      onSave={async design => {
        await ipc.notesSaveCover({ path: entry.path, design })
        await loadNotes()
      }}
      onError={showToast}
    />
  )
}
