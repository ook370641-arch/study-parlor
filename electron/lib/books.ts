/**
 * 书籍库（<学习库>/books/）读写与导入编排。
 *
 * 目录结构：
 *   books/<书名>/source.pdf
 *   books/<书名>/book.json
 *   books/<书名>/chapters/NN-slug.md
 *
 * 章节是真实 md 文件，导读 / 旁注 / 对照等既有能力按普通文章复用。
 */
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import matter from 'gray-matter'
import * as electron from 'electron'
import {
  parseTocPage,
  calibrateOffset,
  sliceChapters,
  chapterSlug,
  itemsToRows,
  rowsToBlocks,
  blocksToMarkdown,
  type ChapterSlice,
  type RawTextItem,
} from './book-parse'

export const BOOKS_DIR = 'books'

/**
 * 解析器版本，写入 book.json。
 * 1 = 旧版行拼接（正文档落挤在一起）；2 = items → 视觉行 → 段落重建；
 * 3 = 再加行距/字号/缩进判段与标题层级（`##` / `###`）。
 * 缺省视为 1，前端据此提示「可重新解析」。
 */
export const BOOK_PARSER_VERSION = 3

export interface BookTocItem {
  title: string
  chapterFile: string
  pageStart: number
  pageEnd: number
}

export interface BookJson {
  title: string
  importedAt: string
  sourceFile: string
  hasToc: boolean
  toc: BookTocItem[]
  bookGuide?: { content: string; generatedAt: string }
  /** 解析器版本；缺失视为 1（旧解析产物） */
  parserVersion?: number
  /** 解析来源：缺省视为 pdfjs（本地文本抽取）；docflow-bundle 表示外部结构化产物 */
  parserKind?: 'pdfjs' | 'docflow-bundle'
  /** 解析器说明（结构化来源的追溯信息，展示在书架卡片） */
  parserNote?: string
}

export type ScannedBook = BookJson & { dir: string; chapterCount: number }

export class BookImportError extends Error {
  code: 'SCANNED_PDF' | 'PDF_READ_ERROR'

  constructor(code: 'SCANNED_PDF' | 'PDF_READ_ERROR', message: string) {
    super(message)
    this.code = code
  }
}

export function booksDirAbs(lib: string): string {
  return path.join(lib, BOOKS_DIR)
}

function isTocItem(value: unknown): value is BookTocItem {
  const o = value as Record<string, unknown> | null
  return (
    !!o &&
    typeof o.title === 'string' &&
    o.title.trim().length > 0 &&
    typeof o.chapterFile === 'string' &&
    o.chapterFile.startsWith('chapters/') &&
    typeof o.pageStart === 'number' &&
    typeof o.pageEnd === 'number'
  )
}

export function readBookJson(dirAbs: string): BookJson | null {
  try {
    const raw = fs.readFileSync(path.join(dirAbs, 'book.json'), 'utf8')
    const data = JSON.parse(raw) as Record<string, unknown>
    if (typeof data.title !== 'string' || !data.title.trim()) return null
    if (typeof data.importedAt !== 'string' || Number.isNaN(Date.parse(data.importedAt))) return null
    if (typeof data.hasToc !== 'boolean' || !Array.isArray(data.toc) || data.toc.length === 0) return null
    if (!data.toc.every(isTocItem)) return null
    const bookGuide =
      data.bookGuide &&
      typeof (data.bookGuide as Record<string, unknown>).content === 'string' &&
      typeof (data.bookGuide as Record<string, unknown>).generatedAt === 'string'
        ? (data.bookGuide as BookJson['bookGuide'])
        : undefined
    return {
      title: data.title,
      importedAt: data.importedAt,
      sourceFile: typeof data.sourceFile === 'string' ? data.sourceFile : 'source.pdf',
      hasToc: data.hasToc,
      toc: data.toc,
      ...(bookGuide ? { bookGuide } : {}),
      // 旧书没有该字段：保持「不存在」，交给前端按 1 处理
      ...(typeof data.parserVersion === 'number' && Number.isFinite(data.parserVersion)
        ? { parserVersion: data.parserVersion }
        : {}),
      ...(data.parserKind === 'docflow-bundle' || data.parserKind === 'pdfjs'
        ? { parserKind: data.parserKind }
        : {}),
      ...(typeof data.parserNote === 'string' && data.parserNote ? { parserNote: data.parserNote } : {}),
    }
  } catch {
    return null
  }
}

