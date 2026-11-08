import { useEffect } from 'react'
import { useStore } from '@/store'
import { WritingEditor } from '@/components/writing/WritingEditor'
import { NoteMetaHeader } from './NoteMetaHeader'
import { PaintingPlate } from '@/components/briefing/PaintingPlate'
import { Quote } from '@/components/Quote'
import { WRITING_BODY_FROM_UI, WRITING_UI_QUOTE_SIZES } from '@/lib/briefing-font-size'

export function NoteBoard() {
  const file = useStore(s => s.writingFile)
  const notesList = useStore(s => s.notesList)
  const briefingTheme = useStore(s => s.briefingTheme)
  const writingUISize = useStore(s => s.writingUIFontSize)
  const updateWritingBody = useStore(s => s.updateWritingBody)
  const saveWritingFile = useStore(s => s.saveWritingFile)
  const closeNoteToWall = useStore(s => s.closeNoteToWall)

  const entry = notesList?.find(e => e.path === file?.path)

  // Autosave: debounce 1.5s after body change（照抄 WritingBoard）
  useEffect(() => {
    if (!file?.dirty) return
    const t = setTimeout(() => saveWritingFile(), 1500)
    return () => clearTimeout(t)
  }, [file?.body, file?.dirty])

  if (!file || !entry) {
    return (
      <div data-testid="note-empty-state" className="flex items-center justify-center h-full text-parchment/40 text-sm">
        从左侧书架选一篇笔记，或点「＋ 新笔记」
      </div>
    )
  }

  const body = WRITING_BODY_FROM_UI[writingUISize]
  const color = briefingTheme === 'newspaper' ? '#1a1a1a' : '#e8d5b7'

  return (
    <div
      data-testid="note-board"
      className="flex flex-col h-full"
      style={{
        ['--writing-body-size' as string]: body.size,
        ['--writing-body-weight' as string]: body.weight,
        ['--writing-tone-color' as string]: color,
        ['--writing-ui-quote-size' as string]: WRITING_UI_QUOTE_SIZES[writingUISize],
      }}
    >
      <div className="flex items-center gap-2 px-3 h-9 border-b border-parchment/10 shrink-0">
        <button
          data-testid="note-back-to-wall"
          className="text-[11px] text-ember hover:text-ember/80"
          onClick={() => { void closeNoteToWall() }}
        >
          ← 笔记墙
        </button>
        <span className="text-[10px] text-parchment/35 truncate">笔记 / {entry.meta.title}</span>
        <span className="ml-auto text-[10px]">
          {file.saving === 'saving' ? <span className="text-parchment/50">保存中…</span>
           : file.saving === 'saved' ? <span className="text-emerald-400/70">已保存 ✓</span>
           : file.saving === 'error' ? <span className="text-red-400/70">保存失败</span>
           : null}
        </span>
      </div>
      <div
        data-testid="note-editor"
        className="flex-1 min-h-0 overflow-y-auto px-8 py-6"
        style={{ fontSize: 'var(--writing-body-size)', fontWeight: 'var(--writing-body-weight)', color: 'var(--writing-tone-color)' }}
      >
        {briefingTheme !== 'newspaper' && <PaintingPlate />}
        <div className="flex justify-center mb-4">
          <Quote surface="writing" />
        </div>
        <NoteMetaHeader key={`meta-${entry.path}`} entry={entry} />
        <WritingEditor
          key={`${file.path}:${entry.meta.ai_generated_at ?? 'original'}`}
          initial={file.body}
          onChange={md => updateWritingBody(md)}
          theme="academic"
          filePath={file.path}
        />
      </div>
    </div>
  )
}
