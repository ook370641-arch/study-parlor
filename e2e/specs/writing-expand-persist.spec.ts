import { test, expect } from '../fixtures/electron'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { CoverPage } from '../pages/CoverPage'
import { SELECTORS } from '../helpers/selectors'
import { seedWritingTree, seedRepository, seedCatalogJson } from '../helpers/test-library'

test.describe('@p2 writing-expand-persist', () => {
  async function gotoWriting(window: any, testLibraryPath: string) {
    seedWritingTree(testLibraryPath)
    seedRepository(testLibraryPath)
    seedCatalogJson(testLibraryPath)
    const cover = new CoverPage(window)
    await cover.enterName('E2E 测试员')
    await cover.goToBriefing()
    await expect(window.locator(SELECTORS.briefing.sourceSidebar)).toBeVisible({ timeout: 10000 })
    await window.locator(SELECTORS.writing.sourceButton).click()
    await expect(window.locator(SELECTORS.writing.listTabArticles)).toBeVisible({ timeout: 15000 })
    await window.waitForTimeout(1200)
  }

  test('仓库分组默认收起：组行可见、组内文章不可见', async ({ window, testLibraryPath }) => {
    await gotoWriting(window, testLibraryPath)
    await window.locator(SELECTORS.writing.listTabRepository).click()
    await window.waitForTimeout(500)
    await expect(window.locator('[data-testid="writing-tree-node"][data-kind="dir"]').filter({ hasText: /^2023/ })).toBeVisible({ timeout: 3000 })
    await expect(window.locator('[data-testid="writing-tree-node"]').filter({ hasText: /旧博客/ })).toHaveCount(0)
  })

  test('展开 → 切 tab → 切回仍展开', async ({ window, testLibraryPath }) => {
    await gotoWriting(window, testLibraryPath)
    await window.locator(SELECTORS.writing.listTabRepository).click()
    await window.waitForTimeout(500)
    const dirRow = window.locator('[data-testid="writing-tree-node"][data-kind="dir"]').filter({ hasText: /^2023/ }).first()
    await dirRow.click()
    await expect(window.locator('[data-testid="writing-tree-node"]').filter({ hasText: /旧博客/ })).toBeVisible({ timeout: 3000 })
    await window.locator(SELECTORS.writing.listTabArticles).click()
    await window.waitForTimeout(400)
    await window.locator(SELECTORS.writing.listTabRepository).click()
    await window.waitForTimeout(500)
    await expect(window.locator('[data-testid="writing-tree-node"]').filter({ hasText: /旧博客/ })).toBeVisible({ timeout: 3000 })
  })

  test('展开 → reload → 仍展开（state.json 持久化）', async ({ window, testLibraryPath, testConfigDir }) => {
    await gotoWriting(window, testLibraryPath)
    await window.locator(SELECTORS.writing.listTabRepository).click()
    await window.waitForTimeout(500)
    const dirRow = window.locator('[data-testid="writing-tree-node"][data-kind="dir"]').filter({ hasText: /^2023/ }).first()
    await dirRow.click()
    await expect(window.locator('[data-testid="writing-tree-node"]').filter({ hasText: /旧博客/ })).toBeVisible({ timeout: 3000 })
    await window.waitForTimeout(800) // 等 debounce patchState 落盘

    const state = JSON.parse(fs.readFileSync(path.join(testConfigDir, 'state.json'), 'utf8'))
    expect(state.writingExpandedGroups?.['repository/2023']).toBe(true)

    await window.reload()
    // 重新走封面 → 简报 → 写作来源（reload 后 currentPage 回到 cover）
    const cover = new CoverPage(window)
    await cover.enterName('E2E 测试员')
    await cover.goToBriefing()
    await expect(window.locator(SELECTORS.briefing.sourceSidebar)).toBeVisible({ timeout: 10000 })
    await window.locator(SELECTORS.writing.sourceButton).click()
    await expect(window.locator(SELECTORS.writing.listTabRepository)).toBeVisible({ timeout: 15000 })
    await window.locator(SELECTORS.writing.listTabRepository).click() // 幂等；writingListTab 已持久化为 repository
    await window.waitForTimeout(500)
    await expect(window.locator('[data-testid="writing-tree-node"]').filter({ hasText: /旧博客/ })).toBeVisible({ timeout: 3000 })
  })

  test('分组/文章前缀标识渲染：文件夹图标与文档图标存在', async ({ window, testLibraryPath }) => {
    await gotoWriting(window, testLibraryPath)
    await window.locator(SELECTORS.writing.listTabRepository).click()
    await window.waitForTimeout(500)
    await expect(window.locator('[data-testid="writing-tree-folder-icon"]').first()).toBeVisible({ timeout: 3000 })
    await expect(window.locator('[data-testid="writing-tree-doc-icon"]').first()).toBeVisible({ timeout: 3000 })
  })
})
