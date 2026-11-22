import { useEffect, useMemo, useState } from 'react'
import { ArticleDivider } from '@/components/article-assistant/ArticleDivider'
import { MarkdownRenderer } from '@/components/md/MarkdownRenderer'
import { ipc } from '@/lib/ipc'
import { noteChapter } from '@/lib/notes-list'
import { useStore } from '@/store'
import type { ArticleAssistantGuide, BookTocItem, NoteEntry } from '@shared/index'

const ANNOTATION_TITLE = / · 标注(?: \d+)?$/

function chapterPath(bookDir: string, item: BookTocItem): string {
  return `${bookDir}/${item.chapterFile}`
}

function GuidePreview({ guide }: { guide: ArticleAssistantGuide }) {
  return (
    <div className="space-y-3" data-testid="book-material-guide-content">
      <section className="rounded border border-parchment/10 bg-black/10 p-3">
        <strong className="mr-2 text-ember">背景</strong>
        <span className="leading-relaxed text-parchment/75">{guide.background}</span>
      </section>
      {guide.chunks.map((chunk, index) => (
        <section key={`${chunk.heading}-${index}`} className="rounded border border-parchment/10 bg-black/10 p-3">
          <div className="mb-1 font-medium text-ember">§{index + 1} {chunk.heading}</div>
          <div className="leading-relaxed text-parchment/75">{chunk.context ?? chunk.summary}</div>
          {chunk.terms.length > 0 && (
            <div className="mt-2 space-y-1 border-t border-parchment/10 pt-2 text-[11px] text-parchment/55">
              {chunk.terms.map((term, termIndex) => <div key={`${term.term}-${termIndex}`}><span className="text-ember">{term.term}</span> · {term.translation}</div>)}
            </div>
          )}
        </section>
      ))}
    </div>
  )
}

