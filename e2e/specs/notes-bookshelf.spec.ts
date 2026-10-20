import { test, expect } from '../fixtures/electron'
import { CoverPage } from '../pages/CoverPage'
import { seedBlogCollection } from '../helpers/test-library'

test.describe('笔记书架', () => {
  test('导入已读 → 卡片上书 → 编辑元数据 → 切回 tab 摘要仍在', async ({ window, testLibraryPath }) => {
    seedBlogCollection(testLibraryPath, [
      { sourceUrl: 'https://anthropic.com/a', title: 'E2E Article A', filePath: 'Anthropic博客/a.md', readAt: '2026-10-01T00:00:00.000Z' },
      { sourceUrl: 'https://anthropic.com/b', title: 'E2E Article B', filePath: 'Anthropic博客/b.md', readAt: '2026-10-02T00:00:00.000Z' },
    ])

    const cover = new CoverPage(window)
    await cover.enterName('E2E 测试员')
    await cover.goToBriefing()
    await window.locator('[data-testid="writing-list-tab-notes"]').click()

    // 空态可见 → 导入已读 → 两张卡片，A 社徽标可见
    await expect(window.locator('[data-testid="notes-empty"]')).toBeVisible()
    await window.locator('[data-testid="notes-import-button"]').click()
    await expect(window.locator('[data-testid="note-card-a"]')).toBeVisible()
    await expect(window.locator('[data-testid="note-card-b"]')).toBeVisible()
    await expect(window.locator('[data-testid="note-badge-anthropic"]').first()).toBeVisible()

    // 点开笔记 → 元数据编辑（打星 + 摘要 blur 保存）
    await window.locator('[data-testid="note-card-a"]').click()
    await expect(window.locator('[data-testid="note-board"]')).toBeVisible()
    // star-N testid 在只读卡片上也会渲染，需限定在元数据头内
    await window.locator('[data-testid="note-board"] [data-testid="star-4"]').click()
    await window.locator('[data-testid="note-meta-summary"]').fill('E2E 一句话摘要')
    await window.locator('[data-testid="note-meta-summary"]').blur()

    // 切走再切回 → 卡片上摘要持久化
    await window.locator('[data-testid="writing-list-tab-articles"]').click()
    await window.locator('[data-testid="writing-list-tab-notes"]').click()
    await expect(window.locator('[data-testid="note-card-a"]')).toContainText('E2E 一句话摘要')
  })
})
