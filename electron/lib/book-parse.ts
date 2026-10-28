/**
 * 书籍目录解析纯逻辑（无 IO）。
 *
 * 导入 PDF 时用 pdfjs 抽出逐页文本后，这里负责：
 * 1. 从目录页文本解析「标题 + 印刷页码」
 * 2. 用首章标题定位物理页，算出印刷页码 → 物理页的偏移
 * 3. 按目录切出章节的物理页闭区间
 * 4. 把 pdfjs 的逐项文本（items）重建成视觉行 → 段落 → markdown
 */

export interface TocEntry {
  title: string
  printedPage: number
}

/** 物理页 1-based 闭区间 */
export interface ChapterSlice {
  title: string
  startPage: number
  endPage: number
}

const TOC_HEADER = /^(table of contents|contents|目录)$/i
const NUMBER_LINE = /^\d{1,4}$/

/**
 * 解析单页文本为目录。不是目录页（无表头或无法配对）返回 null。
 * 支持三种抽取布局：
 * - 行内「标题 页码」（多数中文书）
 * - 行内「页码 标题」（页码列在左的表格型目录，JTBD 实测）
 * - 分块：标题连续成块 + 页码连续成块（pdfjs 双栏读取顺序）
 */
export function parseTocPage(pageText: string): TocEntry[] | null {
  const lines = pageText.split('\n').map((l) => l.trim()).filter(Boolean)
  const headerIdx = lines.findIndex((l) => TOC_HEADER.test(l))
  if (headerIdx < 0) return null
  const rest = lines.slice(headerIdx + 1)

  // 模式 A：行内「标题 页码」
  const inline: TocEntry[] = []
  for (const l of rest) {
    const m = l.match(/^(.+?)\s+(\d{1,4})$/)
    if (m && !NUMBER_LINE.test(m[1])) {
      inline.push({ title: m[1].trim(), printedPage: Number(m[2]) })
    }
  }
  if (inline.length >= 2) return inline

  // 模式 A2：行内「页码 标题」（页码列在左，标题列在右）
  const leading: TocEntry[] = []
  for (const l of rest) {
    const m = l.match(/^(\d{1,4})\s+(.+)$/)
    if (m && !NUMBER_LINE.test(m[2].trim())) {
      leading.push({ title: m[2].trim(), printedPage: Number(m[1]) })
    }
  }
  if (leading.length >= 2) return leading

  // 模式 B：标题块 + 页码块（页码块开始后不再收标题）
  const titles: string[] = []
  const numbers: number[] = []
  for (const l of rest) {
    if (NUMBER_LINE.test(l)) numbers.push(Number(l))
    else if (numbers.length === 0) titles.push(l)
  }
  if (titles.length >= 2 && titles.length === numbers.length) {
    return titles.map((title, i) => ({ title, printedPage: numbers[i] }))
  }
  return null
}

/**
 * 用首章标题在正文页中定位物理页，返回「物理页 - 印刷页」偏移。
 * 找不到时返回 0（按目录页码直接当物理页索引，可接受漂移）。
 */
export function calibrateOffset(toc: TocEntry[], pages: string[]): number {
  if (toc.length === 0) return 0
  const first = toc[0]
  for (let i = 0; i < pages.length; i++) {
    // 目录页本身也含有首章标题，先跳过，否则偏移会被算成 0
    if (parseTocPage(pages[i])) continue
    // 只看页首，避免正文里偶然提到章名造成误判
    if (pages[i].slice(0, 200).includes(first.title)) {
      return i + 1 - first.printedPage
    }
  }
  return 0
}

/** 按目录与偏移切章节（物理页 1-based 闭区间），末章切到 totalPages。 */
export function sliceChapters(toc: TocEntry[], offset: number, totalPages: number): ChapterSlice[] {
  return toc.map((entry, i) => {
    const startPage = entry.printedPage + offset
    const endPage = i + 1 < toc.length ? toc[i + 1].printedPage + offset - 1 : totalPages
    return { title: entry.title, startPage, endPage: Math.min(endPage, totalPages) }
  })
}

