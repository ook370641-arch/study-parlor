import { test, expect } from '../fixtures/electron'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { CoverPage } from '../pages/CoverPage'
import { SELECTORS } from '../helpers/selectors'
import { seedWritingTree, seedRepository } from '../helpers/test-library'

test.describe('@p2 writing-repository', () => {
  async function gotoWritingRepo(window: any, testLibraryPath: string) {
    seedWritingTree(testLibraryPath)
    seedRepository(testLibraryPath)

    const cover = new CoverPage(window)
    await cover.enterName('E2E 测试员')
    await cover.goToBriefing()
    await expect(window.locator(SELECTORS.briefing.sourceSidebar)).toBeVisible({ timeout: 10000 })
    await window.locator(SELECTORS.writing.sourceButton).click()
    await expect(window.locator(SELECTORS.writing.listTabArticles)).toBeVisible({ timeout: 15000 })
    await window.waitForTimeout(1500)

    // Switch to repository tab
    await window.locator(SELECTORS.writing.listTabRepository).click()
    await window.waitForTimeout(500)
  }

  test('导入流程：外部 .md 文件写入后出现在 repository 树中', async ({ window, testLibraryPath }) => {
    await gotoWritingRepo(window, testLibraryPath)

    // Write a new .md file into the repository dir (simulating import)
    const repoDir = path.join(testLibraryPath, 'repository')
    const newFilePath = path.join(repoDir, '新导入的文章.md')
    fs.writeFileSync(newFilePath, '# 新导入的文章\n\n这是一篇从外部导入的文章。\n', 'utf8')

    // Switch to articles tab and back to trigger tree refresh
    await window.locator(SELECTORS.writing.listTabArticles).click()
    await window.waitForTimeout(500)
    await window.locator(SELECTORS.writing.listTabRepository).click()
    await window.waitForTimeout(1000)

    // Verify the new file appears in the tree
    const nodes = window.locator('[data-testid="writing-tree-node"]')
    const nodeTexts = await nodes.allTextContents()
    const hasNewFile = nodeTexts.some((t: string) => t.includes('新导入的文章'))
    expect(hasNewFile).toBe(true)

    // Clean up
    fs.unlinkSync(newFilePath)
  })

  test('Repository 目录管理：新建分组 → 新建文章 → 重命名 → 删除', async ({ window, testLibraryPath }) => {
    await gotoWritingRepo(window, testLibraryPath)

    // Step 1: 新建分组（工具栏按钮，根目录下创建）
    await window.locator(SELECTORS.writing.newFolderButton).click()
    await window.getByTestId('writing-prompt-input').fill('我的仓库分组')
    await window.getByTestId('writing-prompt-confirm').click()
    await window.waitForTimeout(1500)
    const groupPath = path.join(testLibraryPath, 'repository', '我的仓库分组')
    expect(fs.existsSync(groupPath)).toBe(true)

    // Step 2: 右键新建文章（在新建的分组下）
    const groupNode = window.locator('[data-testid="writing-tree-node"]').filter({
      hasText: /我的仓库分组/
    }).first()
    await groupNode.click({ button: 'right' })
    await expect(window.getByRole('button', { name: '＋ 新建文章', exact: true })).toBeVisible({ timeout: 3000 })
    await window.getByRole('button', { name: '＋ 新建文章', exact: true }).click()

    await window.getByTestId('writing-prompt-input').fill('我的仓库文章.md')
    await window.getByTestId('writing-prompt-confirm').click()
    await window.waitForTimeout(1500)
    const articlePath = path.join(testLibraryPath, 'repository', '我的仓库分组', '我的仓库文章.md')
    expect(fs.existsSync(articlePath)).toBe(true)

    // Step 3: 重命名（右键文件 → 重命名）
    const fileNode = window.locator('[data-testid="writing-tree-node"]').filter({
      hasText: /我的仓库文章\.md/
    }).first()
    await fileNode.click({ button: 'right' })
    await expect(window.getByRole('button', { name: '重命名', exact: true })).toBeVisible({ timeout: 3000 })
    await window.getByRole('button', { name: '重命名', exact: true }).click()

    await window.getByTestId('writing-prompt-input').fill('重命名的文章.md')
    await window.getByTestId('writing-prompt-confirm').click()
    await window.waitForTimeout(1500)
    const renamedPath = path.join(testLibraryPath, 'repository', '我的仓库分组', '重命名的文章.md')
    expect(fs.existsSync(renamedPath)).toBe(true)
    expect(fs.existsSync(articlePath)).toBe(false)

    // Step 4: 删除（cancel → file still exists; confirm → file deleted）
    const deleteButton = () => window.getByRole('button', { name: '删除', exact: true })

    const renamedNode = window.locator('[data-testid="writing-tree-node"]').filter({
      hasText: /重命名的文章\.md/
    }).first()
    await renamedNode.click({ button: 'right' })
    await expect(deleteButton()).toBeVisible({ timeout: 3000 })

    // Cancel — fire-and-forget click: window.confirm blocks synchronously
    let dialogPromise = window.waitForEvent('dialog')
    void deleteButton().click()
    let dialog = await dialogPromise
    await dialog.dismiss()
    await window.waitForTimeout(500)
    expect(fs.existsSync(renamedPath)).toBe(true)

    // Confirm
    await renamedNode.click({ button: 'right' })
    await expect(deleteButton()).toBeVisible({ timeout: 3000 })
    dialogPromise = window.waitForEvent('dialog')
    void deleteButton().click()
    dialog = await dialogPromise
    await dialog.accept()
    await window.waitForTimeout(1500)
    expect(fs.existsSync(renamedPath)).toBe(false)
  })

  test('Repository 文章打开：点击树中文件 → 编辑器显示', async ({ window, testLibraryPath }) => {
    await gotoWritingRepo(window, testLibraryPath)

    // Click on a seeded file in the repo tree
    const fileNode = window.locator('[data-testid="writing-tree-node"]').filter({
      hasText: /旧博客/
    }).first()
    await fileNode.click()
    await window.waitForTimeout(1000)

    // Editor should be visible
    await expect(window.locator(SELECTORS.writing.editor)).toBeVisible({ timeout: 5000 })
  })
})
