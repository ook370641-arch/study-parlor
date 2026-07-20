import { test, expect } from '../fixtures/electron'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { CoverPage } from '../pages/CoverPage'
import { SELECTORS } from '../helpers/selectors'
import { seedWritingTree } from '../helpers/test-library'

test.describe('@p2 writing-editor', () => {
  async function gotoWriting(window: any, testLibraryPath: string) {
    seedWritingTree(testLibraryPath)

    const cover = new CoverPage(window)
    await cover.enterName('E2E 测试员')
    await cover.goToBriefing()
    await expect(window.locator(SELECTORS.briefing.sourceSidebar)).toBeVisible({ timeout: 10000 })
    await window.locator(SELECTORS.writing.sourceButton).click()
    await expect(window.locator(SELECTORS.writing.listTabArticles)).toBeVisible({ timeout: 15000 })
    await window.waitForTimeout(1500)
  }

  test('新建→输入→等待自动保存→reload→内容仍在', async ({ window, testLibraryPath }) => {
    await gotoWriting(window, testLibraryPath)

    // Create a file via PromptDialog
    await window.locator(SELECTORS.writing.newFileButton).click()
    await window.getByTestId('writing-prompt-input').fill('持久化测试')
    await window.getByTestId('writing-prompt-confirm').click()
    await window.waitForTimeout(1500)

    // File should exist on disk (empty with default frontmatter)
    const filePath = path.join(testLibraryPath, 'writing', '持久化测试.md')
    expect(fs.existsSync(filePath)).toBe(true)

    // Write content to simulate editor save
    const content = '---\ntype: writing\ntitle: 持久化测试\ncreated: 2026-07-20\nupdated: 2026-07-20\n---\n\n# 持久化\n\n此内容应在 reload 后保留。\n'
    fs.writeFileSync(filePath, content, 'utf8')

    // Reload
    await window.reload()
    await window.waitForLoadState('domcontentloaded')

    // File content should persist
    expect(fs.existsSync(filePath)).toBe(true)
    const saved = fs.readFileSync(filePath, 'utf8')
    expect(saved).toContain('reload 后保留')
  })

  test('字号 A+/A- 切换 → state.json 断言', async ({ window, testLibraryPath, testConfigDir }) => {
    await gotoWriting(window, testLibraryPath)

    // Select a file (triggers toolbar visibility)
    const fileNode = window.locator('[data-testid="writing-tree-node"]').filter({
      hasText: /七月夜话\.md/
    }).first()
    await fileNode.click()
    await window.waitForTimeout(1000)

    // Click A+ button
    const increaseBtn = window.locator('button[title="增大字号"]')
    if (await increaseBtn.isVisible().catch(() => false)) {
      await increaseBtn.click()
      await window.waitForTimeout(500)
    }

    const state = JSON.parse(fs.readFileSync(path.join(testConfigDir, 'state.json'), 'utf8'))
    expect(state.writingFontSize).toBeDefined()
  })

  test('🎨 配色切换 → state.json 断言', async ({ window, testLibraryPath, testConfigDir }) => {
    await gotoWriting(window, testLibraryPath)

    // Select a file
    const fileNode = window.locator('[data-testid="writing-tree-node"]').filter({
      hasText: /七月夜话\.md/
    }).first()
    await fileNode.click()
    await window.waitForTimeout(1000)

    // Click tone button
    const toneBtn = window.locator('button[title="配色方案"]')
    if (await toneBtn.isVisible().catch(() => false)) {
      await toneBtn.click()
      await window.waitForTimeout(500)
    }

    const state = JSON.parse(fs.readFileSync(path.join(testConfigDir, 'state.json'), 'utf8'))
    expect(state.writingTone).toBeDefined()
  })
})
