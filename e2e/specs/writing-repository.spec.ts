import { test, expect } from '../fixtures/electron'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { CoverPage } from '../pages/CoverPage'
import { SELECTORS } from '../helpers/selectors'
import { seedWritingTree, seedRepository } from '../helpers/test-library'

test.describe('@p2 writing-repository', () => {
  async function gotoWriting(window: any, testLibraryPath: string) {
    seedWritingTree(testLibraryPath)
    seedRepository(testLibraryPath)

    const cover = new CoverPage(window)
    await cover.enterName('E2E 测试员')
    await cover.goToBriefing()
    await expect(window.locator(SELECTORS.briefing.sourceSidebar)).toBeVisible({ timeout: 10000 })
    await window.locator(SELECTORS.writing.sourceButton).click()
    await expect(window.locator(SELECTORS.writing.listTabArticles)).toBeVisible({ timeout: 15000 })
    await window.waitForTimeout(1500)
  }

  test('repo tab 显示 seeded 文件', async ({ window, testLibraryPath }) => {
    await gotoWriting(window, testLibraryPath)

    await window.locator(SELECTORS.writing.listTabRepository).click()
    await window.waitForTimeout(500)

    const nodes = window.locator('[data-testid="writing-tree-node"]')
    const texts = await nodes.allTextContents()
    // Seeded files: 旧随笔.md + 旧博客-xxx.md (in 2023/ subdir)
    expect(texts.some((t: string) => t.includes('旧随笔'))).toBe(true)
  })

  test('文章/repo tab 互斥显示', async ({ window, testLibraryPath }) => {
    await gotoWriting(window, testLibraryPath)

    // Articles tab shows writing tree
    await window.locator(SELECTORS.writing.listTabArticles).click()
    await window.waitForTimeout(500)
    const articleNodes = await window.locator('[data-testid="writing-tree-node"]').allTextContents()
    expect(articleNodes.some((t: string) => t.includes('七月夜话'))).toBe(true)

    // Repo tab shows different content
    await window.locator(SELECTORS.writing.listTabRepository).click()
    await window.waitForTimeout(500)
    const repoNodes = await window.locator('[data-testid="writing-tree-node"]').allTextContents()
    expect(repoNodes.some((t: string) => t.includes('旧随笔'))).toBe(true)
    // Writing files should NOT appear in repo tab
    expect(repoNodes.some((t: string) => t.includes('七月夜话'))).toBe(false)
  })

  test('repo 文章可打开阅读', async ({ window, testLibraryPath }) => {
    await gotoWriting(window, testLibraryPath)

    await window.locator(SELECTORS.writing.listTabRepository).click()
    await window.waitForTimeout(500)

    const fileNode = window.locator('[data-testid="writing-tree-node"]').filter({ hasText: /旧随笔/ }).first()
    await expect(fileNode).toBeVisible({ timeout: 3000 })
    await fileNode.click()
    await window.waitForTimeout(1000)

    await expect(window.locator(SELECTORS.writing.editor)).toBeVisible({ timeout: 5000 })
  })

  test('外部新增 .md → tab 切换重新扫描 → 树中出现', async ({ window, testLibraryPath }) => {
    await gotoWriting(window, testLibraryPath)

    // Switch to repo tab
    await window.locator(SELECTORS.writing.listTabRepository).click()
    await window.waitForTimeout(500)

    // Write a new .md file into the repository dir
    const repoDir = path.join(testLibraryPath, 'repository')
    const newFilePath = path.join(repoDir, '外部新增.md')
    fs.writeFileSync(newFilePath, '# 外部新增\n\n内容。\n', 'utf8')

    // Tab away and back — useEffect on tab change should call loadWritingTree
    await window.locator(SELECTORS.writing.listTabArticles).click()
    await window.waitForTimeout(500)
    await window.locator(SELECTORS.writing.listTabRepository).click()
    await window.waitForTimeout(1000)

    // Verify the new file appears in the tree
    const nodes = window.locator('[data-testid="writing-tree-node"]')
    const nodeTexts = await nodes.allTextContents()
    expect(nodeTexts.some((t: string) => t.includes('外部新增'))).toBe(true)

    // Clean up
    fs.unlinkSync(newFilePath)
  })

  test('导入按钮触发 system dialog（不实际选文件，只验证按钮存在且可点击）', async ({ window, testLibraryPath }) => {
    await gotoWriting(window, testLibraryPath)

    await window.locator(SELECTORS.writing.listTabRepository).click()
    await window.waitForTimeout(500)

    // The import button should exist and be clickable
    const importBtn = window.locator(SELECTORS.writing.importFilesButton)
    await expect(importBtn).toBeVisible()
    // Click it — dialog will appear but we can't interact with system dialog in E2E
    await importBtn.click()
    // App should not crash
    await window.waitForTimeout(1000)
    await expect(window.locator(SELECTORS.writing.listTabRepository)).toBeVisible()
  })

  test('repo 文件编辑保存 → 磁盘内容变化', async ({ window, testLibraryPath }) => {
    await gotoWriting(window, testLibraryPath)

    await window.locator(SELECTORS.writing.listTabRepository).click()
    await window.waitForTimeout(500)

    // Open the seeded repo file (now has type:writing frontmatter from Step 1)
    const fileNode = window.locator('[data-testid="writing-tree-node"]').filter({ hasText: /旧随笔/ }).first()
    await fileNode.click()
    await window.locator(SELECTORS.writing.editor).waitFor({ state: 'visible', timeout: 5000 })

    // Edit via ProseMirror editor
    const newContent = 'E2E 编辑的 repo 内容-' + Date.now()
    await window.locator(SELECTORS.writing.editor + ' .ProseMirror').click()
    await window.locator(SELECTORS.writing.editor + ' .ProseMirror').fill(newContent)
    await window.waitForTimeout(2500)

    // Verify disk content changed
    const filePath = path.join(testLibraryPath, 'repository', '旧随笔.md')
    const diskContent = fs.readFileSync(filePath, 'utf8')
    expect(diskContent).toContain('E2E 编辑的 repo 内容')
  })

  test('手动放置 .md 到 repo → 切换 tab 重新扫描 → 树中出现', async ({ window, testLibraryPath }) => {
    await gotoWriting(window, testLibraryPath)

    await window.locator(SELECTORS.writing.listTabRepository).click()
    await window.waitForTimeout(500)

    // Manually place a file in repository dir (simulating import result)
    const repoDir = path.join(testLibraryPath, 'repository')
    const newFilePath = path.join(repoDir, '导入测试文件.md')
    fs.writeFileSync(newFilePath,
      '---\ntype: writing\ntitle: 导入测试文件\ncreated: 2026-07-22\nupdated: 2026-07-22\n---\n\n# 导入测试\n\n外部导入的内容。\n',
      'utf8')

    // Tab away and back to trigger rescan
    await window.locator(SELECTORS.writing.listTabArticles).click()
    await window.waitForTimeout(500)
    await window.locator(SELECTORS.writing.listTabRepository).click()
    await window.waitForTimeout(1000)

    // Verify the new file appears in the tree
    const nodes = window.locator('[data-testid="writing-tree-node"]')
    const nodeTexts = await nodes.allTextContents()
    expect(nodeTexts.some((t: string) => t.includes('导入测试文件'))).toBe(true)

    // Cleanup
    fs.unlinkSync(newFilePath)
  })

  test('repo 新建分组：顶部按钮创建 → 磁盘目录存在 → 树中出现', async ({ window, testLibraryPath }) => {
    await gotoWriting(window, testLibraryPath)

    await window.locator(SELECTORS.writing.listTabRepository).click()
    await window.waitForTimeout(500)

    await window.locator('[data-testid="writing-repo-new-folder"]').click()
    await window.getByTestId('writing-prompt-input').fill('repo新组')
    await window.getByTestId('writing-prompt-confirm').click()
    await window.waitForTimeout(1500)

    const repoDir = path.join(testLibraryPath, 'repository', 'repo新组')
    expect(fs.existsSync(repoDir)).toBe(true)

    const nodes = window.locator('[data-testid="writing-tree-node"]')
    const nodeTexts = await nodes.allTextContents()
    expect(nodeTexts.some((t: string) => t.includes('repo新组'))).toBe(true)

    fs.rmdirSync(repoDir)
  })

  test('repo 重新扫描按钮：点击后出现 toast 文案', async ({ window, testLibraryPath }) => {
    await gotoWriting(window, testLibraryPath)

    await window.locator(SELECTORS.writing.listTabRepository).click()
    await window.waitForTimeout(500)

    await window.locator('[data-testid="writing-repo-refresh"]').click()
    await expect(window.getByText('已扫描，没有新文件')).toBeVisible({ timeout: 5000 })
  })
})
