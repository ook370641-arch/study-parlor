import { test, expect } from '../fixtures/electron'
import { CoverPage } from '../pages/CoverPage'
import path from 'node:path'

const SAMPLE_PDF = path.resolve(__dirname, '..', '..', 'tests', 'fixtures', 'sample.pdf')

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
