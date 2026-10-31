import { useRef } from 'react'
import { useStore } from '@/store'
import { ipc } from '@/lib/ipc'
import { MarkdownRenderer } from '@/components/md/MarkdownRenderer'
import { ArticleAnnotations } from '@/components/article-assistant/ArticleAnnotations'
import { AnnotationListButton } from '@/components/article-assistant/AnnotationListButton'
import { ArticleAssistantPanel } from '@/components/article-assistant/ArticleAssistantPanel'
import { PaintingPlate } from '@/components/briefing/PaintingPlate'
import { BriefingReaderControls } from '@/components/briefing/BriefingReaderControls'
import { Quote } from '@/components/Quote'
import type { ArticleAnnotation, BriefingTheme } from '@shared/index'

/** 章节阅读器：只读 md 渲染 + 旁注 + 右侧导读/对照。
 *
 *  这里没有「把整章存为笔记」的按钮：那个入口只会在笔记书架里建一条
 *  只有标题、没有正文的空笔记，用户看不出它存了什么（2026-10-28 走查删除）。
 *  真正的两个沉淀入口各自有内容：旁注列表里的「存」（带上原文摘录 + 备注），
 *  以及对照挑选器的「＋ 新建」（建好即放进对照槽，可以边读边写）。 */
export function BookReader({ theme }: { theme: BriefingTheme }) {
  const chapter = useStore((s) => s.activeChapter)
  const bookContext = useStore((s) => s.bookContext)
  const books = useStore((s) => s.booksList)
  const activeBookDir = useStore((s) => s.activeBookDir)
  const fontSize = useStore((s) => s.briefingFontSize)
  const increaseFontSize = useStore((s) => s.increaseBriefingFontSize)
  const decreaseFontSize = useStore((s) => s.decreaseBriefingFontSize)
  const creatingNoteRef = useRef(false)
  const bodyRef = useRef<HTMLElement | null>(null)
  const isAcademic = theme !== 'newspaper'

  const book = books.find((b) => b.dir === activeBookDir)

  if (!chapter) {
    return (
      <div data-testid="book-reader" className="relative h-full flex items-center justify-center">
        <BriefingReaderControls
          theme={theme}
          fontSize={fontSize}
          onDecrease={() => void decreaseFontSize()}
          onIncrease={() => void increaseFontSize()}
          swapTestId="book-swap-painting-button"
          fontTestIdPrefix="book"
        />
        <span className={`text-sm ${isAcademic ? 'text-parchment/40' : 'text-[#6b5d52]'}`}>选择一个章节开始阅读</span>
      </div>
    )
  }

  const createAnnotationNote = async (annotation: ArticleAnnotation) => {
    if (creatingNoteRef.current) return
    creatingNoteRef.current = true
    try {
      const title = `${book?.title ?? '书籍'} · ${chapter.meta.title} · 标注`
      const body = `> ${annotation.selectedText}\n\n${annotation.note ?? ''}`.trim()
      await ipc.notesCreate({
        title,
        url: '',
        source: 'book',
        ...(book?.title ? { book: book.title } : {}),
        ...(body ? { body } : {}),
      })
      const st = useStore.getState()
      if (st.notesList !== null) await st.loadNotes()
      st.showToast('已存为笔记')
    } catch {
      useStore.getState().showToast('存为笔记失败')
    } finally {
      creatingNoteRef.current = false
    }
  }

  return (
    <div data-testid="book-reader" className="h-full flex min-h-0">
      <div className="relative flex-1 min-w-0 min-h-0">
        <BriefingReaderControls
          theme={theme}
          fontSize={fontSize}
          onDecrease={() => void decreaseFontSize()}
          onIncrease={() => void increaseFontSize()}
          swapTestId="book-swap-painting-button"
          fontTestIdPrefix="book"
        />
        <div className="h-full overflow-y-auto overscroll-contain">
          {/* 正文栏统一宽度：画作、标题、语录、工具行、正文、旁注共用一条阅读轴，
              否则画作会占满整个面板、正文却挤在左半边。 */}
          <div className="px-8 py-6 w-full">
            {/* 画作 + 语录与文章/笔记阅读区同款：画作受左下角「并置画框」开关控制 */}
            {isAcademic && <PaintingPlate />}
            <h1 className={`font-serif text-xl mb-1 ${isAcademic ? 'text-parchment' : 'text-[#2a1f1a]'}`}>{chapter.meta.title}</h1>
            <div className={`text-[11px] mb-3 ${isAcademic ? 'text-parchment/40' : 'text-[#6b5d52]'}`}>
              第 {chapter.meta.chapterIndex} 章 · 页 {chapter.meta.pageRange[0]}–{chapter.meta.pageRange[1]}
            </div>
            <div className="mb-3 flex justify-center">
              <Quote surface="briefing" />
            </div>
            {/* 只有存在旁注时这里才有内容（AnnotationListButton 空列表返回 null） */}
            <div className="mb-5 flex flex-wrap items-center gap-2 empty:mb-0">
              <AnnotationListButton
                articlePath={chapter.path}
                theme={theme}
                briefingFontSize={fontSize}
                onCreateNote={(a) => void createAnnotationNote(a)}
              />
            </div>
            <article
              ref={bodyRef}
              data-testid="book-chapter-body"
              className={`prose max-w-none briefing-article-body ${isAcademic ? 'prose-invert' : ''} briefing-body-${theme}`}
            >
              <MarkdownRenderer
                content={chapter.content}
                fileName={`${chapter.meta.title}.md`}
                briefingStyle={isAcademic ? 'academic' : 'newspaper'}
                hideHeader
              />
            </article>
            <ArticleAnnotations
              articlePath={chapter.path}
              articleRef={bodyRef}
              theme={theme}
              briefingFontSize={fontSize}
            />
          </div>
        </div>
      </div>
      <ArticleAssistantPanel
        articleType="book-chapter"
        parentPath={chapter.path}
        articleTitle={chapter.meta.title}
        articleContent={chapter.content}
        bookContext={bookContext ?? undefined}
        autoGenerateGuide
        theme={theme}
        source="book"
      />
    </div>
  )
}
