import { test, expect } from '../fixtures/electron'
import { CoverPage } from '../pages/CoverPage'
import path from 'node:path'

const SAMPLE_PDF = path.resolve(__dirname, '..', '..', 'tests', 'fixtures', 'sample.pdf')
const MARKDOWN_DIR = path.resolve(__dirname, '..', '..', 'tests', 'fixtures', 'markdown-book')
const MARKDOWN_FILES = ['10-advanced.md', '02-start.md'].map((name) => path.join(MARKDOWN_DIR, name))

test.describe('书籍导入', () => {
  // E2E 专用通道：绕过原生文件对话框，走真实 pdfjs 解析
  test.use({ extraEnv: { E2E_BOOK_IMPORT_PATH: SAMPLE_PDF } })

  test('导入 PDF → 入架 → 打开单章', async ({ window }) => {
    const cover = new CoverPage(window)
    await cover.enterName('E2E 测试员')
    await cover.goToBriefing()

    await window.getByTestId('briefing-source-book').click()
    await window.getByTestId('book-import-button').click()
    await expect(window.getByTestId('book-card-0')).toContainText('sample', { timeout: 20_000 })
    await expect(window.getByTestId('book-card-0')).toContainText('1 章')

    await window.getByTestId('book-card-0').click()
    await window.getByTestId('chapter-row-0').click()
    await expect(window.getByTestId('book-chapter-body')).toContainText('Hello PDF from Study Parlor spike')
  })
})

test.describe('Markdown 书籍导入', () => {
  test.use({ extraEnv: { E2E_BOOK_IMPORT_PATH: MARKDOWN_FILES.join(path.delimiter) } })

  test('多选 Markdown → 自然排序两章 → 阅读正文', async ({ window }) => {
    const cover = new CoverPage(window)
    await cover.enterName('E2E 测试员')
    await cover.goToBriefing()

    await window.getByTestId('briefing-source-book').click()
    await window.getByTestId('book-import-button').click()
    await expect(window.getByTestId('book-card-0')).toContainText('markdown-book')
    await expect(window.getByTestId('book-card-0')).toContainText('2 章')

    await window.getByTestId('book-card-0').click()
    await expect(window.getByTestId('chapter-row-0')).toContainText('入门')
    await expect(window.getByTestId('chapter-row-1')).toContainText('进阶')
    await window.getByTestId('chapter-row-0').click()
    await expect(window.getByTestId('book-chapter-body')).toContainText('Markdown 第一章正文')
    await expect(window.getByTestId('book-reader')).not.toContainText('页 0')
  })
})
