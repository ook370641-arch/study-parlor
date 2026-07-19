import { test, expect } from '../fixtures/electron'
import { CoverPage } from '../pages/CoverPage'
import { WritingPage } from '../pages/WritingPage'
import { SELECTORS } from '../helpers/selectors'
import { seedWritingTree, seedRepository } from '../helpers/test-library'

/**
 * Repository tab tests:
 * - Tab switching between articles and repository
 * - Repository tree shows seeded files
 * - Import button exists
 */
test.describe('@p2 writing-repository', () => {
  async function gotoWriting(window: any, testLibraryPath: string): Promise<WritingPage> {
    seedWritingTree(testLibraryPath)
    seedRepository(testLibraryPath)

    const cover = new CoverPage(window)
    await cover.enterIfNeeded()
    await cover.goToBriefing()
    await expect(window.locator(SELECTORS.briefing.sourceSidebar)).toBeVisible({ timeout: 10000 })
    await window.locator(SELECTORS.writing.sourceButton).click()

    const writing = new WritingPage(window)
    await expect(writing.listTabArticles).toBeVisible({ timeout: 15000 })
    return writing
  }

  test('Tab 互斥：文章 tab 和 repository tab 切换显示不同内容', async ({ window, testLibraryPath }) => {
    const writing = await gotoWriting(window, testLibraryPath)

    // Initially on articles tab - should show writing tree
    await expect(writing.listTabArticles).toBeVisible()
    await expect(writing.treeNode('随笔')).toBeVisible({ timeout: 5000 })

    // Switch to repository tab
    await writing.switchListTab('repository')
    await expect(writing.listTabRepository).toBeVisible()

    // Repository tree should show seeded files
    await expect(writing.treeNode('旧随笔')).toBeVisible({ timeout: 5000 })
    await expect(writing.treeNode('旧博客-xxx')).toBeVisible({ timeout: 5000 })

    // Articles tree nodes should not be visible in repository tab
    await expect(writing.treeNode('随笔')).not.toBeVisible({ timeout: 3000 })

    // Switch back to articles tab
    await writing.switchListTab('articles')
    await expect(writing.listTabArticles).toBeVisible()
    await expect(writing.treeNode('随笔')).toBeVisible({ timeout: 5000 })

    // Repository nodes should not be visible in articles tab
    await expect(writing.treeNode('旧随笔')).not.toBeVisible({ timeout: 3000 })
  })

  test('Repo 树显示 seeded 文件', async ({ window, testLibraryPath }) => {
    const writing = await gotoWriting(window, testLibraryPath)

    // Switch to repository tab
    await writing.switchListTab('repository')

    // Verify seeded files appear in the tree
    await expect(writing.treeNode('旧随笔')).toBeVisible({ timeout: 5000 })

    // Click to expand 2023 directory to see 旧博客-xxx
    const dir2023 = writing.treeNode('2023')
    if (await dir2023.isVisible().catch(() => false)) {
      await dir2023.click()
      await window.waitForTimeout(300)
    }
    await expect(writing.treeNode('旧博客-xxx')).toBeVisible({ timeout: 5000 })

    // Select a repository file and verify editor loads
    await writing.treeNode('旧随笔').click()
    await expect(writing.editor).toBeVisible({ timeout: 5000 })
  })

  test('导入按钮存在', async ({ window, testLibraryPath }) => {
    const writing = await gotoWriting(window, testLibraryPath)

    // Switch to repository tab - import button should be visible
    await writing.switchListTab('repository')
    await expect(writing.importFilesButton).toBeVisible({ timeout: 3000 })
  })
})
