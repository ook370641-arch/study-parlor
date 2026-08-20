import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import ExcelJS from 'exceljs'
import { previewFile, nonMdKindOf, XLSX_MAX_ROWS, XLSX_MAX_SHEETS, HTML_MAX_BYTES } from '../electron/lib/file-preview'

const FIXTURES = path.join(__dirname, 'fixtures')
const sample = (name: string) => path.join(FIXTURES, name)

let lib: string
beforeEach(() => {
  lib = fs.mkdtempSync(path.join(os.tmpdir(), 'wprev-'))
  fs.mkdirSync(path.join(lib, 'writing'), { recursive: true })
})
afterEach(() => { fs.rmSync(lib, { recursive: true, force: true }) })

/** 把 fixture 拷进临时学习库 writing 根级，返回相对路径。 */
function seed(name: string): string {
  const rel = `writing/${name}`
  fs.copyFileSync(sample(name), path.join(lib, rel))
  return rel
}

describe('nonMdKindOf', () => {
  it('识别 xlsx/pdf/docx，其余返回 null', () => {
    expect(nonMdKindOf('a.xlsx')).toBe('xlsx')
    expect(nonMdKindOf('a.PDF')).toBe('pdf') // 大写
    expect(nonMdKindOf('dir/a.docx')).toBe('docx')
    expect(nonMdKindOf('a.md')).toBeNull()
    expect(nonMdKindOf('a.txt')).toBeNull()
  })
})

describe('previewFile: xlsx', () => {
  it('渲染 sheet 名 + GFM 表格（表头/数据/日期格式化）', async () => {
    const rel = seed('sample.xlsx')
    const r = await previewFile(lib, rel)
    expect(r.kind).toBe('xlsx')
    expect(r.title).toBe('sample.xlsx')
    expect(r.truncated).toBe(false)
    expect(r.content).toContain('## 成绩表')
    expect(r.content).toContain('| 姓名 | 科目 | 分数 | 日期 |')
    expect(r.content).toContain('| 张三 | 数学 | 95 |')
    expect(r.content).toContain('| ---')
  })

  it('超行数/超 sheet 数截断并标记 truncated', async () => {
    const wb = new ExcelJS.Workbook()
    for (let s = 0; s < XLSX_MAX_SHEETS + 2; s++) {
      const ws = wb.addWorksheet(`Sheet${s}`)
      const header = ['A', 'B']
      ws.addRow(header)
      for (let i = 0; i <= XLSX_MAX_ROWS; i++) ws.addRow([i, `v${i}`])
    }
    const abs = path.join(lib, 'writing', 'big.xlsx')
    await wb.xlsx.writeFile(abs)
    const r = await previewFile(lib, 'writing/big.xlsx')
    expect(r.truncated).toBe(true)
    expect(r.content).toContain('仅显示前')
    // 不应出现超出上限的 sheet 标题
    expect(r.content).not.toContain(`Sheet${XLSX_MAX_SHEETS}`)
  })

  it('空工作表友好提示', async () => {
    const wb = new ExcelJS.Workbook()
    wb.addWorksheet('空表')
    const abs = path.join(lib, 'writing', 'empty.xlsx')
    await wb.xlsx.writeFile(abs)
    const r = await previewFile(lib, 'writing/empty.xlsx')
    expect(r.content).toContain('空工作表')
  })

  it('只保留有效列，不填充 30 列空单元格', async () => {
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('S')
    ws.addRow(['课程', '名称'])
    ws.addRow(['语文', '古诗'])
    const abs = path.join(lib, 'writing', '窄.xlsx')
    await wb.xlsx.writeFile(abs)
    const r = await previewFile(lib, 'writing/窄.xlsx')
    const first = r.content.split('\n').find(l => l.startsWith('| 课程'))
    expect(first).toBe('| 课程 | 名称 |')
    // 不应出现尾部空列
    expect(first).not.toMatch(/ \|  \|/)
  })

  it('合并单元格只在主单元格取值一次', async () => {
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('数据')
    ws.mergeCells('A1:C1')
    ws.getCell('A1').value = '成绩总表'
    ws.addRow(['课程', '名称'])
    ws.addRow(['语文', '古诗'])
    const abs = path.join(lib, 'writing', '合并.xlsx')
    await wb.xlsx.writeFile(abs)
    const r = await previewFile(lib, 'writing/合并.xlsx')
    // 主单元格有值，从单元格为空
    expect(r.content).toContain('| 成绩总表 |')
    expect(r.content.split('成绩总表')).toHaveLength(2) // 恰好出现一次（正文一次）
  })
})

