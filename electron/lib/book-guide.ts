import type { BookGuideContext } from '@shared/index'

/**
 * 章节导读的书籍上下文块。prepend 到章节正文前，供 guide-v2 管线使用。
 * 只注入目录与上一章摘要，不注入其他章节正文。
 */
export function buildBookContextBlock(book: BookGuideContext, chapterTitle: string): string {
  const tocLines = book.tocTitles.map((t, i) => {
    const marker = t === chapterTitle ? ' ←（本章）' : ''
    return `${i + 1}. ${t}${marker}`
  })
  const parts = [`本书：《${book.bookTitle}》`, `全书目录：\n${tocLines.join('\n')}`]
  if (book.prevChapterSummary) {
    parts.push(`上一章导读摘要：${book.prevChapterSummary}`)
  }
  return parts.join('\n\n')
}
