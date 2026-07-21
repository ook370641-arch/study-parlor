import { test, expect } from '../fixtures/electron'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { CoverPage } from '../pages/CoverPage'
import { WritingPage } from '../pages/WritingPage'
import { SELECTORS } from '../helpers/selectors'

test.describe('@p1 writing 空库新建', () => {
  test('空 writing/ → 新建第一篇 → 编辑器立即可输入且全局 Chrome 存活', async ({ window, testLibraryPath }) => {
    // 不 seed 任何 writing 文件——用户最常见的首次路径
    const cover = new CoverPage(window)
    await cover.enterName('E2E 测试员')
    await cover.goToBriefing()
    await expect(window.locator(SELECTORS.briefing.sourceSidebar)).toBeVisible({ timeout: 10000 })
    await window.locator(SELECTORS.writing.sourceButton).click()
    await expect(window.locator(SELECTORS.writing.listTabArticles)).toBeVisible({ timeout: 15000 })

    const writing = new WritingPage(window)
    await expect(writing.boardEmpty).toBeVisible({ timeout: 10000 })

    await writing.newFileButton.click()
    await window.getByTestId('writing-prompt-input').fill('第一篇')
    await window.getByTestId('writing-prompt-confirm').click()

    // 无固定 sleep：轮询等待编辑器出现
    await expect(writing.editor).toBeVisible({ timeout: 10000 })

    // 全局 Chrome 存活探针：整树卸载时 sidebar 也会消失
    await expect(window.locator(SELECTORS.briefing.sourceSidebar)).toBeVisible()

    await writing.typeInEditor('空库第一篇的内容')
    await expect(writing.saveStatus).toContainText('已保存', { timeout: 8000 })

    expect(fs.existsSync(path.join(testLibraryPath, 'writing', '第一篇.md'))).toBe(true)
    expect(fs.readFileSync(path.join(testLibraryPath, 'writing', '第一篇.md'), 'utf8')).toContain('空库第一篇的内容')
  })

  test('多文件下新建 → 编辑器是新文件而非自动选中的首篇', async ({ window, testLibraryPath }) => {
    const { seedWritingTree } = await import('../helpers/test-library')
    seedWritingTree(testLibraryPath)

    const cover = new CoverPage(window)
    await cover.enterName('E2E 测试员')
    await cover.goToBriefing()
    await expect(window.locator(SELECTORS.briefing.sourceSidebar)).toBeVisible({ timeout: 10000 })
    await window.locator(SELECTORS.writing.sourceButton).click()
    await expect(window.locator(SELECTORS.writing.listTabArticles)).toBeVisible({ timeout: 15000 })

    const writing = new WritingPage(window)
    await writing.newFileButton.click()
    await window.getByTestId('writing-prompt-input').fill('zzz-最后')
    await window.getByTestId('writing-prompt-confirm').click()

    await expect(writing.editor).toBeVisible({ timeout: 10000 })
    const currentPath = await window.evaluate(() => (window as any).useStore.getState().writingFile?.path ?? '')
    expect(currentPath).toContain('zzz-最后')
  })

  test('写作字号 reload 后读回（hydration 回归）', async ({ window, testLibraryPath }) => {
    const { seedWritingTree } = await import('../helpers/test-library')
    seedWritingTree(testLibraryPath)

    const cover = new CoverPage(window)
    await cover.enterName('E2E 测试员')
    await cover.goToBriefing()
    await expect(window.locator(SELECTORS.briefing.sourceSidebar)).toBeVisible({ timeout: 10000 })
    await window.locator(SELECTORS.writing.sourceButton).click()
    await expect(window.locator(SELECTORS.writing.listTabArticles)).toBeVisible({ timeout: 15000 })

    // 改字号为 xl 并等待 patchState 落盘
    await window.evaluate(() => (window as any).useStore.getState().setWritingFontSize('xl'))
    await window.waitForTimeout(500)

    await window.reload()
    await window.waitForLoadState('domcontentloaded')
    const cover2 = new CoverPage(window)
    await cover2.enterIfNeeded('E2E 测试员')
    await cover2.goToBriefing()
    await expect(window.locator(SELECTORS.briefing.sourceSidebar)).toBeVisible({ timeout: 10000 })

    const size = await window.evaluate(() => (window as any).useStore.getState().writingFontSize)
    expect(size).toBe('xl')
  })
})