describe('previewFile: docx', () => {
  it('文本转 markdown，粗体保留、表格转 GFM', async () => {
    const rel = seed('sample.docx')
    const r = await previewFile(lib, rel)
    expect(r.kind).toBe('docx')
    expect(r.content).toContain('标题测试')
    expect(r.content).toContain('**加粗**')
    expect(r.content).toContain('| A1 | B1 |')
    expect(r.content).toContain('| ---')
  })
})

describe('previewFile: pdf', () => {
  it('按页抽取文本，含页码标题', async () => {
    const rel = seed('sample.pdf')
    const r = await previewFile(lib, rel)
    expect(r.kind).toBe('pdf')
    expect(r.content).toContain('## 第 1 页')
    expect(r.content).toContain('Hello PDF from Study Parlor spike')
    expect(r.truncated).toBe(false)
  })

  it('无文本层 PDF 抛 PDF_NO_TEXT', async () => {
    const rel = seed('blank.pdf')
    await expect(previewFile(lib, rel)).rejects.toMatchObject({ code: 'PDF_NO_TEXT' })
  })
})

describe('previewFile: html', () => {
  const HTML = '<!DOCTYPE html><html><head><style>h1{color:red}</style></head><body><h1>报告标题</h1></body></html>'

  it('识别 html 扩展名（含大写）', () => {
    expect(nonMdKindOf('a.html')).toBe('html')
    expect(nonMdKindOf('dir/A.HTML')).toBe('html')
  })

  it('原文透传：不转 markdown、不截断，kind 为 html', async () => {
    fs.writeFileSync(path.join(lib, 'writing', 'report.html'), HTML)
    const r = await previewFile(lib, 'writing/report.html')
    expect(r.kind).toBe('html')
    expect(r.title).toBe('report.html')
    expect(r.truncated).toBe(false)
    expect(r.content).toBe(HTML)
  })

  it('超过大小上限抛 PREVIEW_PARSE_ERROR（防内嵌大图拖垮 IPC/渲染）', async () => {
    fs.writeFileSync(path.join(lib, 'writing', 'huge.html'), 'a'.repeat(HTML_MAX_BYTES + 1))
    await expect(previewFile(lib, 'writing/huge.html')).rejects.toMatchObject({ code: 'PREVIEW_PARSE_ERROR' })
  })

  it('文件不存在抛 PREVIEW_PARSE_ERROR', async () => {
    await expect(previewFile(lib, 'writing/nope.html')).rejects.toMatchObject({ code: 'PREVIEW_PARSE_ERROR' })
  })
})

describe('previewFile: 错误与边界', () => {
  it('损坏文件抛 PREVIEW_PARSE_ERROR', async () => {
    fs.writeFileSync(path.join(lib, 'writing', 'bad.xlsx'), 'not a real xlsx')
    await expect(previewFile(lib, 'writing/bad.xlsx')).rejects.toMatchObject({ code: 'PREVIEW_PARSE_ERROR' })
  })

  it('文件不存在抛 PREVIEW_PARSE_ERROR', async () => {
    await expect(previewFile(lib, 'writing/nope.xlsx')).rejects.toMatchObject({ code: 'PREVIEW_PARSE_ERROR' })
  })

  it('不支持的扩展名抛 PREVIEW_PARSE_ERROR', async () => {
    fs.writeFileSync(path.join(lib, 'writing', 'a.txt'), 'hi')
    await expect(previewFile(lib, 'writing/a.txt')).rejects.toMatchObject({ code: 'PREVIEW_PARSE_ERROR' })
  })

  it('路径穿越被拒（assertInsideRoots）', async () => {
    await expect(previewFile(lib, '../../etc/passwd.xlsx')).rejects.toMatchObject({ code: 'WRITING_PATH_FORBIDDEN' })
  })
})
