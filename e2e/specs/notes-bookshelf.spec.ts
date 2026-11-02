import { test, expect } from '../fixtures/electron'
import { CoverPage } from '../pages/CoverPage'
import { seedBlogCollection, seedBookChapterNote } from '../helpers/test-library'
import * as fs from 'node:fs'
import * as path from 'node:path'

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

    // 空态可见 → 导入已读 → 两张卡片，副行来源文本可见
    await expect(window.locator('[data-testid="notes-empty"]')).toBeVisible()
    await window.locator('[data-testid="notes-import-button"]').click()
    await expect(window.locator('[data-testid="note-card-a"]')).toBeVisible()
    await expect(window.locator('[data-testid="note-card-b"]')).toBeVisible()
    await expect(window.locator('[data-testid="note-card-a"]')).toContainText('Anthropic')

    // 分类下拉框：Anthropic 下两张 A 社卡片均在；「未知」为空；切回「全部」恢复
    await window.locator('[data-testid="notes-category-select"]').selectOption('anthropic')
    await expect(window.locator('[data-testid="note-card-a"]')).toBeVisible()
    await expect(window.locator('[data-testid="note-card-b"]')).toBeVisible()
    await window.locator('[data-testid="notes-category-select"]').selectOption('unknown')
    await expect(window.locator('[data-testid="note-card-a"]')).toHaveCount(0)
    await window.locator('[data-testid="notes-category-select"]').selectOption('all')
    await expect(window.locator('[data-testid="note-card-a"]')).toBeVisible()

    // 点开笔记 → 元数据编辑（打星 + 摘要 blur 保存）
    await window.locator('[data-testid="note-card-a"]').click()
    await expect(window.locator('[data-testid="note-board"]')).toBeVisible()
    // star-N testid 在只读卡片上也会渲染，需限定在元数据头内
    await window.locator('[data-testid="note-board"] [data-testid="star-4"]').click()
    await window.locator('[data-testid="note-meta-summary"]').fill('E2E 一句话摘要')
    await window.locator('[data-testid="note-meta-summary"]').blur()

    // 正文编辑 → 等待 autosave（debounce 1.5s）
    const noteEditor = window.locator('[data-testid="note-board"] .ProseMirror')
    await noteEditor.click()
    await noteEditor.fill('E2E 正文内容')
    await window.waitForTimeout(2200)

    // 切走再切回 → 重新打开卡片：摘要与正文持久化
    // （封面行按专辑墙设计只显示「星标 · 来源 · 日期」，不渲染摘要）
    await window.locator('[data-testid="writing-list-tab-articles"]').click()
    await window.locator('[data-testid="writing-list-tab-notes"]').click()
    await window.locator('[data-testid="note-card-a"]').click()
    await expect(window.locator('[data-testid="note-meta-summary"]')).toHaveValue('E2E 一句话摘要')
    await expect(window.locator('[data-testid="note-board"] .ProseMirror')).toContainText('E2E 正文内容')
  })

  test('专辑墙：无打开文件时显示墙 → 点专辑进正文 → 返回键回墙', async ({ window, testLibraryPath, testConfigDir }) => {
    seedBlogCollection(testLibraryPath, [
      { sourceUrl: 'https://anthropic.com/a', title: 'E2E Article A', filePath: 'Anthropic博客/a.md', readAt: '2026-10-01T00:00:00.000Z' },
    ])

    const cover = new CoverPage(window)
    await cover.enterName('E2E 测试员')
    await cover.goToBriefing()
    await window.locator('[data-testid="writing-list-tab-notes"]').click()

    await window.locator('[data-testid="notes-import-button"]').click()
    await expect(window.locator('[data-testid="note-card-a"]')).toBeVisible()

    // 主区专辑墙可见 → 点专辑卡进正文 → 点「← 笔记墙」回墙
    await expect(window.locator('[data-testid="notes-wall"]')).toBeVisible()
    await expect(window.locator('[data-testid="notes-wall-category-select"]')).toBeVisible()
    await expect(window.locator('[data-testid="notes-wall-sort-select"]')).toBeVisible()
    await window.locator('[data-testid="notes-wall-sort-select"]').selectOption('source')
    await window.locator('[data-testid="wall-album-a"]').click()
    await expect(window.locator('[data-testid="note-board"]')).toBeVisible()
    await window.locator('[data-testid="note-back-to-wall"]').click()
    await expect(window.locator('[data-testid="notes-wall"]')).toBeVisible()
    await expect.poll(() => JSON.parse(fs.readFileSync(path.join(testConfigDir, 'state.json'), 'utf8')).lastWritingFile).toBeNull()
  })

  test('同书章节聚合切换，并在墙与列表复用生成封面', async ({ window, testLibraryPath }) => {
    seedBookChapterNote(testLibraryPath, 'deep-one', 'Deep Work', 'One', '2026-10-01T00:00:00.000Z', true)
    seedBookChapterNote(testLibraryPath, 'deep-two', 'Deep Work', 'Two', '2026-10-02T00:00:00.000Z')
    const cover = new CoverPage(window)
    await cover.enterName('E2E 测试员')
    await cover.goToBriefing()
    await window.getByTestId('writing-list-tab-notes').click()
    const wall = window.getByTestId('notes-wall')
    const shelf = window.getByTestId('notes-shelf')
    await expect(wall.locator('[data-testid^="wall-album-"]')).toHaveCount(1)
    await expect(shelf.locator('[data-testid^="note-card-"]')).toHaveCount(1)
    await expect(wall.locator('img')).toHaveAttribute('src', /^data:image\/svg\+xml;base64,/)
    await expect(shelf.locator('img')).toHaveAttribute('src', /^data:image\/svg\+xml;base64,/)
    await expect.poll(() => wall.locator('img').evaluate((image: HTMLImageElement) => image.naturalWidth)).toBe(600)
    await expect(wall.getByTestId('note-cover-generate')).toHaveCount(0)
    await wall.getByTestId('book-chapter-select-Deep Work').selectOption('notes/deep-one.md')
    await expect(window.getByTestId('note-meta-title')).toHaveValue('Deep Work · One')
    await window.getByTestId('note-back-to-wall').click()
    await shelf.getByTestId('book-chapter-select-Deep Work').selectOption('notes/deep-two.md')
    await expect(window.getByTestId('note-meta-title')).toHaveValue('Deep Work · Two')
  })
})
