import { test, expect } from '../fixtures/electron'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { CoverPage } from '../pages/CoverPage'
import { SELECTORS } from '../helpers/selectors'
import { seedWritingSourceState } from '../helpers/test-library'

test.describe('@p2 writing-edge', () => {
  test('空 writing/ + 空 repository/ → 空态提示，不报错', async ({ window, testLibraryPath }) => {
    // Ensure only empty dirs exist (no seed data)
    const writingDir = path.join(testLibraryPath, 'writing')
    const repoDir = path.join(testLibraryPath, 'repository')
    fs.mkdirSync(writingDir, { recursive: true })
    fs.mkdirSync(repoDir, { recursive: true })

    const cover = new CoverPage(window)
    await cover.enterName('E2E 测试员')
    await cover.goToBriefing()
    await expect(window.locator(SELECTORS.briefing.sourceSidebar)).toBeVisible({ timeout: 10000 })
    await window.locator(SELECTORS.writing.sourceButton).click()
    await expect(window.locator(SELECTORS.writing.listTabArticles)).toBeVisible({ timeout: 15000 })
    await window.waitForTimeout(1500)

    // Empty state should show
    await expect(window.locator('[data-testid="writing-board-empty"]')).toBeVisible({ timeout: 5000 })

    // Zero tree nodes
    const treeNodes = window.locator('[data-testid="writing-tree-node"]')
    expect(await treeNodes.count()).toBe(0)
  })

  test('老库无两目录 → 自动创建', async ({ window, testLibraryPath }) => {
    // Remove writing/ and repository/ if they exist
    const writingDir = path.join(testLibraryPath, 'writing')
    const repoDir = path.join(testLibraryPath, 'repository')
    try { if (fs.existsSync(writingDir)) fs.rmSync(writingDir, { recursive: true }) } catch {}
    try { if (fs.existsSync(repoDir)) fs.rmSync(repoDir, { recursive: true }) } catch {}

    const cover = new CoverPage(window)
    await cover.enterName('E2E 测试员')
    await cover.goToBriefing()
    await expect(window.locator(SELECTORS.briefing.sourceSidebar)).toBeVisible({ timeout: 10000 })
    await window.locator(SELECTORS.writing.sourceButton).click()
    await expect(window.locator(SELECTORS.writing.listTabArticles)).toBeVisible({ timeout: 15000 })
    await window.waitForTimeout(1500)

    // Directories should have been auto-created
    expect(fs.existsSync(writingDir)).toBe(true)
    expect(fs.existsSync(repoDir)).toBe(true)
  })

  test('外部删除打开的文件 → 应用不白屏', async ({ window, testLibraryPath, testConfigDir }) => {
    // Seed state to land directly on writing source, avoiding cover→briefing timing issues
    seedWritingSourceState(testConfigDir)

    // Create a file then delete it externally BEFORE the app tries to open it
    const writingDir = path.join(testLibraryPath, 'writing')
    fs.mkdirSync(writingDir, { recursive: true })
    const tmpPath = path.join(writingDir, '临时.md')
    fs.writeFileSync(tmpPath,
      '---\ntype: writing\ntitle: 临时\ncreated: 2026-07-20\nupdated: 2026-07-20\n---\n\n# 临时\n\n内容。\n', 'utf8')

    const cover = new CoverPage(window)
    await cover.enterName('E2E 测试员')
    await cover.goToBriefing()
    // With briefingSource:'writing' seeded, the writing source loads without clicking sidebar button
    await expect(window.locator(SELECTORS.writing.listTabArticles)).toBeVisible({ timeout: 15000 })
    await window.waitForTimeout(1500)

    // Delete the file externally before selecting it
    fs.unlinkSync(tmpPath)

    // Click the tree node — app should degrade gracefully (not crash)
    const fileNode = window.locator('[data-testid="writing-tree-node"]').filter({ hasText: /临时\.md/ }).first()
    await fileNode.click()
    await window.waitForTimeout(1000)

    // Sidebar still visible = app didn't crash
    await expect(window.locator(SELECTORS.briefing.sourceSidebar)).toBeVisible({ timeout: 5000 })
  })
})
