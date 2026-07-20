import { test, expect } from '../fixtures/electron'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { CoverPage } from '../pages/CoverPage'
import { SELECTORS } from '../helpers/selectors'
import { seedWritingTree, seedRepository } from '../helpers/test-library'

test.describe('@p2 writing-navigation', () => {
  test('点击 writing 源 → 列表栏出现', async ({ window, testLibraryPath }) => {
    seedWritingTree(testLibraryPath)

    const cover = new CoverPage(window)
    await cover.enterName('E2E 测试员')
    await cover.goToBriefing()
    await expect(window.locator(SELECTORS.briefing.sourceSidebar)).toBeVisible({ timeout: 10000 })

    await window.locator(SELECTORS.writing.sourceButton).click()
    await expect(window.locator(SELECTORS.writing.listTabArticles)).toBeVisible({ timeout: 15000 })

    // Tree nodes should render
    await window.waitForTimeout(2000)
    const treeNodes = window.locator('[data-testid="writing-tree-node"]')
    expect(await treeNodes.count()).toBeGreaterThan(0)
  })

  test('切换到其他源再切回来：源切换正常', async ({ window, testLibraryPath }) => {
    seedWritingTree(testLibraryPath)

    const cover = new CoverPage(window)
    await cover.enterName('E2E 测试员')
    await cover.goToBriefing()
    await expect(window.locator(SELECTORS.briefing.sourceSidebar)).toBeVisible({ timeout: 10000 })

    await window.locator(SELECTORS.writing.sourceButton).click()
    await expect(window.locator(SELECTORS.writing.listTabArticles)).toBeVisible({ timeout: 15000 })

    // Switch to digest and back
    await window.locator(SELECTORS.briefing.sourceDigestButton).click()
    await expect(window.locator(SELECTORS.writing.listTabArticles)).not.toBeVisible({ timeout: 5000 })

    await window.locator(SELECTORS.writing.sourceButton).click()
    await expect(window.locator(SELECTORS.writing.listTabArticles)).toBeVisible({ timeout: 15000 })
  })

  test('Reload 后来源/tab 持久化（state.json 断言）', async ({ window, testLibraryPath, testConfigDir }) => {
    seedWritingTree(testLibraryPath)
    seedRepository(testLibraryPath)

    const cover = new CoverPage(window)
    await cover.enterName('E2E 测试员')
    await cover.goToBriefing()
    await expect(window.locator(SELECTORS.briefing.sourceSidebar)).toBeVisible({ timeout: 10000 })

    await window.locator(SELECTORS.writing.sourceButton).click()
    await expect(window.locator(SELECTORS.writing.listTabArticles)).toBeVisible({ timeout: 15000 })

    // Switch to repository tab
    await window.locator(SELECTORS.writing.listTabRepository).click()
    await expect(window.locator(SELECTORS.writing.listTabRepository)).toBeVisible()
    await window.waitForTimeout(500)

    // Verify state.json persistence
    const statePath = path.join(testConfigDir, 'state.json')
    const state = JSON.parse(fs.readFileSync(statePath, 'utf8'))
    expect(state.briefingSource).toBe('writing')
    expect(state.writingListTab).toBe('repository')
  })
})
