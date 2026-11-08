import { useState } from 'react'
import { useStore } from '@/store'
import { GuideSidebar } from './GuideSidebar'
import { ArticleCompanionBoard } from './ArticleCompanionBoard'
import { noteChapter } from '@/lib/notes-list'
import type { BriefingTheme } from '@shared/index'

export type ArticleSideSource = 'anthropic' | 'book'
export type ArticlePanelMode = 'guide' | 'companion'

export function ArticleGuideTabs({ source, theme = 'academic' }: { source: ArticleSideSource; theme?: BriefingTheme }) {
  const mode = useStore((s) => s.articlePanelMode[source])
  const setMode = useStore((s) => s.setArticlePanelMode)
  const [openingNote, setOpeningNote] = useState(false)
  const companion = useStore((s) => s.articleCompanion)
  const currentNotePath = useStore((s) => {
    if (source === 'anthropic') {
      const article = s.anthropicBlogCache.articles.find((a) => a.filePath === s.anthropicReaderFilePath)
      return s.notesList?.find((note) => note.meta.url === article?.url)?.path ?? null
    }
    const book = s.booksList.find((item) => item.dir === s.activeBookDir)
    const chapter = s.activeChapter
    return s.notesList?.find((note) => note.meta.source === 'book' && note.meta.book === book?.title
      && noteChapter(note) === chapter?.meta.title
      && !/ · 标注(?: \d+)?$/.test(note.meta.title))?.path ?? null
  })
  const noteTargetReady = useStore((s) => source === 'anthropic'
    ? !!s.anthropicReaderFilePath && s.anthropicBlogCache.articles.some((a) => a.filePath === s.anthropicReaderFilePath)
    : !!s.activeChapter)

  const openNote = async () => {
    const state = useStore.getState()
    let mainKey: string
    let input: { title: string; url: string; source: 'anthropic' | 'book'; book?: string }
    if (source === 'anthropic') {
      const filePath = state.anthropicReaderFilePath
      const article = state.anthropicBlogCache.articles.find((a) => a.filePath === filePath)
      if (!filePath || !article) return
      mainKey = filePath
      input = { title: article.title, url: article.url, source: 'anthropic' }
    } else {
      const chapter = state.activeChapter
      if (!chapter) return
      const book = state.booksList.find((b) => b.dir === state.activeBookDir)
      mainKey = chapter.path
      input = { title: `${book?.title ?? '书籍'} · ${chapter.meta.title}`, url: '', source: 'book', book: book?.title }
    }
    setOpeningNote(true)
    try {
      const note = await state.findOrCreateArticleNote(input)
      await state.selectArticleCompanion(source, mainKey, note.path)
    } catch {
      state.showToast('笔记打开失败')
    } finally {
      setOpeningNote(false)
    }
  }

  const tabCls = (m: ArticlePanelMode) =>
    `text-sm tracking-[0.2em] font-serif px-3 py-1.5 rounded transition-colors ${mode === m ? 'text-ember bg-ember/10' : 'text-parchment/60 hover:text-parchment/90'}`

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="h-11 flex items-center gap-2 px-3 border-b border-parchment/10 shrink-0">
        <button data-testid={`article-panel-tab-guide-${source}`} className={tabCls('guide')} onClick={() => setMode(source, 'guide')}>导读</button>
        <button data-testid={`article-panel-tab-companion-${source}`} className={tabCls('companion')} onClick={() => setMode(source, 'companion')}>对照</button>
        {mode === 'companion' && (
          <button
            data-testid={`article-note-shortcut-${source}`}
            aria-label={source === 'anthropic' ? '打开当前文章笔记' : '打开当前章节笔记'}
            className="ml-auto flex h-9 w-9 items-center justify-center rounded border border-parchment/15 text-parchment/65 transition-colors hover:border-ember/40 hover:bg-ember/10 hover:text-ember disabled:cursor-default disabled:opacity-30 disabled:hover:border-parchment/15 disabled:hover:bg-transparent disabled:hover:text-parchment/65"
            onClick={() => void openNote()}
            disabled={!noteTargetReady || openingNote || companion?.filePath === currentNotePath}
            title={source === 'anthropic' ? '打开当前文章笔记' : '打开当前章节笔记'}
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 3.5h11a2 2 0 0 1 2 2v15H7a2 2 0 0 1-2-2v-15Z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 3.5v17M11 8h4M11 11.5h4" />
            </svg>
          </button>
        )}
      </div>
      {mode === 'guide' ? (
        <div className="flex-1 min-h-0 overflow-hidden"><GuideSidebar theme={theme} /></div>
      ) : (
        <ArticleCompanionBoard theme={theme} />
      )}
    </div>
  )
}
