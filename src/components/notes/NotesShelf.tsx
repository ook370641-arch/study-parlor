import { Fragment, useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { useStore } from '@/store'
import { PromptDialog } from '../writing/PromptDialog'
import { NoteCard } from './NoteCard'

/** 每多少张卡片插入一道书架隔板 */
const GROUP_SIZE = 3

export function NotesShelf({ theme = 'academic' }: { theme?: 'academic' | 'newspaper' }) {
  const isAcademic = theme !== 'newspaper'
  const notesList = useStore(s => s.notesList)
  const notesSortBy = useStore(s => s.notesSortBy)
  const setNotesSortBy = useStore(s => s.setNotesSortBy)
  const loadNotes = useStore(s => s.loadNotes)
  const createNoteManual = useStore(s => s.createNoteManual)
  const importReadNotesAction = useStore(s => s.importReadNotesAction)

  const [newNote, setNewNote] = useState<{ step: 'title' } | { step: 'url'; title: string } | null>(null)

  useEffect(() => { void loadNotes() }, [loadNotes])

  const sorted = useMemo(() => {
    const list = [...(notesList ?? [])]
    if (notesSortBy === 'rating') {
      list.sort((a, b) => b.meta.rating - a.meta.rating || b.meta.collected_at.localeCompare(a.meta.collected_at))
    } else {
      list.sort((a, b) => b.meta.collected_at.localeCompare(a.meta.collected_at))
    }
    return list
  }, [notesList, notesSortBy])

  const pillBase: CSSProperties = {
    fontSize: 10,
    padding: '2px 8px',
    borderRadius: 9999,
    background: 'transparent',
    border: isAcademic ? '1px solid rgba(232,213,183,.25)' : '1px solid #c9c3b8',
    color: isAcademic ? 'rgba(232,213,183,.55)' : '#6b5d52',
  }
  const pillOn: CSSProperties = isAcademic
    ? { border: '1px solid #d97757', color: '#d97757' }
    : { border: '1px solid #8a3a3a', color: '#8a3a3a' }
  const boardStyle: CSSProperties = isAcademic
    ? {
        height: 5,
        margin: '4px 6px 0',
        borderRadius: 2,
        background: 'linear-gradient(180deg, #4a3423, #2c1e13)',
        boxShadow: '0 3px 6px rgba(0,0,0,.55)',
      }
    : {
        height: 5,
        margin: '4px 6px 0',
        borderRadius: 2,
        background: 'linear-gradient(180deg, #cbbfa8, #b3a68d)',
        boxShadow: '0 2px 4px rgba(42,31,26,.2)',
      }

  return (
    <div data-testid="notes-shelf" className="flex flex-col">
      <div className="flex items-center" style={{ gap: 6, padding: '6px 12px 4px', flexWrap: 'wrap' }}>
        <button data-testid="notes-sort-time" onClick={() => setNotesSortBy('time')} style={{ ...pillBase, ...(notesSortBy === 'time' ? pillOn : {}) }}>时间</button>
        <button data-testid="notes-sort-rating" onClick={() => setNotesSortBy('rating')} style={{ ...pillBase, ...(notesSortBy === 'rating' ? pillOn : {}) }}>星标</button>
        <button data-testid="notes-import-button" onClick={() => { void importReadNotesAction() }} style={pillBase}>导入已读</button>
        <button data-testid="notes-new-button" onClick={() => setNewNote({ step: 'title' })} style={{ ...pillBase, marginLeft: 'auto', color: isAcademic ? '#e8d5b7' : '#2a1f1a' }}>＋ 新笔记</button>
      </div>
      <div style={{ padding: '0 8px 12px' }}>
        {sorted.length === 0 && notesList !== null && (
          <div data-testid="notes-empty" style={{ padding: '24px 12px', textAlign: 'center', fontSize: 12, color: isAcademic ? 'rgba(232,213,183,.4)' : 'rgba(107,93,82,.7)' }}>
            书架还空着——点「导入已读」把读过的文章放上架
          </div>
        )}
        {sorted.map((entry, i) => (
          <Fragment key={entry.path}>
            <NoteCard entry={entry} theme={theme} />
            {(i + 1) % GROUP_SIZE === 0 && i < sorted.length - 1 && <div style={boardStyle} />}
          </Fragment>
        ))}
      </div>
      {newNote?.step === 'title' && (
        <PromptDialog
          title="文章名:"
          onSubmit={(title) => setNewNote({ step: 'url', title })}
          onCancel={() => setNewNote(null)}
        />
      )}
      {newNote?.step === 'url' && (
        <PromptDialog
          title="网页:"
          onSubmit={(url) => {
            const title = newNote.title
            setNewNote(null)
            void createNoteManual({ title, url })
          }}
          onCancel={() => setNewNote(null)}
        />
      )}
    </div>
  )
}