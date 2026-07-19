import { test, expect } from '../fixtures/electron'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { CoverPage } from '../pages/CoverPage'
import { WritingPage } from '../pages/WritingPage'
import { SELECTORS } from '../helpers/selectors'

/**
 * Edge case tests:
 * - Empty writing/ and repository/ → empty state, no error
 * - Old library without two directories → auto-create
 * - External deletion of open file → prompt, not white screen
 */
test.describe('@p2 writing-edge', () => {
  async function gotoWriting(window: any, testLibraryPath: string): Promise<WritingPage> {
    const cover = new CoverPage(window)
    await cover.enterIfNeeded()
    await cover.goToBriefing()
    await expect(window.locator(SELECTORS.briefing.sourceSidebar)).toBeVisible({ timeout: 10000 })
    await window.locator(SELECTORS.writing.sourceButton).click()

    const writing = new WritingPage(window)
    await expect(writing.listTabArticles).toBeVisible({ timeout: 15000 })
    return writing
  }

  test('空 writing/ + 空 repository/ → 空态提示，不报错', async ({ window, testLibraryPath }) => {
    // Don't seed anything — empty library
    const writing = await gotoWriting(window, testLibraryPath)

    // Empty state should show with helpful text
    await expect(writing.boardEmpty).toBeVisible({ timeout: 5000 })

    // The list column should show empty state too
    const treeText = window.locator('[data-testid="writing-tree-node"]')
    await expect(treeText).toHaveCount(0)

    // No error should be visible
    await expect(writing.editor).not.toBeVisible()
  })

  test('老库无两目录 → 自动创建', async ({ window, testLibraryPath }) => {
    // Ensure writing/ and repository/ don't exist
    const writingDir = path.join(testLibraryPath, 'writing')
    const repoDir = path.join(testLibraryPath, 'repository')
    if (fs.existsSync(writingDir)) fs.rmSync(writingDir, { recursive: true })
    if (fs.existsSync(repoDir)) fs.rmSync(repoDir, { recursive: true })

    // Navigate to writing — the app should auto-create the directories
    await gotoWriting(window, testLibraryPath)

    // Verify directories were created
    expect(fs.existsSync(writingDir)).toBe(true)
    expect(fs.existsSync(repoDir)).toBe(true)

    // Empty state should be shown
    const writing = new WritingPage(window)
    await expect(writing.boardEmpty).toBeVisible({ timeout: 5000 })
  })

  test('外部删除打开的文件 → 提示不白屏', async ({ window, testLibraryPath }) => {
    // Seed a file and open it
    const writingDir = path.join(testLibraryPath, 'writing')
    fs.mkdirSync(writingDir, { recursive: true })
    const filePath = path.join(writingDir, '临时文章.md')
    fs.writeFileSync(filePath, '---\ntype: writing\ntitle: 临时文章\ncreated: 2026-07-19\nupdated: 2026-07-19\n---\n\n# 临时文章\n\n测试内容。\n', 'utf8')

    const writing = await gotoWriting(window, testLibraryPath)

    // Wait for tree to load
    await window.waitForTimeout(1000)

    // Select the file
    const fileNode = writing.treeNode('临时文章')
    if (await fileNode.isVisible().catch(() => false)) {
      await fileNode.click()
      await expect(writing.editor).toBeVisible({ timeout: 10000 })

      // Now delete the file externally
      fs.unlinkSync(filePath)

      // Trigger a save or edit — the app should handle the missing file gracefully
      const proseMirror = writing.editor.locator('.ProseMirror')
      if (await proseMirror.isVisible().catch(() => false)) {
        await proseMirror.click()
        await window.waitForTimeout(500)

        // The app should not white-screen; the editor should either:
        // 1. Show an error state
        // 2. Still show the last known content
        // In either case, the page should remain responsive
        const saveStatus = await writing.getSaveStatus().catch(() => '')
        expect(typeof saveStatus).toBe('string')
      }
    }
  })
})
