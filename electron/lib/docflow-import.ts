/**
 * DocFlow / xParse 结构产物导入（对照实验用）。
 *
 * 这是把「文档解析层」从本地 PDF.js 文本抽取，换成一份结构化产物，
 * 用来证明：章节对象一旦标准化，下游（导读 / 旁注 / 对照 / 笔记 / 书架）
 * 不需要知道解析器是谁。
 *
 * 事实边界（不要在现场说成在线接入）：
 * - 当前没有可用的 DocFlow / xParse 凭证与公网调用条件，因此这里读取的是
 *   **本地结构样本**：manifest.json + chapters/*.md，字段形态对齐真实结构产物
 *   （章节标题、页码范围、块类型、可选 bbox）；
 * - 本模块不发起任何网络请求；
 * - 接真实服务时，替换的是 `importStructuredBundle` 的输入来源，写入契约不变。
 */
import fs from 'node:fs'
import path from 'node:path'
import matter from 'gray-matter'
import type { BookJson, BookTocItem } from './books'
import { assertInsideBooks, booksDirAbs, writeBookJson } from './books'

/** 解析来源标识：写入 book.json，书架据此提示「结构化来源」 */
export type BookParserKind = 'pdfjs' | 'docflow-bundle'

export interface StructuredChapter {
  title: string
  /** 章节 Markdown 正文（已带标题层级与阅读顺序） */
  body: string
  pageStart: number
  pageEnd: number
  /** 结构性元素统计，仅用于展示「结构产物比纯文本多了什么」 */
  blocks?: { heading?: number; table?: number; figure?: number; paragraph?: number }
}

export interface StructuredBundle {
  title: string
  sourceLabel: string
  chapters: StructuredChapter[]
  /** 生成该结构产物的解析器版本，写进 book.json 便于追溯 */
  parserNote?: string
}

const CHAPTER_SLUG_MAX = 60

