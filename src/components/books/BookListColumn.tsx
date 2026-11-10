import { useEffect, useRef, useState } from 'react'
import { useStore } from '@/store'
import { ipc } from '@/lib/ipc'
import { Tooltip } from '@/components/Tooltip'
import { noteChapter } from '@/lib/notes-list'
import type { BookTocItem, BriefingTheme } from '@shared/index'

interface Props {
  theme: BriefingTheme
  onRequestDelete?: (dir: string, title: string) => void
}

/** 书架列：书卡 + 导入入口。 */
export function BookListColumn({ theme, onRequestDelete }: Props) {
  const [expandedOverrides, setExpandedOverrides] = useState<Record<string, boolean>>({})
  const [chapterLists, setChapterLists] = useState<Record<string, BookTocItem[]>>({})
  const [loadingDirs, setLoadingDirs] = useState<Record<string, boolean>>({})
  const chapterRows = useRef<Record<string, HTMLButtonElement | null>>({})
  const books = useStore((s) => s.booksList)
  const previousBooks = useRef(books)
  const loading = useStore((s) => s.booksLoading)
  const importing = useStore((s) => s.booksImporting)
  const reparsing = useStore((s) => s.booksReparsing)
  const activeDir = useStore((s) => s.activeBookDir)
  const toc = useStore((s) => s.activeBookToc)
  const activeChapterPath = useStore((s) => s.activeChapter?.path ?? null)
  const booksLastChapter = useStore((s) => s.booksLastChapter)
  const notesList = useStore((s) => s.notesList)
  const selectBook = useStore((s) => s.selectBook)
  const selectChapter = useStore((s) => s.selectChapter)
  const showToast = useStore((s) => s.showToast)
  const importBook = useStore((s) => s.importBook)
  const reparseBook = useStore((s) => s.reparseBook)
  const isAcademic = theme !== 'newspaper'
  const tipTheme = isAcademic ? 'academic' : 'newspaper'
  const recentChapterPath = booksLastChapter?.replace(/\\/g, '/')

  useEffect(() => {
    if (!activeDir) return
    setExpandedOverrides(prev => (
      prev[activeDir] === undefined ? { ...prev, [activeDir]: true } : prev
    ))
    setChapterLists(prev => ({ ...prev, [activeDir]: toc }))
  }, [activeDir, toc])

  useEffect(() => {
    if (activeChapterPath) chapterRows.current[activeChapterPath]?.scrollIntoView({ block: 'nearest' })
  }, [activeChapterPath])

  useEffect(() => {
    const previous = previousBooks.current
    previousBooks.current = books
    const invalidatedDirs = previous.filter(oldBook => {
      const next = books.find(book => book.dir === oldBook.dir)
      return !next || next.parserVersion !== oldBook.parserVersion
    }).map(book => book.dir)
    if (invalidatedDirs.length === 0) return

    setChapterLists(prev => {
      const next = { ...prev }
      for (const dir of invalidatedDirs) delete next[dir]
      return next
    })
    for (const dir of invalidatedDirs) {
      for (const path of Object.keys(chapterRows.current)) {
        if (path.startsWith(dir + '/') || path.startsWith(dir + '\\')) delete chapterRows.current[path]
      }
      if (!books.some(book => book.dir === dir) || activeDir === dir || !expandedOverrides[dir]) continue
      setLoadingDirs(prev => ({ ...prev, [dir]: true }))
      void ipc.booksChapters({ bookDir: dir })
        .then(chapters => setChapterLists(prev => ({ ...prev, [dir]: chapters })))
        .catch(() => showToast('章节列表读取失败'))
        .finally(() => setLoadingDirs(prev => ({ ...prev, [dir]: false })))
    }
  }, [books, activeDir, expandedOverrides, showToast])

  return (
    <div data-testid="book-list-column" className="flex flex-col h-full min-h-0">
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-2 space-y-2">
        {loading && books.length === 0 && (
          <div className={`text-xs px-2 py-4 ${isAcademic ? 'text-parchment/50' : 'text-[#6b5d52]'}`}>加载中…</div>
        )}
        {!loading && books.length === 0 && (
          <div className={`text-xs px-2 py-4 leading-relaxed ${isAcademic ? 'text-parchment/50' : 'text-[#6b5d52]'}`}>
            还没有书籍，点击下方导入 PDF 或 Markdown 文档序列。
          </div>
        )}
        {books.map((b, i) => {
          const active = activeDir === b.dir
          const expanded = expandedOverrides[b.dir] ?? active
          const chapters = active ? toc : chapterLists[b.dir] ?? []
          return (
            <div key={b.dir} className="relative group">
              <button
                type="button"
                data-testid={`book-card-${i}`}
                onClick={() => { setExpandedOverrides(prev => ({ ...prev, [b.dir]: true })); void selectBook(b.dir) }}
                className={`w-full text-left rounded pl-8 pr-6 py-2 transition-colors ${
                  active
                    ? isAcademic
                      ? 'bg-ember/15 border border-ember/40'
                      : 'bg-[#1a1a1a]/[0.08] border border-[#1a1a1a]/20'
                    : isAcademic
                      ? 'bg-parchment/5 hover:bg-parchment/10 border border-parchment/10'
                      : 'hover:bg-[#1a1a1a]/[0.04] border border-transparent'
                }`}
              >
                <Tooltip content={b.title} theme={tipTheme}>
                  <div className={`text-sm font-serif truncate ${isAcademic ? 'text-parchment' : 'text-[#2a1f1a]'}`}>
                    {b.title}
                    {!b.hasToc && (
                      <span className={`ml-1 text-[10px] ${isAcademic ? 'text-parchment/40' : 'text-[#6b5d52]'}`}>无目录</span>
                    )}
                  </div>
                </Tooltip>
                <div className={`text-[11px] mt-0.5 ${isAcademic ? 'text-parchment/50' : 'text-[#6b5d52]'}`}>
                  {b.chapterCount} 章
                </div>
                {/* 旧解析器产物：正文档落会挤在一起 / 无标题层级，提示并允许原地重解析 */}
                {/* 阈值与 electron/lib/books.ts 的 BOOK_PARSER_VERSION 保持一致 */}
                {(b.parserVersion ?? 1) < 3 && (
                  <div data-testid={`book-reparse-hint-${i}`} className="mt-1 flex items-center gap-1 text-[10px] leading-relaxed">
                    <span className={isAcademic ? 'text-parchment/40' : 'text-[#6b5d52]/70'}>解析格式较旧</span>
                    <button
                      type="button"
                      data-testid={`book-reparse-${i}`}
                      disabled={reparsing}
                      onClick={(e) => {
                        e.stopPropagation()
                        void reparseBook(b.dir)
                      }}
                      className={`shrink-0 rounded px-1 disabled:opacity-40 ${
                        isAcademic ? 'text-ember hover:bg-ember/10' : 'text-[#b0503c] hover:bg-[#1a1a1a]/[0.05]'
                      }`}
                    >
                      {reparsing ? '重解析中…' : '重新解析'}
                    </button>
                  </div>
                )}
                {b.bookGuide && (
                  <Tooltip content={b.bookGuide} theme={tipTheme}>
                    <div className={`text-[11px] mt-1 line-clamp-2 leading-relaxed ${isAcademic ? 'text-parchment/60' : 'text-[#6b5d52]'}`}>
                      {b.bookGuide}
                    </div>
                  </Tooltip>
                )}
              </button>
              <button
                type="button"
                data-testid={`book-chapters-toggle-${i}`}
                aria-label={expanded ? '折叠章节' : '展开章节'}
                aria-expanded={expanded}
                onClick={() => {
                  const nextExpanded = !expanded
                  setExpandedOverrides(prev => ({ ...prev, [b.dir]: nextExpanded }))
                  if (!nextExpanded || active || chapterLists[b.dir]) return
                  setLoadingDirs(prev => ({ ...prev, [b.dir]: true }))
                  void ipc.booksChapters({ bookDir: b.dir })
                    .then(chapters => setChapterLists(prev => ({ ...prev, [b.dir]: chapters })))
                    .catch(() => showToast('章节列表读取失败'))
                    .finally(() => setLoadingDirs(prev => ({ ...prev, [b.dir]: false })))
                }}
                className={`absolute left-1.5 top-2 flex h-6 w-6 items-center justify-center rounded ${
                  isAcademic ? 'text-parchment/50 hover:bg-parchment/10 hover:text-parchment' : 'text-[#6b5d52] hover:bg-[#1a1a1a]/[0.06]'
                }`}
              >
                <svg aria-hidden="true" viewBox="0 0 20 20" className={`h-4 w-4 transition-transform ${expanded ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" strokeWidth="1.7">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m7 4 6 6-6 6" />
                </svg>
              </button>
              {active && onRequestDelete && (
                <button
                  type="button"
                  data-testid={`book-delete-${i}`}
                  title="从书架移除"
                  onClick={(e) => {
                    e.stopPropagation()
                    onRequestDelete(b.dir, b.title)
                  }}
                  className={`absolute top-1.5 right-1.5 px-1 text-[10px] rounded transition-opacity ${
                    isAcademic ? 'text-parchment/40 hover:text-wine' : 'text-[#6b5d52]/60 hover:text-[#8a3a3a]'
                  }`}
                >
                  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-3.5 w-3.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16M9 7V4h6v3m-8 0 1 13h8l1-13M10 11v5m4-5v5" />
                  </svg>
                </button>
              )}
              {expanded && (
                <div data-testid="book-chapter-list" className={`ml-2 mr-1 mt-1 overflow-hidden rounded-md border ${isAcademic ? 'border-parchment/10 bg-black/10' : 'border-[#1a1a1a]/10 bg-white/25'}`}>
                  <div className={`flex items-center justify-between border-b px-2.5 py-1.5 text-[10px] tracking-[0.12em] ${isAcademic ? 'border-parchment/10 text-parchment/35' : 'border-[#1a1a1a]/10 text-[#6b5d52]/60'}`}>
                    <span>章节目录</span>
                    <span className="tabular-nums">{chapters.length} 章</span>
                  </div>
                  {loadingDirs[b.dir] ? (
                    <div className={`px-3 py-3 text-[11px] ${isAcademic ? 'text-parchment/40' : 'text-[#6b5d52]'}`}>读取章节…</div>
                  ) : (
                    <div className="space-y-0.5 p-1">
                      {chapters.map((chapter, chapterIndex) => {
                        const path = `${b.dir}/${chapter.chapterFile}`
                        const chapterActive = activeChapterPath === path
                        const recent = recentChapterPath === path
                        const hasAiNote = !!notesList?.some(entry => entry.meta.source === 'book'
                          && entry.meta.ai_generated_at
                          && entry.meta.book === b.title
                          && noteChapter(entry) === chapter.title)
                        return (
                          <Tooltip key={chapter.chapterFile} content={chapter.title} theme={tipTheme}>
                            <button
                              type="button"
                              ref={(node) => { chapterRows.current[path] = node }}
                              data-testid={active ? `chapter-row-${chapterIndex}` : `${b.dir}-chapter-row-${chapterIndex}`}
                              onClick={() => {
                                if (active) void selectChapter(path)
                                else void selectBook(b.dir).then(() => selectChapter(path))
                              }}
                              className={`flex w-full items-center gap-2 rounded border-l-2 px-2 py-1.5 text-left text-xs transition-colors ${
                                chapterActive
                                  ? isAcademic ? 'border-l-ember bg-ember/15 text-ember' : 'border-l-[#8a3a3a] bg-[#1a1a1a]/[0.08] text-[#2a1f1a]'
                                  : isAcademic ? 'border-l-transparent text-parchment/70 hover:bg-parchment/10' : 'border-l-transparent text-[#2a1f1a]/75 hover:bg-[#1a1a1a]/[0.04]'
                              }`}
                            >
                              <span className="flex w-2 shrink-0 items-center justify-center">
                                {recent && (
                                  <span
                                    data-testid="book-recent-chapter-marker"
                                    role="img"
                                    aria-label="最近阅读"
                                    title="最近阅读"
                                    className={`h-1.5 w-1.5 rounded-full ${isAcademic ? 'bg-ember shadow-[0_0_0_3px_rgba(217,119,87,0.14)]' : 'bg-[#b0503c] shadow-[0_0_0_3px_rgba(176,80,60,0.12)]'}`}
                                  />
                                )}
                              </span>
                              <span className="min-w-0 flex-1 truncate">{chapterIndex + 1}. {chapter.title}</span>
                              {hasAiNote && (
                                <span
                                  data-testid="book-ai-note-marker"
                                  role="img"
                                  aria-label="已生成 AI 笔记"
                                  title="已生成 AI 笔记"
                                  className={`shrink-0 text-[10px] ${isAcademic ? 'text-ember/70' : 'text-[#b0503c]/70'}`}
                                >
                                  ✦
                                </span>
                              )}
                            </button>
                          </Tooltip>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
      <div className={`p-2 border-t shrink-0 ${isAcademic ? 'border-parchment/10' : 'border-[#1a1a1a]/10'}`}>
        <button
          type="button"
          data-testid="book-import-button"
          disabled={importing}
          onClick={() => void importBook()}
          className={`w-full text-xs py-2 rounded transition-colors disabled:opacity-50 ${
            isAcademic ? 'text-ember hover:bg-ember/10' : 'text-[#b0503c] hover:bg-[#1a1a1a]/[0.04]'
          }`}
        >
          {importing ? '导入中…' : '+ 导入书籍'}
        </button>
      </div>
    </div>
  )
}