/** tmp + rename 原子写，避免写一半被扫描到坏数据。 */
export function writeBookJson(dirAbs: string, data: BookJson): void {
  fs.mkdirSync(dirAbs, { recursive: true })
  const target = path.join(dirAbs, 'book.json')
  const tmp = target + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8')
  fs.renameSync(tmp, target)
}

export function scanBooks(lib: string): ScannedBook[] {
  const root = booksDirAbs(lib)
  if (!fs.existsSync(root)) return []
  const out: ScannedBook[] = []
  for (const name of fs.readdirSync(root)) {
    // 跳过导入事务的 .tmp-import-* 中间目录；其余（含以点开头的书名）正常扫描
    if (name.startsWith('.tmp-import-')) continue
    const dirAbs = path.join(root, name)
    try {
      if (!fs.statSync(dirAbs).isDirectory()) continue
      const data = readBookJson(dirAbs)
      if (!data) continue
      out.push({ ...data, dir: dirAbs, chapterCount: data.toc.length })
    } catch {
      // 单本坏数据不应拖垮整个书架
      continue
    }
  }
  // importedAt 已在 readBookJson 校验为 ISO 字符串；再兜底 String() 防止坏数据混入排序
  return out.sort((a, b) => String(b.importedAt).localeCompare(String(a.importedAt)))
}

/** 按闭区间拼接页文本，页间空一行（Markdown 段落分隔）。 */
export function buildChapterBody(pages: string[], slice: ChapterSlice): string {
  return pages.slice(slice.startPage - 1, slice.endPage).join('\n\n')
}

export function assertInsideBooks(lib: string, target: string): void {
  const root = path.resolve(booksDirAbs(lib))
  const resolved = path.resolve(target)
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new Error(`Refusing to access outside books dir: ${resolved}`)
  }
}

