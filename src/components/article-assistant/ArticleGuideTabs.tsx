import { useState } from 'react'
import { useStore } from '@/store'
import { GuideSidebar } from './GuideSidebar'
import { ArticleCompanionBoard } from './ArticleCompanionBoard'
import type { BriefingTheme } from '@shared/index'

export type ArticleSideSource = 'anthropic' | 'book'
export type ArticlePanelMode = 'guide' | 'companion'

export function ArticleGuideTabs({ source, theme = 'academic' }: { source: ArticleSideSource; theme?: BriefingTheme }) {
  const mode = useStore((s) => s.articlePanelMode[source])
  const setMode = useStore((s) => s.setArticlePanelMode)
  const [openingNote, setOpeningNote] = useState(false)
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
    `text-[11px] tracking-[0.2em] font-serif px-2 py-1 rounded transition-colors ${mode === m ? 'text-ember bg-ember/10' : 'text-parchment/60 hover:text-parchment/90'}`

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="h-9 flex items-center gap-1 px-3 border-b border-parchment/10 shrink-0">
        <button data-testid={`article-panel-tab-guide-${source}`} className={tabCls('guide')} onClick={() => setMode(source, 'guide')}>导读</button>
        <button data-testid={`article-panel-tab-companion-${source}`} className={tabCls('companion')} onClick={() => setMode(source, 'companion')}>对照</button>
        {mode === 'companion' && (
          <button
            data-testid={`article-note-shortcut-${source}`}
            className="ml-auto text-[11px] tracking-[0.2em] font-serif px-2 py-1 rounded transition-colors text-parchment/60 hover:text-parchment/90 disabled:opacity-40"
            onClick={() => void openNote()}
            disabled={!noteTargetReady || openingNote}
            title={source === 'anthropic' ? '打开当前文章笔记' : '打开当前章节笔记'}
          >
            {openingNote ? '打开中…' : '笔记'}
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
