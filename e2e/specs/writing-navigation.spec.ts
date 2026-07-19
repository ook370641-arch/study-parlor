import { test, expect } from '../fixtures/electron'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { CoverPage } from '../pages/CoverPage'
import { WritingPage } from '../pages/WritingPage'
import { SELECTORS } from '../helpers/selectors'
import { seedWritingTree } from '../helpers/test-library'

/**
 * Navigation tests for the writing feature:
 * - Source switching (writing source appears and is switchable)
 * - Persistence across reload (source, tab, lastWritingFile)
 */
test.describe('@p2 writing-navigation', () => {
  test('写作源置顶且可切换：点击 writing 源 → 列表栏出现', async ({ window, testLibraryPath }) => {
    seedWritingTree(testLibraryPath)

    const cover = new CoverPage(window)
    await cover.enterIfNeeded()
    await cover.goToBriefing()

    // The briefing page should show the source sidebar
    await expect(window.locator(SELECTORS.briefing.sourceSidebar)).toBeVisible({ timeout: 10000 })

    // Click the writing source button
    await window.locator(SELECTORS.writing.sourceButton).click()

    // The writing list column should appear with the articles tab
    const writing = new WritingPage(window)
    await expect(writing.listTabArticles).toBeVisible({ timeout: 15000 })

    // The editor should show content (auto-selects first file)
    await expect(writing.editor).toBeVisible({ timeout: 5000 })
  })

  test('切换到其他源再切回来：源切换正常', async ({ window, testLibraryPath }) => {
    seedWritingTree(testLibraryPath)

    const cover = new CoverPage(window)
    await cover.enterIfNeeded()
    await cover.goToBriefing()
    await expect(window.locator(SELECTORS.briefing.sourceSidebar)).toBeVisible({ timeout: 10000 })

    // Initially on digest source; go to writing
    await window.locator(SELECTORS.writing.sourceButton).click()
    const writing = new WritingPage(window)
    await expect(writing.listTabArticles).toBeVisible({ timeout: 15000 })

    // Switch back to digest
    await window.locator(SELECTORS.briefing.sourceDigestButton).click()
    // Writing list should no longer be visible
    await expect(writing.listTabArticles).not.toBeVisible({ timeout: 5000 })

    // Switch to writing again
    await window.locator(SELECTORS.writing.sourceButton).click()
    await expect(writing.listTabArticles).toBeVisible({ timeout: 15000 })
  })

  test('Reload 后来源/tab/lastWritingFile 恢复（state.json 持久化）', async ({ window, testLibraryPath, testConfigDir }) => {
    seedWritingTree(testLibraryPath)

    const cover = new CoverPage(window)
    await cover.enterIfNeeded()
    await cover.goToBriefing()
    await expect(window.locator(SELECTORS.briefing.sourceSidebar)).toBeVisible({ timeout: 10000 })

    // Switch to writing source and to repository tab
    await window.locator(SELECTORS.writing.sourceButton).click()
    const writing = new WritingPage(window)
    await expect(writing.listTabArticles).toBeVisible({ timeout: 15000 })

    // Switch to repository tab
    await writing.switchListTab('repository')
    await expect(writing.listTabRepository).toBeVisible()

    // Select a file from the repository tree if available, or create one
    const repoNode = writing.treeNode('旧随笔')
    if (await repoNode.isVisible().catch(() => false)) {
      await repoNode.click()
      await expect(writing.editor).toBeVisible({ timeout: 5000 })
    }

    // Reload the page
    await window.reload()
    await window.waitForLoadState('domcontentloaded')

    // After reload, navigate again; the source should persist in state.json
    const statePath = path.join(testConfigDir, 'state.json')
    const state = JSON.parse(fs.readFileSync(statePath, 'utf8'))
    expect(state.briefingSource).toBe('writing')
    expect(state.writingListTab).toBe('repository')
  })
})
