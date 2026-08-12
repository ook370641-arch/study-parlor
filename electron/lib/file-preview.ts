import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import ExcelJS from 'exceljs'
import mammoth from 'mammoth'
import TurndownService from 'turndown'
import { app } from 'electron'
import { isNonMdExt, type NonMdKind } from '../../src/types'
import { assertInsideRoots } from './writing-tree'

// ── 预览上限（防超大文件拖垮渲染与助手上下文）──
export const XLSX_MAX_SHEETS = 5
export const XLSX_MAX_ROWS = 500
export const XLSX_MAX_COLS = 30
export const DOCX_MAX_CHARS = 50_000
export const PDF_MAX_PAGES = 30

export type PreviewOutcome = { kind: NonMdKind; title: string; content: string; truncated: boolean }

type PreviewErrorCode = 'PREVIEW_PARSE_ERROR' | 'PDF_NO_TEXT'
export function previewError(code: PreviewErrorCode, message: string): Error & { code: PreviewErrorCode } {
  const e = new Error(message) as Error & { code: PreviewErrorCode }
  e.code = code
  return e
}

/** 扩展名 → 非 md 类型；md 或其它扩展名返回 null。 */
export function nonMdKindOf(filePath: string): NonMdKind | null {
  const ext = path.extname(filePath).slice(1).toLowerCase()
  return isNonMdExt(ext) ? ext : null
}

export async function previewFile(
  lib: string,
  rel: string,
): Promise<PreviewOutcome> {
  const abs = assertInsideRoots(lib, rel)
  if (!fs.existsSync(abs)) throw previewError('PREVIEW_PARSE_ERROR', `文件不存在: ${rel}`)
  const kind = nonMdKindOf(abs)
  if (!kind) throw previewError('PREVIEW_PARSE_ERROR', `不支持的预览类型: ${rel}`)
  const title = path.basename(rel)
  try {
    if (kind === 'xlsx') return { kind, title, ...(await parseXlsx(abs)) }
    if (kind === 'docx') return { kind, title, ...(await parseDocx(abs)) }
    return { kind, title, ...(await parsePdf(abs)) }
  } catch (err) {
    // 统一映射为类型化错误码：解析库（jszip/exceljs/mammoth/pdfjs）的原始异常
    // 一律收敛为 PREVIEW_PARSE_ERROR；deliberately 抛出的 PDF_NO_TEXT 放行。
    const code = (err as Error & { code?: string })?.code
    if (code === 'PREVIEW_PARSE_ERROR' || code === 'PDF_NO_TEXT') throw err
    throw previewError('PREVIEW_PARSE_ERROR', err instanceof Error ? err.message : String(err))
  }
}

// ── xlsx ─────────────────────────────────────────────────────

function formatDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function cellToText(v: unknown): string {
  if (v == null) return ''
  if (v instanceof Date) return formatDate(v)
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>
    if (typeof o.richText === 'object' && o.richText != null) {
      return (o.richText as Array<{ text?: string }>).map(r => r.text ?? '').join('')
    }
    if (typeof o.hyperlink === 'string') return o.text != null ? String(o.text) : o.hyperlink
    if (typeof o.formula === 'string') return o.result != null ? String(o.result) : o.formula
    if (typeof o.text === 'string') return o.text
    return String(v)
  }
  return String(v)
}

/** GFM 表格单元格转义：竖线转义、换行拍平成空格。 */
function mdCell(text: string): string {
  return text.replace(/\|/g, '\\|').replace(/[\r\n]+/g, ' ').trim()
}

async function parseXlsx(absPath: string): Promise<{ content: string; truncated: boolean }> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(absPath)
  const parts: string[] = []
  let truncated = false
  const sheets = wb.worksheets.slice(0, XLSX_MAX_SHEETS)
  if (wb.worksheets.length > XLSX_MAX_SHEETS) truncated = true
  for (const ws of sheets) {
    parts.push(`## ${ws.name || 'Sheet'}`)
    parts.push('')
    const rows: string[][] = []
    ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber > XLSX_MAX_ROWS) { truncated = true; return }
      const cells: string[] = []
      for (let c = 1; c <= XLSX_MAX_COLS; c++) cells.push(mdCell(cellToText(row.getCell(c).value)))
      rows.push(cells)
    })
    if (rows.length === 0) {
      parts.push('（空工作表）')
      parts.push('')
      continue
    }
    const header = rows[0]
    parts.push(`| ${header.join(' | ')} |`)
    parts.push(`|${header.map(() => ' --- ').join('|')}|`)
    for (let i = 1; i < rows.length; i++) parts.push(`| ${rows[i].join(' | ')} |`)
    parts.push('')
  }
  if (truncated) {
    parts.push(`> ⚠️ 内容较多，仅显示前 ${XLSX_MAX_SHEETS} 个工作表、每个前 ${XLSX_MAX_ROWS} 行。`)
  }
  return { content: parts.join('\n').trim(), truncated }
}

// ── docx ─────────────────────────────────────────────────────

