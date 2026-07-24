import { test, expect } from '../fixtures/electron'
import { CoverPage } from '../pages/CoverPage'
import { SELECTORS } from '../helpers/selectors'
import { seedWritingTree, seedRepository } from '../helpers/test-library'

async function setup(window: any, testLibraryPath: string) {
  seedWritingTree(testLibraryPath)
  seedRepository(testLibraryPath)
  const cover = new CoverPage(window)
  await cover.enterName('E2E 测试员')
  await cover.goToBriefing()
  await expect(window.locator(SELECTORS.briefing.sourceSidebar)).toBeVisible({ timeout: 10000 })
  await window.locator(SELECTORS.writing.sourceButton).click()
  await expect(window.locator(SELECTORS.writing.listTabArticles)).toBeVisible({ timeout: 15000 })
}

test.describe('@p2 writing list column', () => {
  test('repository tab is labeled 仓库 and uses segmented switch', async ({ window, testLibraryPath }) => {
    await setup(window, testLibraryPath)

    const repoTab = window.locator(SELECTORS.writing.listTabRepository)
    await expect(repoTab).toHaveText('仓库')
    await expect(repoTab).toHaveAttribute('aria-pressed', 'false')
    await expect(window.locator(SELECTORS.writing.listTabArticles)).toHaveAttribute('aria-pressed', 'true')

    await repoTab.click()
    await expect(repoTab).toHaveAttribute('aria-pressed', 'true')
    await expect(window.locator(SELECTORS.writing.listTabArticles)).toHaveAttribute('aria-pressed', 'false')
  })

  test('collapsed column shows article and repository counts', async ({ window, testLibraryPath }) => {
    await setup(window, testLibraryPath)

    await window.locator(SELECTORS.briefing.listColumnToggle).click()

    const articlesCount = window.locator(SELECTORS.writing.collapsedArticlesCount)
    const repoCount = window.locator(SELECTORS.writing.collapsedRepositoryCount)
    await expect(articlesCount).toBeVisible()
    await expect(repoCount).toBeVisible()
    await expect(articlesCount).toHaveText('3')
    await expect(repoCount).toHaveText('2')

    await expect(window.locator(SELECTORS.writing.treeNode)).toHaveCount(0)
  })

  test('newspaper theme uses dark text on light background', async ({ window, testLibraryPath }) => {
    await setup(window, testLibraryPath)
    await window.locator(SELECTORS.briefing.themeToggle).click()

    // Newspaper theme gives the page a light bg-white root (no digest layout is rendered for writing source).
    const page = window.locator(SELECTORS.briefing.page)
    await expect(page).toHaveClass(/bg-white/, { timeout: 10000 })

    const newFileBtn = window.locator(SELECTORS.writing.newFileButton)
    await expect(newFileBtn).toBeVisible()
    const className = await newFileBtn.getAttribute('class')
    expect(className).not.toContain('text-parchment')
  })
})
