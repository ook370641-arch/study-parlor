import fs from 'node:fs'
import path from 'node:path'
import { dialog, BrowserWindow, ipcMain } from 'electron'
import matter from 'gray-matter'
import type { AppConfig } from '../env'
import type { BookEntry, BookTocItem, ChapterMeta } from '@shared/index'
import { scanBooks, readBookJson, assertInsideBooks, booksDirAbs, importPdfBook, importMarkdownBook, reparseBook, BookImportError } from '../lib/books'
import { generateBookOverview } from '../lib/llm-tasks'

export function registerBooksIpc(cfg: AppConfig) {
  ipcMain.handle('books:list', (): BookEntry[] =>
    scanBooks(cfg.libraryPath).map((b) => ({
      dir: b.dir,
      title: b.title,
      importedAt: b.importedAt,
      hasToc: b.hasToc,
      chapterCount: b.chapterCount,
      ...(b.bookGuide ? { bookGuide: b.bookGuide.content } : {}),
      ...(typeof b.parserVersion === 'number' ? { parserVersion: b.parserVersion } : {}),
    }))
  )

  ipcMain.handle('books:chapters', (_e, a: { bookDir: string }): BookTocItem[] => {
    assertInsideBooks(cfg.libraryPath, a.bookDir)
    return readBookJson(a.bookDir)?.toc ?? []
  })

  ipcMain.handle('books:readChapter', (_e, a: { chapterPath: string }) => {
    assertInsideBooks(cfg.libraryPath, a.chapterPath)
    const raw = fs.readFileSync(a.chapterPath, 'utf8')
    const d = matter(raw)
    const fm = d.data as Record<string, unknown>
    const meta: ChapterMeta = {
      title: typeof fm.title === 'string' ? fm.title : path.basename(a.chapterPath, '.md'),
      chapterIndex: typeof fm.chapter_index === 'number' ? fm.chapter_index : 0,
      pageRange: Array.isArray(fm.page_range) ? (fm.page_range as [number, number]) : [0, 0],
    }
    return { content: d.content.trim(), meta }
  })

  ipcMain.handle('books:delete', (_e, a: { bookDir: string }) => {
    assertInsideBooks(cfg.libraryPath, a.bookDir)
    if (path.dirname(path.resolve(a.bookDir)) !== path.resolve(booksDirAbs(cfg.libraryPath))) {
      throw new Error('books:delete only accepts a direct child of books/')
    }
    fs.rmSync(a.bookDir, { recursive: true, force: true })
  })

  ipcMain.handle('books:import', async (event) => {
    // E2E 通道：仅在测试环境生效，生产环境始终走原生文件对话框
    const e2e = process.env.NODE_ENV === 'test' && !!process.env.E2E_CONFIG_DIR
    let filePaths = e2e && process.env.E2E_BOOK_IMPORT_PATH
      ? process.env.E2E_BOOK_IMPORT_PATH.split(path.delimiter)
      : []
    if (filePaths.length === 0) {
      const win = BrowserWindow.fromWebContents(event.sender)
      const options = {
        properties: ['openFile' as const, 'multiSelections' as const],
        filters: [{ name: 'PDF 书籍或 Markdown 文档', extensions: ['pdf', 'md'] }],
      }
      const r = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
      if (r.canceled || r.filePaths.length === 0) return null
      filePaths = r.filePaths
    }
    const isPdf = filePaths.length === 1 && path.extname(filePaths[0]).toLowerCase() === '.pdf'
    const isMarkdownSequence = filePaths.every((filePath) => path.extname(filePath).toLowerCase() === '.md')
    if (!isPdf && !isMarkdownSequence) return { error: '请选择一本 PDF，或同一文档序列的多个 Markdown 文件' }
    try {
      const book = isPdf
        ? await importPdfBook(cfg.libraryPath, filePaths[0])
        : await importMarkdownBook(cfg.libraryPath, filePaths)
      const entry: BookEntry = {
        dir: book.dir,
        title: book.title,
        importedAt: book.importedAt,
        hasToc: book.hasToc,
        chapterCount: book.toc.length,
      }
      return { book: entry }
    } catch (err) {
      if (err instanceof BookImportError && err.code === 'SCANNED_PDF') {
        return { error: '扫描版 PDF（无文字层）暂不支持导入' }
      }
      return { error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('books:reparse', async (_e, a: { bookDir: string }) => {
    try {
      const book = await reparseBook(cfg.libraryPath, a.bookDir)
      const entry: BookEntry = {
        dir: book.dir,
        title: book.title,
        importedAt: book.importedAt,
        hasToc: book.hasToc,
        chapterCount: book.toc.length,
        parserVersion: book.parserVersion,
      }
      return { ok: true as const, book: entry }
    } catch (err) {
      if (err instanceof BookImportError && err.code === 'SCANNED_PDF') {
        return { ok: false as const, error: '扫描版 PDF（无文字层）暂不支持导入' }
      }
      return { ok: false as const, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('books:bookGuide', async (_e, a: { bookDir: string }) => {
    assertInsideBooks(cfg.libraryPath, a.bookDir)
    return { content: await generateBookOverview(cfg, a.bookDir) }
  })
}