function slug(title: string, index: number): string {
  const cleaned = title
    .replace(/[\\/:*?"<>|]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .slice(0, CHAPTER_SLUG_MAX)
  return `${String(index + 1).padStart(2, '0')}-${cleaned || 'chapter'}`
}

function sanitizeDirName(title: string): string {
  const cleaned = title.replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim().slice(0, 60)
  if (!cleaned || cleaned === '.' || cleaned === '..') return 'untitled'
  return cleaned
}

function uniqueDir(lib: string, title: string): string {
  const root = booksDirAbs(lib)
  const base = sanitizeDirName(title)
  let candidate = path.join(root, base)
  let n = 2
  while (fs.existsSync(candidate)) {
    candidate = path.join(root, `${base} (${n++})`)
  }
  return candidate
}

/**
 * 把结构产物写入书籍库。与 PDF 导入共用同一套目录契约：
 *   books/<书名>/book.json
 *   books/<书名>/chapters/NN-slug.md
 * 因此书架、章节列、导读、旁注、笔记零改动可用。
 */
export function importStructuredBundle(lib: string, bundle: StructuredBundle): BookJson & { dir: string } {
  if (bundle.chapters.length === 0) throw new Error('结构化产物没有任何章节')

  const root = booksDirAbs(lib)
  fs.mkdirSync(root, { recursive: true })
  // 先在临时目录写完，再整体 rename：外部永远看不到半成品书
  const tmpDir = fs.mkdtempSync(path.join(root, '.tmp-import-'))

  try {
    fs.mkdirSync(path.join(tmpDir, 'chapters'), { recursive: true })

    const toc: BookTocItem[] = bundle.chapters.map((chapter, i) => {
      const chapterFile = `chapters/${slug(chapter.title, i)}.md`
      const md = matter.stringify(`\n${chapter.body.trim()}\n`, {
        title: chapter.title,
        chapter_index: i + 1,
        page_range: [chapter.pageStart, chapter.pageEnd],
      })
      fs.writeFileSync(path.join(tmpDir, chapterFile), md, 'utf8')
      return { title: chapter.title, chapterFile, pageStart: chapter.pageStart, pageEnd: chapter.pageEnd }
    })

    const json: BookJson = {
      title: bundle.title,
      importedAt: new Date().toISOString(),
      sourceFile: bundle.sourceLabel,
      hasToc: true,
      toc,
      parserVersion: 2,
      parserKind: 'docflow-bundle',
      ...(bundle.parserNote ? { parserNote: bundle.parserNote } : {}),
    }
    writeBookJson(tmpDir, json)

    const finalDir = uniqueDir(lib, bundle.title)
    fs.renameSync(tmpDir, finalDir)
    return { ...json, dir: finalDir }
  } catch (err) {
    fs.rmSync(tmpDir, { recursive: true, force: true })
    throw err
  }
}

/**
 * 内置对照样本：同一份「公司年报型」文档的**结构化产物**。
 *
 * 正文刻意保留了表格、标题层级和摘要段——这些正是本地 PDF.js 纯文本链
 * 会拍平或丢失的结构。内容为演示素材，非真实年报原文。
 */
export function buildDemoStructuredBundle(): StructuredBundle {
  return {
    title: '结构化样本 · 文档解析对照',
    sourceLabel: 'docflow-bundle（离线样本）',
    parserNote: '离线结构样本：章节/页码/块类型对齐真实解析产物，未调用在线服务',
    chapters: [
      {
        title: '第一章 业务与产品结构',
        pageStart: 5,
        pageEnd: 12,
        body: [
          '## 1.1 两条产品线',
          '',
          '公司业务可以拆成两层：底层是**确定性文档解析**，把 PDF、扫描件、Office 转成文本、表格、标题层级、坐标与证据链；上层是**文档 Agent**，在解析结果上做分类、抽取、审核、流转。',
          '',
          '> 结构化产物与纯文本的关键差异不在「有没有字」，而在元素类型、阅读顺序与可定位坐标。',
          '',
          '## 1.2 主要财务指标',
          '',
          '| 指标 | 本期 | 上期 | 同比 |',
          '| --- | ---: | ---: | ---: |',
          '| 营业收入 | 1,000 | 820 | +22.0% |',
          '| 归母净利润 | 180 | 150 | +20.0% |',
          '| 研发投入 | 210 | 165 | +27.3% |',
          '',
          '> 表格在本样本中以真实的单元格结构保留；本地 PDF.js 纯文本链会把上表拍平成若干行文字，行列对应关系丢失。',
        ].join('\n'),
      },
      {
        title: '第二章 核心能力与边界',
        pageStart: 13,
        pageEnd: 24,
        body: [
          '## 2.1 确定性优先',
          '',
          '文档解析的第一要求不是「更聪明」，而是「不出错、可追溯」。因此能力按确定性排序：版面分析 → 元素分类 → 阅读顺序 → 表格/公式识别 → 坐标输出 → 置信度。',
          '',
          '## 2.2 失败面',
          '',
          '- 扫描质量差、印章遮挡、手写体密集时，字符识别置信度显著下降；',
          '- 跨页表格、合并单元格、无边框表格仍需规则与模型协同；',
          '- 多栏与图注混排时，阅读顺序恢复是主要误差来源。',
          '',
          '## 2.3 与纯文本抽取的对照',
          '',
          '| 维度 | 纯文本抽取 | 结构化解析 |',
          '| --- | --- | --- |',
          '| 阅读顺序 | 不保证 | 显式输出 |',
          '| 表格 | 拍平 | 单元格结构 |',
          '| 标题层级 | 需正则猜测 | 直接给出 |',
          '| 坐标证据 | 无 | 页码 + bbox + 置信度 |',
          '| 扫描件 | 不可用 | 走 OCR 链路 |',
        ].join('\n'),
      },
      {
        title: '第三章 下游任务与验证',
        pageStart: 25,
        pageEnd: 33,
        body: [
          '## 3.1 下游任务',
          '',
          '结构一旦可信，下游可以做：按章导读、段落级旁注、表格抽取、合同条款比对、审核依据回显。这些任务的共同前提是「对象可寻址」。',
          '',
          '## 3.2 怎么验证',
          '',
          '1. 章节导读完成率：结构化之后，导读是否更容易生成、且更少跑题；',
          '2. 证据回显率：审核结论中能给出页码 + 坐标的比例；',
          '3. 人工复核时间：结构化输出是否真的减少了人工定位原页的耗时。',
          '',
          '## 3.3 与本应用的关系',
          '',
          '本应用把这条链的**下游部分**做完整：书籍来源 → 章节 → 导读 → 旁注 → 笔记 → 复习。把它接上真实解析服务时，替换的是输入层，不是这一整套学习闭环。',
        ].join('\n'),
      },
    ],
  }
}

/** IPC 入口用：校验目标必须落在 books/ 内（与 PDF 导入同款约束） */
export function assertStructuredImportTarget(lib: string, dirAbs: string): void {
  assertInsideBooks(lib, dirAbs)
}
