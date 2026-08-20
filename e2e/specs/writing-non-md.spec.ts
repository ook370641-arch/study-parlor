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
    // 自包含静态 HTML：内联 CSS + 少量 JS，验证 iframe srcdoc 原生渲染
    fs.writeFileSync(
      path.join(libPath, 'writing', '报告.html'),
      '<!DOCTYPE html><html><head><meta charset="utf-8"><style>h1{color:#d97757}</style></head>' +
      '<body><h1>月度报告</h1><p>HTML 原生渲染</p></body></html>',
    )
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

  test('HTML 文件原生渲染：iframe 沙箱显示，与浏览器一致', async ({ window, testLibraryPath }) => {
    await gotoWriting(window, testLibraryPath)

    const node = window.locator('[data-testid="writing-tree-node"]').filter({ hasText: '报告.html' })
    await expect(node).toBeVisible({ timeout: 5000 })
    await node.click()

    await expect(window.getByTestId('writing-html-preview')).toBeVisible({ timeout: 5000 })
    await expect(window.getByTestId('writing-html-preview-iframe')).toBeVisible()
    // iframe srcdoc 内真实渲染出的 DOM + 内联 CSS 生效（证明是浏览器原生渲染而非文本展示）
    const frame = window.frameLocator('[data-testid="writing-html-preview-iframe"]')
    await expect(frame.locator('body')).toContainText('月度报告', { timeout: 5000 })
    await expect(frame.locator('h1')).toHaveCSS('color', 'rgb(217, 119, 87)')
    // HTML 徽标 + 系统打开兜底
    await expect(window.getByTestId('writing-preview-kind')).toHaveText('HTML')
    await expect(window.getByTestId('writing-preview-open')).toBeVisible()

    // 缩放随字号档位（spec 追加 §缩放）：base 档 = zoom 1.2，点 + → lg 档 = 1.33
    const iframe = window.getByTestId('writing-html-preview-iframe')
    await expect(iframe).toHaveAttribute('srcdoc', /zoom:1\.2 !important/)
    await window.getByTestId('writing-ui-font-size-increase').click()
    await expect(iframe).toHaveAttribute('srcdoc', /zoom:1\.33 !important/, { timeout: 5000 })
    await window.getByTestId('writing-ui-font-size-decrease').click()
    await expect(iframe).toHaveAttribute('srcdoc', /zoom:1\.2 !important/, { timeout: 5000 })
  })
})
