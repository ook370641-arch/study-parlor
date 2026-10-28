import fs from 'node:fs'
import path from 'node:path'
import { dialog, BrowserWindow, ipcMain } from 'electron'
import matter from 'gray-matter'
import type { AppConfig } from '../env'
import type { BookEntry, BookTocItem, ChapterMeta } from '@shared/index'
import { scanBooks, readBookJson, assertInsideBooks, booksDirAbs, importPdfBook, reparseBook, BookImportError } from '../lib/books'
import { importStructuredBundle, buildDemoStructuredBundle } from '../lib/docflow-import'
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
      ...(b.parserKind ? { parserKind: b.parserKind } : {}),
      ...(b.parserNote ? { parserNote: b.parserNote } : {}),
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
    let pdfPath = e2e ? process.env.E2E_BOOK_IMPORT_PATH : undefined
    if (!pdfPath) {
      const win = BrowserWindow.fromWebContents(event.sender)
      const options = {
        properties: ['openFile' as const],
        filters: [{ name: 'PDF 书籍', extensions: ['pdf'] }],
      }
      const r = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
      if (r.canceled || r.filePaths.length === 0) return null
      pdfPath = r.filePaths[0]
    }
    if (path.extname(pdfPath).toLowerCase() !== '.pdf') return { error: '仅支持 PDF 格式' }
    try {
      const book = await importPdfBook(cfg.libraryPath, pdfPath)
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

  // 结构化产物导入（对照实验）：离线样本，不发起任何网络请求。
  // 写入契约与 PDF 导入完全一致，因此书架/章节/导读/旁注/笔记零改动可用。
  ipcMain.handle('books:importStructuredDemo', async () => {
    try {
      const book = importStructuredBundle(cfg.libraryPath, buildDemoStructuredBundle())
      const entry: BookEntry = {
        dir: book.dir,
        title: book.title,
        importedAt: book.importedAt,
        hasToc: book.hasToc,
        chapterCount: book.toc.length,
        parserVersion: book.parserVersion,
        ...(book.parserKind ? { parserKind: book.parserKind } : {}),
        ...(book.parserNote ? { parserNote: book.parserNote } : {}),
      }
      return { book: entry }
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) }
    }
  })
}
