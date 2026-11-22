import { test, expect } from '../fixtures/electron'
import fs from 'node:fs'
import path from 'node:path'
import matter from 'gray-matter'
import { CoverPage } from '../pages/CoverPage'
import { SELECTORS } from '../helpers/selectors'
import { seedRepository, seedWritingTree } from '../helpers/test-library'

test.describe('@p1 writing album wall', () => {
  test('分组、返回保存、封面选择与删除清理完整链路', async ({ window, testLibraryPath }) => {
    seedWritingTree(testLibraryPath)
    seedRepository(testLibraryPath)
    const rootArticle = path.join(testLibraryPath, 'writing', '根文章.md')
    fs.writeFileSync(rootArticle, matter.stringify('中文 two', { type: 'writing', title: '根文章' }), 'utf8')

    const cover = new CoverPage(window)
    await cover.enterName('E2E 测试员')
    await cover.goToBriefing()
    await expect(window.locator(SELECTORS.briefing.sourceSidebar)).toBeVisible({ timeout: 10000 })
    await window.locator(SELECTORS.writing.sourceButton).click()
    await expect(window.getByTestId('writing-editor')).toBeVisible({ timeout: 15000 })

    await window.getByTestId('writing-back-to-wall').click()
    const wall = window.getByTestId('writing-wall-writing')
    await expect(wall).toBeVisible()
    await expect(window.getByTestId('writing-wall-writing-group-header-writing/随笔')).toContainText('1')
    await expect(window.getByTestId('writing-wall-writing-group-header-writing/技术笔记')).toContainText('技术笔记')
    await expect(window.getByTestId('writing-wall-writing-group-header-writing/技术笔记/子组')).toContainText('子组')
    await expect(window.getByTestId('writing-wall-writing-group-header-writing')).toContainText('未分组')

    const rootCard = window.getByTestId('writing-wall-card-writing/根文章.md')
    await window.getByTestId('writing-wall-view-list-writing').click()
    await expect(window.getByTestId('writing-wall-row-writing/根文章.md')).toBeVisible()
    await expect(window.getByTestId('writing-cover-generate')).toHaveCount(0)
    await window.getByTestId('writing-wall-view-card-writing').click()
    await expect(rootCard).toBeVisible()
    await rootCard.hover()
    await expect(window.getByTestId('writing-wall-word-count-writing/根文章.md')).toHaveText('3 字')
    await rootCard.click()
    await expect(window.getByTestId('writing-editor')).toBeVisible()
    await window.getByTestId('writing-editor').locator('.ProseMirror').fill('更新后的正文')
    await window.waitForTimeout(100)
    await window.getByTestId('writing-back-to-wall').click()
    await expect(wall).toBeVisible()
    await expect.poll(() => fs.readFileSync(rootArticle, 'utf8')).toContain('更新后的正文')

    await rootCard.hover()
    await rootCard.getByTestId('writing-cover-generate').click()
    await expect(rootCard.getByTestId('writing-cover-generate')).toHaveText('待挑选')
    await expect(window.getByTestId('writing-cover-dialog')).toHaveCount(0)
    await rootCard.getByTestId('writing-cover-generate').click()
    await expect(window.getByTestId('writing-cover-dialog')).toBeVisible()
    await expect(window.getByTestId('writing-cover-candidate')).toHaveCount(3)
    await window.getByTestId('writing-cover-select').nth(1).click()
    await expect(window.getByTestId('writing-cover-dialog')).toHaveCount(0)
    await expect(rootCard.getByRole('img', { name: '根文章.md 封面' })).toBeVisible()
    await expect(wall).toBeVisible()

    const coverRelative = matter(fs.readFileSync(rootArticle, 'utf8')).data.cover as string
    expect(coverRelative).toMatch(/^writing\/\.covers\/.+\.svg$/)
    expect(fs.existsSync(path.join(testLibraryPath, coverRelative))).toBe(true)

    await rootCard.hover()
    await rootCard.getByTestId('writing-wall-delete-writing/根文章.md').click()
    await window.getByTestId('confirm-dialog-confirm').click()
    await expect(rootCard).toHaveCount(0)
    await expect(window.getByTestId('writing-editor')).toHaveCount(0)
    await expect(wall).toBeVisible()
    expect(fs.existsSync(rootArticle)).toBe(false)
    expect(fs.existsSync(path.join(testLibraryPath, coverRelative))).toBe(false)

    await window.locator(SELECTORS.writing.listTabRepository).click()
    await expect(window.getByTestId('writing-editor')).toBeVisible({ timeout: 15000 })
    await window.getByTestId('writing-back-to-wall').click()
    await expect(window.getByTestId('writing-wall-repository')).toBeVisible()
    await expect(window.getByTestId('writing-wall-repository-group-header-repository/2023')).toContainText('2023')
    await expect(window.getByTestId('writing-wall-repository-group-header-repository')).toContainText('未分组')
  })
})