export function BookNoteWorkspace({ entry, children }: { entry: NoteEntry; children: React.ReactNode }) {
  const booksList = useStore(s => s.booksList)
  const notesList = useStore(s => s.notesList)
  const writingFile = useStore(s => s.writingFile)
  const theme = useStore(s => s.briefingTheme)
  const width = useStore(s => s.articleAssistantGuideWidth)
  const collapsed = useStore(s => s.articleAssistantGuideCollapsed)
  const setWidth = useStore(s => s.setArticleAssistantGuideWidth)
  const setCollapsed = useStore(s => s.setArticleAssistantGuideCollapsed)
  const selectWritingFile = useStore(s => s.selectWritingFile)
  const findOrCreateArticleNote = useStore(s => s.findOrCreateArticleNote)
  const loadBooks = useStore(s => s.loadBooks)
  const showToast = useStore(s => s.showToast)
  const book = booksList.find(item => item.title === entry.meta.book)
  const [toc, setToc] = useState<BookTocItem[]>([])
  const [selectedChapterPath, setSelectedChapterPath] = useState<string | null>(null)
  const [mode, setMode] = useState<'note' | 'guide'>('note')
  const [noteBody, setNoteBody] = useState<string | null>(null)
  const [guide, setGuide] = useState<ArticleAssistantGuide | null>(null)

  useEffect(() => {
    if (!book && booksList.length === 0) void loadBooks()
  }, [book, booksList.length, loadBooks])

  useEffect(() => {
    let active = true
    if (!book) return () => { active = false }
    void ipc.booksChapters({ bookDir: book.dir }).then(items => {
      if (active) setToc(items)
    }).catch(() => {
      if (active) setToc([])
    })
    return () => { active = false }
  }, [book?.dir])

  const chapterNotes = useMemo(() => (notesList ?? []).filter(note => note.meta.source === 'book'
    && note.meta.book === entry.meta.book && note.meta.bookScope !== 'whole' && !ANNOTATION_TITLE.test(note.meta.title)), [notesList, entry.meta.book])
  const selectedToc = toc.find(item => chapterPath(book?.dir ?? '', item) === selectedChapterPath)
  const selectedNote = selectedToc ? chapterNotes.find(note => noteChapter(note) === selectedToc.title) : undefined

  useEffect(() => {
    if (!book || toc.length === 0) return
    if (selectedChapterPath && toc.some(item => chapterPath(book.dir, item) === selectedChapterPath)) return
    const currentChapter = entry.meta.chapter
    const preferred = toc.find(item => item.title === currentChapter)
      ?? toc.find(item => chapterNotes.some(note => noteChapter(note) === item.title))
      ?? toc[0]
    setSelectedChapterPath(chapterPath(book.dir, preferred))
  }, [book, toc, selectedChapterPath, entry.meta.chapter, chapterNotes])

  useEffect(() => {
    let active = true
    setNoteBody(null)
    if (mode !== 'note' || !selectedNote) return () => { active = false }
    if (writingFile?.path === selectedNote.path) {
      setNoteBody(writingFile.body)
      return () => { active = false }
    }
    void ipc.writingRead({ path: selectedNote.path }).then(result => {
      if (active) setNoteBody(result.ok ? result.value.body : '')
    }).catch(() => {
      if (active) setNoteBody('')
    })
    return () => { active = false }
  }, [mode, selectedNote?.path, writingFile?.path, writingFile?.body])

  useEffect(() => {
    let active = true
    setGuide(null)
    if (mode !== 'guide' || !selectedChapterPath) return () => { active = false }
    void ipc.articleAssistantReadGuide({ parentPath: selectedChapterPath, parentType: 'book-chapter' }).then(file => {
      if (active) setGuide(file?.guide ?? null)
    }).catch(() => {
      if (active) setGuide(null)
    })
    return () => { active = false }
  }, [mode, selectedChapterPath])

  const topNotes = [...chapterNotes].sort((a, b) => {
    const aIndex = toc.findIndex(item => item.title === noteChapter(a))
    const bIndex = toc.findIndex(item => item.title === noteChapter(b))
    return (aIndex < 0 ? Number.MAX_SAFE_INTEGER : aIndex) - (bIndex < 0 ? Number.MAX_SAFE_INTEGER : bIndex)
  })
  const selectedIndex = selectedToc ? toc.indexOf(selectedToc) : -1
  const openWhole = async () => {
    if (!entry.meta.book) return
    try {
      const result = await findOrCreateArticleNote({ title: `${entry.meta.book} · 整书笔记`, url: '', source: 'book', book: entry.meta.book, bookScope: 'whole' })
      await selectWritingFile(result.path)
    } catch {
      showToast('整书笔记创建失败')
    }
  }
  const moveMaterialChapter = (offset: number) => {
    const next = toc[selectedIndex + offset]
    if (book && next) setSelectedChapterPath(chapterPath(book.dir, next))
  }

  const isAcademic = theme !== 'newspaper'
  const tabClass = (active: boolean) => `px-3 py-1 text-[11px] rounded transition-colors ${active ? 'bg-ember/15 text-ember' : isAcademic ? 'text-parchment/45 hover:text-parchment' : 'text-[#6b5d52] hover:text-[#1a1a1a]'}`
  return (
    <div data-testid="book-note-workspace" className="flex h-full min-h-0 flex-col">
      <nav className={`flex h-[68px] shrink-0 items-stretch overflow-x-auto border-b ${isAcademic ? 'border-parchment/10 bg-[#211915]' : 'border-[#1a1a1a]/10 bg-white/40'}`} aria-label="书籍笔记章节">
        <button data-testid="book-note-top-whole" onClick={() => { void openWhole() }} aria-current={entry.meta.bookScope === 'whole' ? 'page' : undefined}
          className={`min-w-32 border-r px-4 text-left text-xs ${entry.meta.bookScope === 'whole' ? 'bg-ember/10 text-ember shadow-[inset_0_-2px_#d97757]' : 'border-parchment/10 text-parchment/55'}`}>
          <span className="mb-1 block text-[8px] tracking-widest opacity-55">WHOLE BOOK</span>✦ 整书笔记
        </button>
        {topNotes.map(note => (
          <button key={note.path} data-testid={`book-note-top-${note.path}`} onClick={() => { void selectWritingFile(note.path) }} aria-current={entry.path === note.path ? 'page' : undefined}
            className={`min-w-32 max-w-44 border-r px-4 text-left text-xs ${entry.path === note.path ? 'bg-ember/10 text-ember shadow-[inset_0_-2px_#d97757]' : 'border-parchment/10 text-parchment/55'}`}>
            <span className="mb-1 block text-[8px] tracking-widest opacity-55">CHAPTER NOTE</span>
            <span className="block truncate">{noteChapter(note)}</span>
          </button>
        ))}
      </nav>
      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1">{children}</div>
        <ArticleDivider collapsed={collapsed} onToggleCollapse={() => setCollapsed(!collapsed)} theme={theme}
          onResize={next => setWidth(Math.max(240, Math.min(next, window.innerWidth * 0.5)))} />
        {!collapsed && (
          <aside data-testid="book-note-materials" style={{ width: Math.max(240, Math.min(width, window.innerWidth * 0.5)) }}
            className={`flex min-h-0 shrink-0 flex-col border-l text-[12px] ${isAcademic ? 'border-parchment/10 bg-[#211915] text-parchment' : 'border-[#1a1a1a]/10 bg-[#f5efe5] text-[#1a1a1a]'}`}>
            <div className="flex h-11 shrink-0 items-center gap-1 border-b border-parchment/10 px-3">
              <strong className="mr-2 text-xs font-medium">章节资料</strong>
              <button data-testid="book-material-tab-note" className={tabClass(mode === 'note')} onClick={() => setMode('note')}>笔记</button>
              <button data-testid="book-material-tab-guide" className={tabClass(mode === 'guide')} onClick={() => setMode('guide')}>导读</button>
            </div>
            <div className="shrink-0 p-3">
              <select data-testid="book-material-chapter-select" aria-label="选择资料章节" value={selectedChapterPath ?? ''}
                onChange={event => setSelectedChapterPath(event.target.value)}
                className={`w-full rounded border px-2 py-2 text-xs outline-none ${isAcademic ? 'border-parchment/15 bg-[#292019] text-parchment/80' : 'border-[#1a1a1a]/15 bg-white text-[#1a1a1a]'}`}>
                {toc.map(item => <option key={item.chapterFile} value={chapterPath(book?.dir ?? '', item)}>{item.title}</option>)}
              </select>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
              {mode === 'note' && (!selectedNote ? (
                <div className="py-12 text-center text-parchment/40">这一章还没有主笔记</div>
              ) : noteBody === null ? <div className="py-12 text-center text-parchment/40">读取中…</div> : (
                <div data-testid="book-material-note-content" className="rounded border border-parchment/10 bg-black/10 p-3 text-[12px] leading-6">
                  <MarkdownRenderer content={noteBody} fileName={selectedNote.path} hideHeader />
                </div>
              ))}
              {mode === 'guide' && (guide ? <GuidePreview guide={guide} /> : <div className="py-12 text-center text-parchment/40">这一章还没有导读</div>)}
            </div>
            <div className="flex h-9 shrink-0 items-center justify-between border-t border-parchment/10 px-3 text-[10px] text-parchment/45">
              <button disabled={selectedIndex <= 0} onClick={() => moveMaterialChapter(-1)} className="disabled:opacity-25">← 上一章</button>
              <span>{selectedIndex >= 0 ? `${selectedIndex + 1} / ${toc.length}` : ''}</span>
              <button disabled={selectedIndex < 0 || selectedIndex >= toc.length - 1} onClick={() => moveMaterialChapter(1)} className="disabled:opacity-25">下一章 →</button>
            </div>
          </aside>
        )}
      </div>
    </div>
  )
}
