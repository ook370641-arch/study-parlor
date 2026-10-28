import { useEffect, useRef, useState } from 'react'
import { useStore } from '@/store'
import { BriefingListColumn } from '@/components/BriefingListColumn'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { CompanionWritingPicker } from '@/components/article-assistant/CompanionWritingPicker'
import { DemoInfoButton, DemoNotePopover } from '@/components/demo/DemoNotePopover'
import type { DemoNote } from '@/lib/demo-notes'
import { BookListColumn } from './BookListColumn'
import { ChapterListColumn } from './ChapterListColumn'
import { BookReader } from './BookReader'
import type { BriefingTheme } from '@shared/index'

/** 书籍来源面板：书籍列 + 章节列 + 章节阅读器（右栏导读/对照由阅读器挂载）。 */
export function BookPanel({ theme }: { theme: BriefingTheme }) {
  const loadBooks = useStore((s) => s.loadBooks)
  const removeBook = useStore((s) => s.removeBook)
  const pickerOpen = useStore((s) => s.writingCompanionPicker === 'book')
  const chapter = useStore((s) => s.activeChapter)
  const book = useStore((s) => s.booksList.find((b) => b.dir === s.activeBookDir))
  const notesList = useStore((s) => s.notesList)
  const loadNotes = useStore((s) => s.loadNotes)
  const [listCollapsed, setListCollapsed] = useState(false)
  const [chapterCollapsed, setChapterCollapsed] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<{ dir: string; title: string } | null>(null)
  const [openNote, setOpenNote] = useState<DemoNote['id'] | null>(null)
  const bookInfoRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    void loadBooks()
  }, [loadBooks])

  // 对照挑选器需要判断本章是否已有笔记；笔记列表未加载时补一次
  useEffect(() => {
    if (pickerOpen && notesList === null) void loadNotes()
  }, [pickerOpen, notesList, loadNotes])

  // 当前章节笔记与 BookReader 的「存为笔记」同规则：<书名> · <章节标题>
  const chapterLabel = chapter ? `${book?.title ?? '书籍'} · ${chapter.meta.title}` : null
  const hasChapterNote = !!(chapterLabel && notesList?.some((n) =>
    n.meta.source === 'book' && n.meta.book === book?.title && n.meta.title === chapterLabel))

  const createChapterNoteForCompanion = async (): Promise<string | null> => {
    if (!chapter || !chapterLabel) return null
    try {
      const r = await useStore.getState().findOrCreateArticleNote({
        title: chapterLabel,
        url: '',
        source: 'book',
        book: book?.title,
      })
      await useStore.getState().selectArticleCompanion('book', chapter.path, r.path)
      return r.path
    } catch {
      useStore.getState().showToast('笔记创建失败')
      return null
    }
  }

  const pickCompanion = (filePath: string) => {
    const st = useStore.getState()
    const chapter = st.activeChapter
    if (!chapter) {
      st.showToast('请先选择一个章节')
      return
    }
    void st.selectArticleCompanion('book', chapter.path, filePath)
  }

  return (
    <div data-testid="book-panel" className="relative flex-1 flex min-w-0 overflow-hidden z-[5]">
      <div data-testid="book-list-column-wrapper" className="contents">
        <BriefingListColumn
          collapsed={listCollapsed}
          onToggle={() => setListCollapsed((c) => !c)}
          theme={theme}
          width={64}
          title={pickerOpen ? '选对照文' : '书籍'}
          headerExtra={pickerOpen ? undefined : (
            <span ref={bookInfoRef} className="contents">
              <DemoInfoButton
                testId="demo-info-book-source"
                label="为什么要把读书接进来，PDF 怎么变成章节"
                theme={theme}
                active={openNote === 'book-source'}
                onClick={() => setOpenNote((v) => (v === 'book-source' ? null : 'book-source'))}
              />
            </span>
          )}
        >
          {pickerOpen ? (
            <CompanionWritingPicker
              theme={theme}
              currentTarget={chapter && chapterLabel ? { key: chapter.path, label: chapterLabel, noteExists: hasChapterNote } : null}
              onCreateNote={chapter ? createChapterNoteForCompanion : undefined}
              emptyHint="先选择章节，才能为本章新建笔记"
              onPickFile={pickCompanion}
            />
          ) : (
            <BookListColumn
              theme={theme}
              onRequestDelete={(dir, title) => setPendingDelete({ dir, title })}
            />
          )}
        </BriefingListColumn>
      </div>

      <div data-testid="book-chapter-column" className="contents">
        <BriefingListColumn
          collapsed={chapterCollapsed}
          onToggle={() => setChapterCollapsed((c) => !c)}
          theme={theme}
          width={56}
          title="章节"
        >
          <ChapterListColumn theme={theme} />
        </BriefingListColumn>
      </div>

      <div className="flex-1 min-w-0 flex flex-col">
        <BookReader theme={theme} />
      </div>

      <DemoNotePopover
        noteId={openNote}
        anchorRef={bookInfoRef}
        onClose={() => setOpenNote(null)}
        theme={theme}
      />

      <ConfirmDialog
        open={pendingDelete !== null}
        title="从书架移除"
        icon="trash"
        confirmLabel="删除"
        confirmVariant="danger"
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          const target = pendingDelete
          setPendingDelete(null)
          if (target) void removeBook(target.dir)
        }}
      >
        <p>「{pendingDelete?.title}」的书籍目录（原件副本、章节与导读）将被删除。</p>
        <p className="mt-2">删除后无法恢复；桌面上的原始 PDF 不受影响。</p>
      </ConfirmDialog>
    </div>
  )
}