const ILLEGAL = /[\\/:*?"<>|]/g
// Windows 设备名不能作为目录名（macOS 上也会产生难以清理的目录）
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i

/** 书名 → 目录名。拒绝 `.`/`..`/Windows 保留名，去掉结尾点与空格。 */
export function sanitizeBookDirName(title: string): string {
  const cleaned = title
    .replace(ILLEGAL, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60)
    // 截断后可能又出现结尾点/空格，再清一次
    .replace(/[. ]+$/g, '')
  if (!cleaned || cleaned === '.' || cleaned === '..' || WINDOWS_RESERVED.test(cleaned)) return 'untitled'
  return cleaned
}

/** 拼接 books/ 下的直接子目录。sanitize 已去掉分隔符，这里再兜底防路径穿越。 */
function directChildDir(root: string, name: string): string {
  const abs = path.join(root, name)
  if (path.dirname(path.resolve(abs)) !== path.resolve(root)) {
    throw new Error(`Refusing to create book dir outside books/: ${abs}`)
  }
  return abs
}

function uniqueBookDir(lib: string, title: string): string {
  const base = sanitizeBookDirName(title)
  const root = booksDirAbs(lib)
  let candidate = directChildDir(root, base)
  if (!fs.existsSync(candidate)) return candidate
  const now = new Date()
  const pad = (v: number) => String(v).padStart(2, '0')
  const stamp = `${pad(now.getHours())}${pad(now.getMinutes())}`
  candidate = directChildDir(root, `${base}-${stamp}`)
  // 同一分钟内多次重名也要继续 -2、-3… 直到找到空位，绝不覆盖已有书
  let n = 2
  while (fs.existsSync(candidate)) candidate = directChildDir(root, `${base}-${stamp}-${n++}`)
  return candidate
}

function padIndex(i: number): string {
  return String(i + 1).padStart(2, '0')
}

function parseChapterTocPages(pages: string[]): { entries: ReturnType<typeof parseTocPage> } {
  // 目录前可能有版权页、致谢、长序言；扫前 50 页而不是固定 10 页
  for (const p of pages.slice(0, 50)) {
    const toc = parseTocPage(p)
    if (toc) return { entries: toc }
  }
  return { entries: null }
}

/**
 * 文字层检查：扫描版通常只有零星页码，既看总字符数，也看是否存在「有实质文字」的页。
 * 导入与重解析共用同一阈值，避免两条路径对同一本书给出不同结论。
 */
function assertHasTextLayer(pages: string[]): void {
  const totalChars = pages.reduce((n, p) => n + p.replace(/\s/g, '').length, 0)
  const substantialPages = pages.filter((p) => p.replace(/\s/g, '').length >= 10).length
  if (totalChars < 20 || substantialPages === 0) {
    throw new BookImportError('SCANNED_PDF', '扫描版 PDF（无文字层）暂不支持导入')
  }
}

/** 标题归一化：忽略大小写、空白与常见标点，用于标题/章节名比对。 */
export function normalizeHeading(s: string): string {
  return s
    .toLowerCase()
    .replace(/[\s\-–—_.,，。:：;；!?！？"'“”‘’()（）[\]【】]/g, '')
}

/**
 * 章节正文开头若重复了章节标题（PDF 页首的章名被识别成 `## 章名`），
 * 去掉它——阅读器已经用 frontmatter.title 渲染 h1。
 */
export function stripDuplicateLeadingHeading(body: string, chapterTitle: string): string {
  const trimmed = body.replace(/^\s+/, '')
  const m = trimmed.match(/^(#{2,4})\s+(.+?)\s*(?:\n|$)/)
  if (!m || normalizeHeading(m[2]) !== normalizeHeading(chapterTitle)) return body
  return trimmed.slice(m[0].length).replace(/^\s+/, '')
}

function guidePathFor(chapterFile: string): string {
  return chapterFile.replace(/\.md$/, '.guide.md')
}

function sameTitles(a: BookTocItem[], b: BookTocItem[]): boolean {
  return (
    a.length === b.length &&
    a.every((t, i) => normalizeHeading(t.title) === normalizeHeading(b[i].title))
  )
}

/**
 * 逐页文本 → toc + 章节 md，写入 dir/chapters/。
 * 导入与「旧书重新解析」共用这一份目录解析 / 页码偏移 / 切章逻辑，防止两套实现漂移。
 *
 * 章节 md 直接写入目标目录：调用方要么在临时目录里写（最终整体 rename），
 * 要么已把冲突的旧 chapters/ 挪走，故无需对每个 md 做 tmp+rename。
 */
function writeChaptersFromPages(
  dir: string,
  pages: string[],
  title: string,
  /** 目录页解析用的原始视觉行（每页一个字符串）。缺省回退到 pages——
   *  pages 是段落化产物，会丢掉页码孤行，不能直接喂给 parseTocPage。 */
  rawPages?: string[]
): { hasToc: boolean; toc: BookTocItem[] } {
  fs.mkdirSync(path.join(dir, 'chapters'), { recursive: true })

  const structPages = rawPages ?? pages
  const { entries: tocEntries } = parseChapterTocPages(structPages)
  const hasToc = !!tocEntries && tocEntries.length > 0
  const offset = hasToc ? calibrateOffset(tocEntries, structPages) : 0
  const slices: ChapterSlice[] = hasToc
    ? sliceChapters(tocEntries, offset, pages.length)
    : [{ title, startPage: 1, endPage: pages.length }]

  const toc: BookTocItem[] = slices.map((s, i) => {
    const chapterFile = `chapters/${padIndex(i)}-${chapterSlug(s.title)}.md`
    const body = stripDuplicateLeadingHeading(buildChapterBody(pages, s), s.title)
    const md = matter.stringify(`\n${body.trim()}\n`, {
      title: s.title,
      chapter_index: i + 1,
      page_range: [s.startPage - offset, s.endPage - offset],
    })
    fs.writeFileSync(path.join(dir, chapterFile), md, 'utf8')
    return { title: s.title, chapterFile, pageStart: s.startPage, pageEnd: s.endPage }
  })

  return { hasToc, toc }
}

/**
 * 导入编排核心。与 pdfjs 解耦：调用方传入逐页文本，便于单测。
 * - 文字层过少 → SCANNED_PDF
 * - 有目录页 → 按章切分；无目录页 → 整书单章
 */
export async function __test__importFromPages(
  lib: string,
  srcPdfPath: string,
  title: string,
  pages: string[],
  /** 目录页解析用的原始视觉行；缺省回退到 pages（测试常只给一份文本） */
  rawPages?: string[]
): Promise<BookJson & { dir: string }> {
  assertHasTextLayer(pages)

  const root = booksDirAbs(lib)
  fs.mkdirSync(root, { recursive: true })
  // 先在临时目录完成全部写入，成功后再 rename 成正式书目；失败不残留半成品
  const tmpDir = fs.mkdtempSync(path.join(root, '.tmp-import-'))
  try {
    const copiedPdf = path.join(tmpDir, 'source.pdf')
    fs.copyFileSync(srcPdfPath, copiedPdf)
    // 保留源文件 mtime（含亚毫秒位），供「同一文件重复导入」幂等判断使用
    const srcStat = fs.statSync(srcPdfPath)
    fs.utimesSync(copiedPdf, srcStat.atimeMs / 1000, srcStat.mtimeMs / 1000)

    // 最终 rename 是目录级原子操作，外部永远看不到只写了一半的章节
    const { hasToc, toc } = writeChaptersFromPages(tmpDir, pages, title, rawPages)

    const json: BookJson = {
      title,
      importedAt: new Date().toISOString(),
      sourceFile: 'source.pdf',
      hasToc,
      toc,
      parserVersion: BOOK_PARSER_VERSION,
    }
    writeBookJson(tmpDir, json)

    // 并发导入时目标目录可能刚被占用：重新计算直到 rename 成功
    for (;;) {
      const finalDir = uniqueBookDir(lib, title)
      try {
        fs.renameSync(tmpDir, finalDir)
        return { ...json, dir: finalDir }
      } catch (err) {
        const code = (err as NodeJS.ErrnoException).code
        if (code === 'EEXIST' || code === 'ENOTEMPTY') continue
        throw err
      }
    }
  } catch (err) {
    fs.rmSync(tmpDir, { recursive: true, force: true })
    throw err
  }
}

// ── pdfjs 文本抽取（与 file-preview.ts 同款加载策略）──────────────

interface PdfjsPage {
  getTextContent(): Promise<{ items: RawTextItem[] }>
  /** 可选：拿页面高度用于过滤页眉页脚；缺失时只按文本规则过滤 */
  getViewport?(opts: { scale: number }): { height: number }
}

interface PdfjsDocument {
  numPages: number
  getPage(n: number): Promise<PdfjsPage>
  destroy(): Promise<void>
}

interface PdfjsModule {
  getDocument(src: Record<string, unknown>): { promise: Promise<PdfjsDocument> }
}

function pdfjsDistDir(): string {
  try {
    const app = (electron as unknown as { app?: { getAppPath?: () => string } }).app
    const getAppPath = app?.getAppPath
    const base = typeof getAppPath === 'function' ? getAppPath() : ''
    if (base) return path.join(base, 'node_modules', 'pdfjs-dist')
  } catch {
    /* electron 不可用（vitest）→ cwd 兜底 */
  }
  return path.join(process.cwd(), 'node_modules', 'pdfjs-dist')
}

let pdfjsPromise: Promise<PdfjsModule> | null = null
function loadPdfjs(): Promise<PdfjsModule> {
  if (!pdfjsPromise) {
    // 运行时计算路径的动态 import：rollup 不会打包 pdfjs，worker/cmaps 相邻文件保留
    const pdfjsPath = path.join(pdfjsDistDir(), 'legacy', 'build', 'pdf.mjs')
    pdfjsPromise = import(pathToFileURL(pdfjsPath).href).then((m: { default?: PdfjsModule } & PdfjsModule) => m.default ?? m)
  }
  return pdfjsPromise
}

/**
 * 逐页抽文本，每页重建为「视觉行 → 段落 → markdown」。
 * 返回的 `pages[i]` 是第 i+1 页的 markdown 段落文本（段间空行），
 * 与 `__test__importFromPages` 的入参契约一致。
 */
export async function extractPagesText(pdfPath: string): Promise<string[]> {
  const { pages } = await extractPagesTextWithStructure(pdfPath)
  return pages
}

/**
 * 逐页抽文本，同时保留两种视图：
 * - `pages`：段落化 markdown（章节正文用，段间空行）
 * - `rawPages`：原始视觉行（目录页解析用——目录是「标题块 + 页码块」，
 *   段落化会丢掉页码孤行、把标题连成一行，`parseTocPage` 会因此失效）
 *
 * 两者都带 `[i]` = 第 i+1 页，调用方按页号对应。
 */
export async function extractPagesTextWithStructure(
  pdfPath: string
): Promise<{ pages: string[]; rawPages: string[] }> {
  const pdfjs = await loadPdfjs()
  const data = new Uint8Array(fs.readFileSync(pdfPath))
  const args: Record<string, unknown> = { data, disableWorker: true }
  const distDir = pdfjsDistDir()
  const cmapsDir = path.join(distDir, 'cmaps')
  const stdFontsDir = path.join(distDir, 'standard_fonts')
  if (fs.existsSync(cmapsDir)) {
    args.cMapUrl = pathToFileURL(cmapsDir).href + '/'
    args.cMapPacked = true
  }
  if (fs.existsSync(stdFontsDir)) args.standardFontDataUrl = pathToFileURL(stdFontsDir).href + '/'

  const doc = await pdfjs.getDocument(args).promise
  try {
    const pages: string[] = []
    const rawPages: string[] = []
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i)
      const tc = await page.getTextContent()
      const items = tc.items as RawTextItem[]
      const rows = itemsToRows(items)
      rawPages.push(rows.map((r) => r.text).join('\n'))
      const pageHeight = page.getViewport?.({ scale: 1 })?.height
      pages.push(blocksToMarkdown(rowsToBlocks(rows, { pageHeight })))
    }
    return { pages, rawPages }
  } finally {
    try {
      await doc.destroy()
    } catch {
      /* 释放失败不阻塞导入 */
    }
  }
}

function findReusableBook(lib: string, title: string, srcPdfPath: string): ScannedBook | null {
  let srcStat: fs.Stats
  try {
    srcStat = fs.statSync(srcPdfPath)
  } catch {
    return null
  }
  for (const book of scanBooks(lib)) {
    if (book.title !== title) continue
    const copied = path.join(book.dir, book.sourceFile || 'source.pdf')
    try {
      if (path.resolve(copied) === path.resolve(srcPdfPath)) continue
      // 导入时已把 source.pdf 的 mtime 对齐原文件；毫秒取整后相同即视为同一文件，
      // 不再重复解析、不新建目录（§4.6 幂等）。取整兼容只保留整毫秒的文件系统。
      if (Math.round(fs.statSync(copied).mtimeMs) === Math.round(srcStat.mtimeMs)) return book
    } catch {
      continue
    }
  }
  return null
}

export async function importPdfBook(lib: string, srcPdfPath: string): Promise<BookJson & { dir: string }> {
  const title = path.basename(srcPdfPath, path.extname(srcPdfPath)).replace(/_/g, ' ')
  const reusable = findReusableBook(lib, title, srcPdfPath)
  if (reusable) return { ...reusable, dir: reusable.dir }
  let pages: string[]
  let rawPages: string[]
  try {
    ;({ pages, rawPages } = await extractPagesTextWithStructure(srcPdfPath))
  } catch (err) {
    throw new BookImportError('PDF_READ_ERROR', err instanceof Error ? err.message : String(err))
  }
  return __test__importFromPages(lib, srcPdfPath, title, pages, rawPages)
}

/**
 * 旧书重新解析：用当前解析器重新抽取 source.pdf，原子替换 chapters/ 并刷新 book.json。
 *
 * 原子替换顺序（任一步失败都回滚到原状态）：
 * 1. 新章节全部写进书目录内的 `.tmp-reparse-*`（外部不可见）
 * 2. `chapters/` → `chapters.bak-<ts>`（rename）
 * 3. 临时目录内的 chapters 目录 → `chapters/`（rename）
 * 4. 旧章节导读按「章节文件同名 / 标题同名」搬到新章节（对不上的丢弃）——
 *    重解析通常只改正文排版，章节边界不变，没必要让用户重生成全部导读
 * 5. book.json 原子写：覆盖 toc / parserVersion；目录未变时保留 bookGuide，
 *    目录变了才丢弃；title/importedAt/sourceFile 保持
 * 6. 成功：删除 `chapters.bak-*`；失败：删除新 `chapters/` 并把备份 rename 回来
 *
 * 失败路径下原有 chapters/ 与 book.json 保持不变，错误原样抛出。
 */
export async function reparseBook(lib: string, dirAbs: string): Promise<BookJson & { dir: string }> {
  assertInsideBooks(lib, dirAbs)
  if (path.dirname(path.resolve(dirAbs)) !== path.resolve(booksDirAbs(lib))) {
    throw new Error('reparseBook only accepts a direct child of books/')
  }

  const json = readBookJson(dirAbs)
  const pdfPath = path.join(dirAbs, json?.sourceFile || 'source.pdf')
  if (!json || !fs.existsSync(path.join(dirAbs, 'book.json')) || !fs.existsSync(pdfPath)) {
    throw new BookImportError('PDF_READ_ERROR', `书目录缺少 book.json 或 PDF：${dirAbs}`)
  }

  let pages: string[]
  let rawPages: string[]
  try {
    ;({ pages, rawPages } = await extractPagesTextWithStructure(pdfPath))
  } catch (err) {
    throw new BookImportError('PDF_READ_ERROR', err instanceof Error ? err.message : String(err))
  }
  assertHasTextLayer(pages)

  const tmpDir = fs.mkdtempSync(path.join(dirAbs, '.tmp-reparse-'))
  const chaptersDir = path.join(dirAbs, 'chapters')
  const newChapters = path.join(tmpDir, 'chapters')
  const backupDir = path.join(dirAbs, `chapters.bak-${Date.now()}`)
  let backupMoved = false
  let newChaptersInPlace = false
  let committed = false

  // 旧导读清单要在 rename 之前算好（rename 之后原目录已变成 backupDir）
  const oldGuides = new Map<string, string>()
  for (const item of json.toc) {
    const guide = guidePathFor(item.chapterFile)
    if (fs.existsSync(path.join(dirAbs, guide))) oldGuides.set(item.chapterFile, guide)
  }

  try {
    const { hasToc, toc } = writeChaptersFromPages(tmpDir, pages, json.title, rawPages)

    if (fs.existsSync(chaptersDir)) {
      fs.renameSync(chaptersDir, backupDir)
      backupMoved = true
    }
    fs.renameSync(newChapters, chaptersDir)
    newChaptersInPlace = true

    // 章节边界没变时保留旧导读：先按章节文件同名匹配，再按标题同名兜底
    const claimed = new Set<string>()
    for (const target of toc) {
      const old =
        json.toc.find((t) => t.chapterFile === target.chapterFile) ??
        json.toc.find(
          (t) => !claimed.has(t.chapterFile) && normalizeHeading(t.title) === normalizeHeading(target.title)
        )
      if (!old || claimed.has(old.chapterFile)) continue
      const oldGuide = oldGuides.get(old.chapterFile)
      if (!oldGuide) continue
      claimed.add(old.chapterFile)
      // backupDir 就是旧的 chapters/ 目录本身，导读文件在它根下
      const from = path.join(backupDir, path.basename(oldGuide))
      const to = path.join(chaptersDir, path.basename(guidePathFor(target.chapterFile)))
      if (fs.existsSync(from) && !fs.existsSync(to)) fs.copyFileSync(from, to)
    }

    const next: BookJson = {
      title: json.title,
      importedAt: json.importedAt,
      sourceFile: json.sourceFile,
      hasToc,
      toc,
      parserVersion: BOOK_PARSER_VERSION,
      // 目录没变，全书导读仍然成立；目录变了才丢弃
      ...(json.bookGuide && sameTitles(json.toc, toc) ? { bookGuide: json.bookGuide } : {}),
    }
    writeBookJson(dirAbs, next)
    committed = true

    return { ...next, dir: dirAbs }
  } catch (err) {
    // 回滚：先撤掉新 chapters/，再把备份 rename 回来，保证原数据可用
    try {
      if (newChaptersInPlace) fs.rmSync(chaptersDir, { recursive: true, force: true })
      if (backupMoved) fs.renameSync(backupDir, chaptersDir)
    } catch {
      /* 回滚失败不应掩盖原始错误；备份目录仍在磁盘上可人工恢复 */
    }
    throw err
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true })
      if (committed && backupMoved) fs.rmSync(backupDir, { recursive: true, force: true })
    } catch {
      /* 清理失败不阻塞结果 */
    }
  }
}
