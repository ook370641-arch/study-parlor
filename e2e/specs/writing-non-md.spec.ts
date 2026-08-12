import { test, expect } from '../fixtures/electron'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { CoverPage } from '../pages/CoverPage'
import { SELECTORS } from '../helpers/selectors'
import { seedWritingTree, seedRepository, seedCatalogJson } from '../helpers/test-library'

/**
 * 写作库非 md 文件（xlsx/pdf/docx）放置与阅读。
 * - 树中显示非 md 文件，点击后只读 markdown 预览（表格）
 * - 无文本层 PDF 走 PDF_NO_TEXT 降级路径 + 系统打开兜底
 */
test.describe('@p2 writing-non-md', () => {
  const FIXTURES = path.resolve(__dirname, '..', '..', 'tests', 'fixtures')

  function seedNonMdFiles(libPath: string) {
    fs.mkdirSync(path.join(libPath, 'writing'), { recursive: true })
    fs.mkdirSync(path.join(libPath, 'repository'), { recursive: true })
    fs.copyFileSync(path.join(FIXTURES, 'sample.xlsx'), path.join(libPath, 'writing', '报表.xlsx'))
    fs.copyFileSync(path.join(FIXTURES, 'blank.pdf'), path.join(libPath, 'writing', '扫描件.pdf'))
    fs.copyFileSync(path.join(FIXTURES, 'sample.pdf'), path.join(libPath, 'repository', '论文.pdf'))
  }

  async function gotoWriting(window: any, libPath: string) {
    seedWritingTree(libPath)
    seedRepository(libPath)
    seedCatalogJson(libPath)
    seedNonMdFiles(libPath)

    const cover = new CoverPage(window)
    await cover.enterName('E2E 测试员')
    await cover.goToBriefing()
    await expect(window.locator(SELECTORS.briefing.sourceSidebar)).toBeVisible({ timeout: 10000 })
    await window.locator(SELECTORS.writing.sourceButton).click()
    await expect(window.locator(SELECTORS.writing.listTabArticles)).toBeVisible({ timeout: 15000 })
    await window.waitForTimeout(1500)
  }

  test('xlsx 在树中显示并可预览为表格', async ({ window, testLibraryPath }) => {
    await gotoWriting(window, testLibraryPath)

    const node = window.locator('[data-testid="writing-tree-node"]').filter({ hasText: '报表.xlsx' })
    await expect(node).toBeVisible({ timeout: 5000 })
    await node.click()

    await expect(window.getByTestId('writing-readonly-preview')).toBeVisible({ timeout: 5000 })
    await expect(window.getByTestId('writing-preview-open')).toBeVisible()
    // xlsx 解析出的 markdown 表格内容可见（react-markdown 渲染 <table>）
    await expect(window.getByTestId('writing-preview-content')).toContainText('姓名')
    await expect(window.getByTestId('writing-preview-content')).toContainText('数学')
  })

  test('扫描 PDF 走 PDF_NO_TEXT 降级：错误提示 + 系统打开兜底', async ({ window, testLibraryPath }) => {
    await gotoWriting(window, testLibraryPath)

    const node = window.locator('[data-testid="writing-tree-node"]').filter({ hasText: '扫描件.pdf' })
    await expect(node).toBeVisible({ timeout: 5000 })
    await node.click()

    await expect(window.getByTestId('writing-preview-error')).toBeVisible({ timeout: 5000 })
    await expect(window.getByTestId('writing-preview-error')).toContainText('无文本层')
    await expect(window.getByTestId('writing-preview-error-open')).toBeVisible()
  })

  test('带文本层的 PDF 按页预览', async ({ window, testLibraryPath }) => {
    await gotoWriting(window, testLibraryPath)

    // 仓库 tab 里也有非 md 文件
    await window.locator('[data-testid="writing-list-tab-repository"]').click()
    const node = window.locator('[data-testid="writing-tree-node"]').filter({ hasText: '论文.pdf' })
    await expect(node).toBeVisible({ timeout: 5000 })
    await node.click()

    await expect(window.getByTestId('writing-preview-content')).toContainText('Hello PDF', { timeout: 5000 })
  })
})
