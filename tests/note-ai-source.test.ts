import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createNoteFile } from '@electron/lib/notes'
import { writeBookJson } from '@electron/lib/books'
import { assembleAiNoteInput, normalizeSourceUrl, readAiNoteSnapshot } from '@electron/lib/note-ai-source'

let libraryPath: string

beforeEach(() => { libraryPath = fs.mkdtempSync(path.join(os.tmpdir(), 'note-ai-source-')) })
afterEach(() => { fs.rmSync(libraryPath, { recursive: true, force: true }) })

function writeLibraryFile(relativePath: string, content: string): void {
  const absolutePath = path.join(libraryPath, relativePath)
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true })
  fs.writeFileSync(absolutePath, content, 'utf8')
}

describe('AI 笔记来源装配', () => {
  it('通过 collection 定位博客，读取导读，并只清洗模型入参中的 Base64 图片', () => {
    const note = createNoteFile(libraryPath, { title: '文章笔记', url: 'https://example.com/idea/', source: 'web', body: '前文\n![图](data:image/png;base64,AAAA)\n后文' })
    writeLibraryFile('Anthropic博客/idea.md', '---\ntitle: Idea\nsource_url: https://example.com/idea\n---\n来源正文')
    writeLibraryFile('Anthropic博客/idea.guide.md', '---\ntype: article-assistant\n---\n导读结构')
    writeLibraryFile('Anthropic博客/.collection.json', JSON.stringify({
      version: 1,
      entries: [{ sourceUrl: 'https://example.com/idea', filePath: 'Anthropic博客/idea.md', title: 'Idea', addedAt: '2026-11-05T00:00:00.000Z', origin: 'manual' }],
      dismissed: [], history: [], read: [],
    }))
    const snapshot = readAiNoteSnapshot(libraryPath, note.path)

    const input = assembleAiNoteInput(libraryPath, snapshot)

    expect(input).toEqual({
      notePath: note.path,
      title: '文章笔记',
      sourceText: '来源正文',
      guideText: '导读结构',
      originalNote: '前文\n[内嵌图片]\n后文\n',
      sourceIdentity: { type: 'blog', url: 'https://example.com/idea' },
    })
    expect(snapshot.originalContent).toBe('前文\n![图](data:image/png;base64,AAAA)\n后文\n')
    expect(snapshot.raw).toContain('data:image/png;base64,AAAA')
  })

  it('collection 未收录时递归匹配 source_url，缺导读不阻断', () => {
    const note = createNoteFile(libraryPath, { title: 'Fallback', url: 'https://example.com/fallback', source: 'anthropic' })
    writeLibraryFile('Anthropic博客/nested/article.md', '---\nsource_url: https://example.com/fallback/\n---\n兜底正文')
    writeLibraryFile('Anthropic博客/nested/article.guide.md', '---\n: broken\n---\n坏导读')

    const input = assembleAiNoteInput(libraryPath, readAiNoteSnapshot(libraryPath, note.path))

    expect(input.sourceText).toBe('兜底正文')
    expect(input.guideText).toBeNull()
  })

  it('通过书名和章节标题定位章节正文与章节导读', () => {
    const note = createNoteFile(libraryPath, { title: '书 · 第一章', url: '', source: 'book', book: '书', chapter: '第一章' })
    const bookDirectory = path.join(libraryPath, 'books', 'book-dir')
    writeBookJson(bookDirectory, {
      title: '书', importedAt: '2026-11-05T00:00:00.000Z', sourceFile: 'source.pdf', hasToc: true,
      toc: [
        { title: '序言', chapterFile: 'chapters/00.md', pageStart: 1, pageEnd: 1 },
        { title: '第一章', chapterFile: 'chapters/01.md', pageStart: 2, pageEnd: 3 },
        { title: '第二章', chapterFile: 'chapters/02.md', pageStart: 4, pageEnd: 5 },
      ],
    })
    writeLibraryFile('books/book-dir/chapters/01.md', '---\ntitle: 第一章\n---\n章节正文')
    writeLibraryFile('books/book-dir/chapters/01.guide.md', '---\ntype: article-assistant\n---\n章节导读')

    const input = assembleAiNoteInput(libraryPath, readAiNoteSnapshot(libraryPath, note.path))

    expect(input.sourceText).toBe('章节正文')
    expect(input.guideText).toBe('章节导读')
    expect(input.sourceIdentity).toEqual({ type: 'book', book: '书', chapter: '第一章' })
    expect(input.bookContext).toEqual({ bookTitle: '书', tocTitles: ['序言', '第一章', '第二章'] })
  })

  it('整书笔记只装配目录、全书导读、章节主笔记和已有全书笔记', () => {
    writeBookJson(path.join(libraryPath, 'books', 'book-dir'), {
      title: '书', importedAt: '2026-11-05T00:00:00.000Z', sourceFile: 'source.pdf', hasToc: true,
      bookGuide: { content: '短全书导读', generatedAt: '2026-11-05T00:00:00.000Z' },
      toc: [
        { title: '第一章', chapterFile: 'chapters/01.md', pageStart: 1, pageEnd: 2 },
        { title: '第二章', chapterFile: 'chapters/02.md', pageStart: 3, pageEnd: 4 },
      ],
    })
    writeLibraryFile('books/book-dir/chapters/01.md', '---\ntitle: 第一章\n---\n第一章原文不入参')
    writeLibraryFile('books/book-dir/chapters/01.guide.md', '---\ntype: article-assistant\n---\n第一章导读不入参')
    createNoteFile(libraryPath, { title: '书 · 第一章', url: '', source: 'book', book: '书', chapter: '第一章', body: '第一章笔记' })
    createNoteFile(libraryPath, { title: '书 · 第二章', url: '', source: 'book', book: '书', chapter: '第二章', body: '第二章 AI\n\n---\n\n## 原笔迹\n\n第二章原笔迹' })
    createNoteFile(libraryPath, { title: '书 · 第一章 · 标注', url: '', source: 'book', book: '书', chapter: '第一章', body: '旁注不入参' })
    const whole = createNoteFile(libraryPath, { title: '书 · 整书笔记', url: '', source: 'book', book: '书', bookScope: 'whole', body: '旧 AI 正文\n\n---\n\n## 原笔迹\n\n已有全书笔记' })

    const input = assembleAiNoteInput(libraryPath, readAiNoteSnapshot(libraryPath, whole.path))

    expect(input.sourceIdentity).toEqual({ type: 'whole-book', book: '书' })
    expect(input.guideText).toBe('短全书导读')
    expect(input.originalNote).toBe('已有全书笔记\n')
    expect(input.sourceText).toBe('全书目录\n1. 第一章\n2. 第二章\n\n## 第一章\n第一章笔记\n\n## 第二章\n第二章 AI\n\n---\n\n## 原笔迹\n\n第二章原笔迹')
    expect(input.sourceText).not.toContain('原文不入参')
    expect(input.sourceText).not.toContain('导读不入参')
    expect(input.sourceText).not.toContain('旁注不入参')
    expect(input.originalNote).not.toContain('旧 AI 正文')
  })

  it('来源无法定位或正文为空时给出稳定错误', () => {
    const missing = createNoteFile(libraryPath, { title: 'Missing', url: 'https://example.com/missing', source: 'web' })
    expect(() => assembleAiNoteInput(libraryPath, readAiNoteSnapshot(libraryPath, missing.path))).toThrow('SOURCE_NOT_FOUND')

    writeLibraryFile('Anthropic博客/empty.md', '---\nsource_url: https://example.com/missing\n---\n')
    expect(() => assembleAiNoteInput(libraryPath, readAiNoteSnapshot(libraryPath, missing.path))).toThrow('SOURCE_INVALID')
  })
})

describe('normalizeSourceUrl', () => {
  it('忽略 hash 与末尾斜线，并标准化协议和主机', () => {
    expect(normalizeSourceUrl(' HTTPS://Example.com/a/#section ')).toBe('https://example.com/a')
  })
})