/** 章节文件名 slug：去非法字符、空白转连字符、保留中文。 */
export function chapterSlug(title: string): string {
  const slug = title
    .replace(/[\\/:*?"<>|]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .slice(0, 60)
  return slug || 'chapter'
}

// ─────────────────────────────────────────────────────────────
// 正文重建：pdfjs items → 视觉行 → 段落 → markdown
// ─────────────────────────────────────────────────────────────

/** pdfjs `getTextContent().items` 的最小结构（只取重建需要的字段）。 */
export interface RawTextItem {
  str?: string
  transform?: number[]
  width?: number
  height?: number
}

/** 拿不到字号时的兜底值（pdfjs 默认 12pt 左右）。 */
const DEFAULT_FONT_HEIGHT = 12

interface PlacedItem {
  str: string
  x: number
  y: number
  width: number
  h: number
}

interface Row {
  /** 行基准 y，取该行首个 item 的 y */
  y: number
  /** 行字号，取该行已收集 item 的最大字号（容差随行自适应） */
  h: number
  items: PlacedItem[]
}

/** item 字号：优先 height，其次 transform 的 d（缩放分量），最后兜底。 */
function itemFontHeight(item: RawTextItem): number {
  if (typeof item.height === 'number' && item.height > 0) return item.height
  const d = item.transform?.[3]
  if (typeof d === 'number' && Math.abs(d) > 0) return Math.abs(d)
  return DEFAULT_FONT_HEIGHT
}

/**
 * 视觉行。除文本外保留几何信息，供段落/标题判定使用：
 * - `y` 基线（PDF 坐标系，越大越靠上）
 * - `h` 行字号
 * - `x0` / `x1` 行左右边界（判首行缩进与短行）
 */
export interface TextRow {
  text: string
  y: number
  h: number
  x0: number
  x1: number
}

/**
 * 一页 pdfjs items → 视觉行数组（带几何信息）。
 *
 * 规则：
 * - 同一行判定：|y - rowY| ≤ 0.5 × fontHeight（容忍上标/下标的基线偏移）
 * - 行序：y 降序（PDF 坐标系 y 越大越靠上，先上后下），同行内 x 升序
 * - 行内间距 gap = cur.x - (prev.x + prev.width)：
 *   gap > 0.35 × fontHeight → 补一个半角空格（英文单词粘连的主因）；
 *   其余直接拼接（CJK 相邻不加空格）
 * - 双栏：行内出现「大间距 + 落在另一栏起始列」时拆成两条视觉行
 */
export function itemsToRows(items: RawTextItem[]): TextRow[] {
  // 没有字符串、或没有 transform（拿不到坐标）的 item 无法定位，直接跳过
  const placed: PlacedItem[] = []
  for (const item of items) {
    const str = item.str ?? ''
    if (str === '') continue
    const t = item.transform
    if (!t || t.length < 6) continue
    const x = t[4]
    const y = t[5]
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue
    const width = typeof item.width === 'number' && item.width > 0 ? item.width : 0
    placed.push({ str, x, y, width, h: itemFontHeight(item) })
  }
  if (placed.length === 0) return []

  // 先按 y 降序、同 y 按 x 升序排，后续顺序遍历即可稳定成行
  placed.sort((a, b) => {
    if (Math.abs(a.y - b.y) > 1e-6) return b.y - a.y
    return a.x - b.x
  })

  // 聚成视觉行：与行基准 y 的差在半个字号内即视为同一行
  const rows: Row[] = []
  for (const item of placed) {
    const row = rows[rows.length - 1]
    if (row && Math.abs(item.y - row.y) <= 0.5 * row.h) {
      row.items.push(item)
      if (item.h > row.h) row.h = item.h
    } else {
      rows.push({ y: item.y, h: item.h, items: [item] })
    }
  }

  // 行内拼接：按 x 升序，靠 gap 判定「补空格 / 换列 / 直接拼接」。
  // 双栏判定不能只看负 gap（按 x 升序后 gap 恒为正），要看「这一项是否落在另一个栏的起始列上」：
  // 取每行首个 item 的 x 作为候选栏起点，聚成若干栏（容差 2 字号），再由行内大间距 + 命中另一栏起点共同确认。
  const rowStarts = rows.map((r) => {
    const xs = r.items.map((i) => i.x).sort((a, b) => a - b)
    return { x: xs[0], h: r.h }
  })
  const colStarts: { x: number; h: number }[] = []
  for (const s of rowStarts) {
    const hit = colStarts.find((c) => Math.abs(c.x - s.x) <= 2 * Math.max(c.h, s.h))
    if (hit) {
      hit.x = (hit.x + s.x) / 2
    } else {
      colStarts.push({ ...s })
    }
  }
  const isOtherColumnStart = (x: number, h: number): boolean =>
    colStarts.some((c) => Math.abs(c.x - x) <= 2 * Math.max(c.h, h))

  // 行内拼接：按 x 升序，靠 gap 判定「补空格 / 换列 / 直接拼接」
  const out: TextRow[] = []
  for (const row of rows) {
    const rowItems = [...row.items].sort((a, b) => a.x - b.x)
    let seg: PlacedItem[] = []
    const flush = (): void => {
      if (seg.length === 0) return
      let acc = ''
      let prev: PlacedItem | null = null
      for (const item of seg) {
        if (prev && item.x - (prev.x + prev.width) > 0.35 * row.h) acc += ' '
        acc += item.str
        prev = item
      }
      const text = acc.trim()
      if (text) {
        out.push({
          text,
          y: row.y,
          h: row.h,
          x0: Math.min(...seg.map((i) => i.x)),
          x1: Math.max(...seg.map((i) => i.x + i.width)),
        })
      }
      seg = []
    }

    for (let k = 0; k < rowItems.length; k++) {
      const item = rowItems[k]
      const prev = k > 0 ? rowItems[k - 1] : null
      // 换列：间距至少 2 个字高（远超正常词间距），且该项正好落在另一栏的起始列上
      if (prev && item.x - (prev.x + prev.width) > 2 * row.h && isOtherColumnStart(item.x, row.h)) {
        flush()
      }
      seg.push(item)
    }
    flush()
  }
  return out
}

/** 只要文本的兼容入口（与 v2 契约一致）。 */
export function itemsToLines(items: RawTextItem[]): string[] {
  return itemsToRows(items).map((r) => r.text)
}

/** 印刷页码孤行：1-4 位数字、总长 ≤ 6（含个别空白）。 */
const PAGE_NUMBER_LINE = /^\d{1,4}$/
/** 列表标记行：项目符号 / 短横 / 星号 / 1. / 2) 等。 */
const LIST_MARKER = /^\s*(?:[•·*+-]|\d+[.)])\s+/
/** 句末标点：落在行尾即视为句子结束。 */
const SENTENCE_END = /[。！？.!?:"'”’)）\]】]$/
/** CJK 统一表意文字（含扩展 A 起始段）。 */
const CJK_CHAR = /[一-鿿]/
/** 行尾形如「字母 + 连字符」，可能是被拆开的词或复合词前缀。 */
const HYPHEN_END = /[A-Za-z]-$/
/** 折行后以小写字母开头（说明是同一个词被拆开）。 */
const LOWER_LETTER = /^[a-z]/
/** 行尾是「带连字符的复合词前缀」：21-year- / user-defined-，连字符属于原词的一部分。 */
const HYPHENATED_STEM = /[A-Za-z0-9]+-[A-Za-z0-9]+-$/

/**
 * 行数组 → 段落数组。
 *
 * 规则：
 * - 页码孤行丢弃（页眉页脚的印刷页码）
 * - 连字符还原：上一行以拉丁字母 + `-` 结尾、下一行以小写字母开头 → 去掉 `-` 拼接
 *   （`21-year-` + `old` → `21-year-old`）；下一行以大写字母开头则保留连字符（保守）
 * - 合并折行：上一行以句末标点结尾 → 不合并，另起一段；否则上一行末与下一行首
 *   都是 CJK 直接拼接，否则用单个空格连接
 * - 列表标记行强制单独成段
 * - 输入中的空字符串是硬分段
 *
 * @param opts.pageNo 仅供调用方调试定位，本函数不做标题识别（没有字号信息）
 */
export function linesToParagraphs(lines: string[], opts?: { pageNo?: number }): string[] {
  // 本函数不消费字号，pageNo 只做调试透传，明确忽略
  void opts

  const paras: string[] = []
  let buf: string | null = null

  const flush = (): void => {
    if (buf === null) return
    const text = buf.trim()
    if (text) paras.push(text)
    buf = null
  }

  for (const raw of lines) {
    const line = raw.trim()

    // 空行 = 硬分段
    if (line === '') {
      flush()
      continue
    }

    // 页码孤行直接丢弃，且不打断当前段落
    if (line.length <= 6 && PAGE_NUMBER_LINE.test(line)) continue

    // 列表标记行强制单独成段
    if (LIST_MARKER.test(line)) {
      flush()
      paras.push(line)
      continue
    }

    if (buf === null) {
      buf = line
      continue
    }

    // 连字符还原：词尾被拆开（下一行小写开头）时去掉连字符
    // 例外一：行尾已是复合词前缀（21-year- / user-defined-），连字符属于原词，保留后直接拼接
    // 例外二：下一行大写开头视为复合词换行（self-/Esteem），保留连字符且直接拼接
    if (HYPHEN_END.test(buf)) {
      if (HYPHENATED_STEM.test(buf)) {
        buf += line
        continue
      }
      if (LOWER_LETTER.test(line)) {
        buf = buf.slice(0, -1) + line
        continue
      }
      if (/^[A-Z]/.test(line)) {
        buf += line
        continue
      }
    }

    // 上一行以句末标点结尾 → 句子已结束，另起一段
    if (SENTENCE_END.test(buf)) {
      flush()
      buf = line
      continue
    }

    // 普通折行：CJK 相邻不加空格，其余用单空格
    const prevChar = buf.slice(-1)
    const nextChar = line.slice(0, 1)
    buf += CJK_CHAR.test(prevChar) && CJK_CHAR.test(nextChar) ? line : ' ' + line
  }

  flush()
  return paras
}

/** 段落数组 → markdown 正文（段间空行）。 */
export function paragraphsToMarkdown(paras: string[]): string {
  return paras.filter(Boolean).join('\n\n')
}

// ─────────────────────────────────────────────────────────────
// 版面重建：视觉行 → 标题 / 段落（用行距、字号、缩进判边界）
// ─────────────────────────────────────────────────────────────

/** 标题层级只用 h2 / h3：h1 留给章节标题（阅读器用 frontmatter 里的 title 渲染）。 */
export type BlockKind = 'h2' | 'h3' | 'p'

export interface TextBlock {
  kind: BlockKind
  text: string
}

function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = sorted.length >> 1
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/** 页内正文字号：出现次数最多的行高（并列时取较小值），比中位数更抗标题干扰。 */
function dominantHeight(rows: TextRow[]): number {
  const buckets = new Map<number, number>()
  for (const r of rows) {
    const key = Math.round(r.h * 2) / 2
    buckets.set(key, (buckets.get(key) ?? 0) + 1)
  }
  let best = DEFAULT_FONT_HEIGHT
  let bestCount = -1
  for (const [h, count] of buckets) {
    if (count > bestCount || (count === bestCount && h < best)) {
      best = h
      bestCount = count
    }
  }
  return best
}

/**
 * 视觉行 → 结构化块。相比 `linesToParagraphs`（只看标点）多用了三种版面信号：
 * 1. 行距：`gap > 1.4 × 页内常规行距` 即新段（书籍段间距常是行距的 1.5–2 倍）
 * 2. 字号：`行高 ≥ 1.45 × 正文字号` → `##`；`≥ 1.2 ×` → `###`
 * 3. 缩进 / 短行：首行缩进、上一行明显短于页宽且下一行回到左边距 → 新段
 *
 * 拿不到有效行距（整页只有一行、或双栏导致行距失真）时退回标点判段，
 * 不会把整页并成一段。
 *
 * 已知边界：表格单元格仍会被拍平成文本行；双栏页的左右栏会按 y 交替，
 * 段落顺序可能与阅读顺序不一致。
 */
export function rowsToBlocks(rows: TextRow[], opts: { pageHeight?: number } = {}): TextBlock[] {
  if (rows.length === 0) return []

  const bodyH = dominantHeight(rows)
  const pageH = opts.pageHeight

  // 页码孤行 + 页眉页脚（页顶/页底 6% 区域内的短行）直接丢弃
  const kept = rows.filter((r) => {
    const text = r.text.trim()
    if (!text) return false
    if (text.length <= 6 && PAGE_NUMBER_LINE.test(text)) return false
    if (pageH && r.h <= bodyH * 1.2 && text.length < 60) {
      if (r.y > pageH * 0.94 || r.y < pageH * 0.06) return false
    }
    return true
  })
  if (kept.length === 0) return []

  const bodyRows = kept.filter((r) => r.h < bodyH * 1.15)
  const widths = bodyRows.map((r) => r.x1 - r.x0).filter((w) => w > 0)
  const maxWidth = widths.length > 0 ? Math.max(...widths) : 0
  // 正文左边距：只取满行（≥ 半页宽）的起点，避免被居中的标题带偏
  const fullLineStarts = bodyRows.filter((r) => r.x1 - r.x0 >= maxWidth * 0.5).map((r) => r.x0)
  const bodyLeft =
    fullLineStarts.length > 0 ? Math.min(...fullLineStarts) : Math.min(...kept.map((r) => r.x0))

  const gaps: number[] = []
  for (let i = 1; i < kept.length; i++) {
    const gap = kept[i - 1].y - kept[i].y
    if (gap > bodyH * 0.5 && gap <= bodyH * 4) gaps.push(gap)
  }
  const typicalGap = median(gaps)

  const blocks: TextBlock[] = []
  let buf = ''
  const flush = (): void => {
    const text = buf.trim()
    if (text) blocks.push({ kind: 'p', text })
    buf = ''
  }

  for (let i = 0; i < kept.length; i++) {
    const row = kept[i]
    const prev = i > 0 ? kept[i - 1] : null
    const ratio = row.h / bodyH

    if (ratio >= 1.2) {
      const level: BlockKind = ratio >= 1.45 ? 'h2' : 'h3'
      const last = blocks[blocks.length - 1]
      const gapToPrev = prev ? prev.y - row.y : Number.POSITIVE_INFINITY
      // 多行长标题：上一行也是同字号标题、且行距正常 → 续到同一个标题里，
      // 否则会被拆成 `### 前半句` / `### 后半句` 两行标题
      const continuesHeading =
        !!last &&
        last.kind === level &&
        prev !== null &&
        prev.h / bodyH >= 1.2 &&
        gapToPrev <= (typicalGap ?? bodyH) * 1.5
      if (continuesHeading) {
        const prevChar = last.text.slice(-1)
        const nextChar = row.text.slice(0, 1)
        last.text += CJK_CHAR.test(prevChar) && CJK_CHAR.test(nextChar) ? row.text : ' ' + row.text
      } else {
        flush()
        blocks.push({ kind: level, text: row.text })
      }
      continue
    }

    // 列表标记行独立成段，不参与折行合并
    if (LIST_MARKER.test(row.text)) {
      flush()
      blocks.push({ kind: 'p', text: row.text })
      continue
    }

    if (!prev) {
      buf = row.text
      continue
    }

    const gap = prev.y - row.y
    const prevWasHeading = prev.h / bodyH >= 1.2
    const prevWasList = LIST_MARKER.test(prev.text)
    const prevShort =
      maxWidth > 0 && prev.h / bodyH < 1.2 && prev.x1 - prev.x0 < maxWidth * 0.8
    const atLeft = row.x0 <= bodyLeft + bodyH * 0.6
    const indented = row.x0 > bodyLeft + bodyH * 0.6

    const bigGap =
      typicalGap !== null
        ? gap > Math.max(typicalGap * 1.4, bodyH * 1.5)
        : SENTENCE_END.test(buf)
    const shortLineBreak =
      typicalGap !== null && prevShort && atLeft && gap > typicalGap * 1.15
    const indentBreak = indented && (typicalGap === null || gap >= typicalGap * 0.9)

    if (prevWasHeading || prevWasList || bigGap || shortLineBreak || indentBreak) {
      flush()
      buf = row.text
      continue
    }

    // 同一段内的折行合并（与 linesToParagraphs 的连字符规则保持一致）
    if (HYPHEN_END.test(buf)) {
      if (HYPHENATED_STEM.test(buf)) {
        buf += row.text
        continue
      }
      if (LOWER_LETTER.test(row.text)) {
        buf = buf.slice(0, -1) + row.text
        continue
      }
      if (/^[A-Z]/.test(row.text)) {
        buf += row.text
        continue
      }
    }

    const prevChar = buf.slice(-1)
    const nextChar = row.text.slice(0, 1)
    buf += CJK_CHAR.test(prevChar) && CJK_CHAR.test(nextChar) ? row.text : ' ' + row.text
  }

  flush()
  return blocks
}

/** 结构化块 → markdown（标题加 `##` / `###`，段间空行）。 */
export function blocksToMarkdown(blocks: TextBlock[]): string {
  return blocks
    .filter((b) => b.text.trim())
    .map((b) => (b.kind === 'h2' ? `## ${b.text}` : b.kind === 'h3' ? `### ${b.text}` : b.text))
    .join('\n\n')
}