/** 把 mammoth 产出的 <table> 块提取为 GFM 表格，用占位标记替换，避免 turndown 压平。 */
function extractTables(html: string): { html: string; tables: string[] } {
  const tables: string[] = []
  let idx = 0
  const out = html.replace(/<table[^>]*>[\s\S]*?<\/table>/gi, (block) => {
    const rows: string[][] = []
    const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi
    let rm: RegExpExecArray | null
    while ((rm = rowRe.exec(block))) {
      const cells: string[] = []
      const cellRe = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi
      let cm: RegExpExecArray | null
      while ((cm = cellRe.exec(rm[1]))) {
        const text = cm[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
        cells.push(mdCell(text))
      }
      rows.push(cells)
    }
    if (rows.length === 0) return ''
    let md = `| ${rows[0].join(' | ')} |\n`
    md += `|${rows[0].map(() => ' --- ').join('|')}|\n`
    for (let i = 1; i < rows.length; i++) md += `| ${rows[i].join(' | ')} |\n`
    // 占位标记须能原样穿过 turndown：@@…@@ 不含 markdown 特殊字符（[ ] _ 会被转义）
    const marker = `@@TBL${idx++}@@`
    tables.push(md)
    return marker
  })
  return { html: out, tables }
}

async function parseDocx(absPath: string): Promise<{ content: string; truncated: boolean }> {
  const result = await mammoth.convertToHtml({ path: absPath })
  // 丢弃内嵌图片（mammoth 默认转 base64 data URL，会显著膨胀并打断文本阅读）
  const noImg = result.value.replace(/<img[^>]*>/gi, '')
  const { html: withMarkers, tables } = extractTables(noImg)
  const td = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' })
  let md = td.turndown(withMarkers)
  tables.forEach((t, i) => { md = md.replace(`@@TBL${i}@@`, t) })
  let truncated = false
  if (md.length > DOCX_MAX_CHARS) { md = md.slice(0, DOCX_MAX_CHARS).trimEnd(); truncated = true }
  if (truncated) md += '\n\n> ⚠️ 文档较长，已截断显示。'
  return { content: md.trim(), truncated }
}

// ── pdf ──────────────────────────────────────────────────────

interface PdfjsModule {
  getDocument(src: Record<string, unknown>): { promise: Promise<{ numPages: number; getPage(n: number): Promise<{ getTextContent(): Promise<{ items: Array<{ str?: string }> }> }>; destroy(): Promise<void> }> }
}

/**
 * 定位 node_modules/pdfjs-dist 目录。
 * - 打包：app.getAppPath()（node_modules 在 asar 内）
 * - dev/e2e/单测：process.cwd()（项目根，e2e 以项目根为 cwd 启动）
 * 测试环境 import('electron') 返回字符串路径，app 为 undefined，被 try/catch 兜底到 cwd。
 */
function pdfjsDistDir(): string {
  try {
    const getAppPath = (app as unknown as { getAppPath?: () => string } | undefined)?.getAppPath
    const base = typeof getAppPath === 'function' ? getAppPath() : ''
    if (base) return path.join(base, 'node_modules', 'pdfjs-dist')
  } catch { /* electron 不可用（vitest）→ 走 cwd 兜底 */ }
  return path.join(process.cwd(), 'node_modules', 'pdfjs-dist')
}

let _pdfjsPromise: Promise<PdfjsModule> | null = null
function loadPdfjs(): Promise<PdfjsModule> {
  if (!_pdfjsPromise) {
    // 运行时计算路径的 dynamic import（import(变量)）：rollup 无法静态解析故不打包，
    // 避免 worker/cmaps 相邻文件丢失（构建内联会打独立 chunk 导致 fake worker 加载失败）。
    // asar 内 file:// ESM import 已验证可行。
    const pdfjsPath = path.join(pdfjsDistDir(), 'legacy', 'build', 'pdf.mjs')
    _pdfjsPromise = import(pathToFileURL(pdfjsPath).href).then((m: any) => m.default ?? m)
  }
  return _pdfjsPromise
}

async function parsePdf(absPath: string): Promise<{ content: string; truncated: boolean }> {
  const pdfjs = await loadPdfjs()
  const data = new Uint8Array(fs.readFileSync(absPath))
  const getDocumentArgs: Record<string, unknown> = { data, disableWorker: true }
  // 中文 PDF 需要 cmaps/标准字体：资源目录随 pdfjs 保留在 node_modules
  const distDir = pdfjsDistDir()
  const cmapsDir = path.join(distDir, 'cmaps')
  const stdFontsDir = path.join(distDir, 'standard_fonts')
  if (fs.existsSync(cmapsDir)) {
    getDocumentArgs.cMapUrl = pathToFileURL(cmapsDir).href + '/'
    getDocumentArgs.cMapPacked = true
  }
  if (fs.existsSync(stdFontsDir)) getDocumentArgs.standardFontDataUrl = pathToFileURL(stdFontsDir).href + '/'
  const doc = await pdfjs.getDocument(getDocumentArgs).promise
  try {
    const parts: string[] = []
    let textLen = 0
    let truncated = false
    const pageCount = Math.min(doc.numPages, PDF_MAX_PAGES)
    if (doc.numPages > PDF_MAX_PAGES) truncated = true
    for (let i = 1; i <= pageCount; i++) {
      const page = await doc.getPage(i)
      const tc = await page.getTextContent()
      const text = tc.items.map(it => (typeof it.str === 'string' ? it.str : '')).join('')
      textLen += text.length
      if (i > 1) parts.push('')
      parts.push(`## 第 ${i} 页`)
      parts.push('')
      parts.push(text.trim() || '（本页无文本）')
    }
    if (textLen === 0) throw previewError('PDF_NO_TEXT', 'PDF 无文本层，可能是扫描件')
    if (truncated) parts.push('', `> ⚠️ 仅显示前 ${PDF_MAX_PAGES} 页。`)
    return { content: parts.join('\n'), truncated }
  } finally {
    try { await doc.destroy() } catch { /* 释放失败不阻塞 */ }
  }
}
