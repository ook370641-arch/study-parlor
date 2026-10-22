import { useEffect, useMemo, useState } from 'react'
import { useStore } from '@/store'
import type { NoteSource } from '@shared/index'
import { sortNotes } from '@/lib/notes-list'
import { PromptDialog } from '../writing/PromptDialog'
import { NoteRow } from './NoteRow'

export function NotesShelf({ theme = 'academic' }: { theme?: 'academic' | 'newspaper' }) {
  void theme // 配色与 parchment 色系保持一致，theme 签名保留
  const notesList = useStore(s => s.notesList)
  const notesSortBy = useStore(s => s.notesSortBy)
  const setNotesSortBy = useStore(s => s.setNotesSortBy)
  const notesCategory = useStore(s => s.notesCategory)
  const setNotesCategory = useStore(s => s.setNotesCategory)
  const loadNotes = useStore(s => s.loadNotes)
  const createNoteManual = useStore(s => s.createNoteManual)
  const importReadNotesAction = useStore(s => s.importReadNotesAction)
  const assistantOpen = useStore(s => s.writingAssistantOpen)
  const panelMode = useStore(s => s.writingPanelMode)
  const selectWritingFile = useStore(s => s.selectWritingFile)
  const selectCompanionFile = useStore(s => s.selectCompanionFile)

  const [newNote, setNewNote] = useState<{ step: 'title' } | { step: 'url'; title: string } | null>(null)

  useEffect(() => { void loadNotes() }, [loadNotes])

  const sorted = useMemo(() => sortNotes(notesList ?? [], notesSortBy, notesCategory), [notesList, notesSortBy, notesCategory])

  // 对照 armed 时点击 = 放入对照槽（与 WritingTree 同规则）
  const handleOpen = (path: string) => {
    if (assistantOpen && panelMode === 'companion') void selectCompanionFile(path)
    else void selectWritingFile(path)
  }

  return (
    <div data-testid="notes-shelf" className="flex flex-col">
      <div className="flex items-center gap-2 px-3 pt-2">
        <select
          data-testid="notes-category-select"
          value={notesCategory}
          onChange={(e) => setNotesCategory(e.target.value as 'all' | NoteSource)}
          className="bg-transparent text-[11px] text-parchment/80 border border-parchment/20 rounded px-1.5 py-0.5 outline-none"
        >
          <option value="all">全部</option>
          <option value="anthropic">Anthropic</option>
          <option value="web">网页</option>
          <option value="book">书籍</option>
          <option value="unknown">未知</option>
        </select>
        <button data-testid="notes-new-button" onClick={() => setNewNote({ step: 'title' })}
          className="ml-auto text-[11px] text-parchment border border-ember/50 bg-ember/15 rounded px-2 py-0.5">
          ＋ 新笔记
        </button>
      </div>
      <div className="flex items-center gap-2 px-3 pt-1.5 pb-1">
        <button data-testid="notes-import-button" title="导入已读" aria-label="导入已读"
          onClick={() => { void importReadNotesAction() }}
          className="text-[11px] text-parchment/60 hover:text-parchment border border-parchment/20 rounded px-1.5 py-0.5">
          ⬆
        </button>
        <select data-testid="notes-sort-select" value={notesSortBy}
          onChange={(e) => setNotesSortBy(e.target.value as 'time' | 'rating')}
          className="bg-transparent text-[11px] text-parchment/60 border border-parchment/20 rounded px-1.5 py-0.5 outline-none">
          <option value="time">时间</option>
          <option value="rating">星标</option>
        </select>
      </div>
      <div className="px-1.5 pb-3">
        {sorted.length === 0 && notesList !== null && (
          <div data-testid="notes-empty" className="px-3 py-6 text-center text-[11px] text-parchment/40">
            {notesCategory === 'all' ? '书架还空着——点「导入已读」把读过的文章放上架' : '该分类下暂无笔记'}
          </div>
        )}
        {sorted.map(entry => <NoteRow key={entry.path} entry={entry} onOpen={handleOpen} />)}
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
