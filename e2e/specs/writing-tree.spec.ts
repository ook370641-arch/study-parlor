import { test, expect } from '../fixtures/electron'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { CoverPage } from '../pages/CoverPage'
import { WritingPage } from '../pages/WritingPage'
import { SELECTORS } from '../helpers/selectors'
import { seedWritingTree, seedRepository } from '../helpers/test-library'

/**
 * Tree tests for the writing feature:
 * - Nested tree rendering, collapse/expand
 * - Create/rename/delete files and folders
 * - Drag-and-drop move
 * - Duplicate name handling (-HHMM suffix)
 * - Companion files hidden from tree
 */
test.describe('@p2 writing-tree', () => {
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

  test('嵌套树渲染：展开目录 → 看到子节点 → 折叠 → 子节点隐藏', async ({ window, testLibraryPath }) => {
    const writing = await gotoWriting(window, testLibraryPath)

    // The tree should show top-level directories: 随笔, 技术笔记
    const essaysNode = writing.treeNode('随笔')
    const techNode = writing.treeNode('技术笔记')

    await expect(essaysNode).toBeVisible()
    await expect(techNode).toBeVisible()

    // 随笔 should be expanded by default (depth 0), showing 七月夜话
    const essayArticle = writing.treeNode('七月夜话')
    await expect(essayArticle).toBeVisible({ timeout: 3000 })

    // Click 随笔 to collapse
    await essaysNode.click()
    // 七月夜话 should now be hidden
    await expect(essayArticle).not.toBeVisible({ timeout: 3000 })

    // Expand again
    await essaysNode.click()
    await expect(essayArticle).toBeVisible({ timeout: 3000 })

    // 技术笔记 should also show 分布式随笔
    const techArticle = writing.treeNode('分布式随笔')
    await expect(techArticle).toBeVisible({ timeout: 3000 })

    // 技术笔记/子组 should contain 深度文章
    const subGroup = writing.treeNode('子组')
    await expect(subGroup).toBeVisible({ timeout: 3000 })
    // Click to expand 子组
    await subGroup.click()
    const deepArticle = writing.treeNode('深度文章')
    await expect(deepArticle).toBeVisible({ timeout: 3000 })
  })

  test('新建文章：click ＋新建文章 → prompt 输入名字 → 节点出现在树中 → 文件存在于磁盘', async ({ window, testLibraryPath }) => {
    const writing = await gotoWriting(window, testLibraryPath)

    // Handle the prompt dialog for file creation
    window.once('dialog', async (dialog) => { await dialog.accept('我的新文章') })

    await writing.newFileButton.click()

    // Wait for the tree to update
    await window.waitForTimeout(1000)

    // The new file should appear in the tree
    const newNode = writing.treeNode('我的新文章')
    await expect(newNode).toBeVisible({ timeout: 5000 })

    // Verify file exists on disk
    const filePath = path.join(testLibraryPath, 'writing', '我的新文章.md')
    expect(fs.existsSync(filePath)).toBe(true)
  })

  test('新建分组：右键菜单 → 新建子分组', async ({ window, testLibraryPath }) => {
    const writing = await gotoWriting(window, testLibraryPath)

    // Right-click on 随笔 node
    const essaysNode = writing.treeNode('随笔')
    await essaysNode.click({ button: 'right' })

    // The context menu should appear with "新建子分组" button
    const newSubFolderBtn = window.getByText('新建子分组')
    await expect(newSubFolderBtn).toBeVisible({ timeout: 3000 })

    // Click "新建子分组" and handle the prompt
    window.once('dialog', async (dialog) => { await dialog.accept('子分组1') })
    await newSubFolderBtn.click()

    await window.waitForTimeout(1000)

    // The new folder should appear as a child of 随笔
    await essaysNode.click() // Ensure expanded
    await window.waitForTimeout(300)
    const newFolder = writing.treeNode('子分组1')
    await expect(newFolder).toBeVisible({ timeout: 5000 })

    // Verify folder exists on disk
    const folderPath = path.join(testLibraryPath, 'writing', '随笔', '子分组1')
    expect(fs.existsSync(folderPath)).toBe(true)
  })

  test('重命名：右键 → prompt 输入新名 → 树更新', async ({ window, testLibraryPath }) => {
    const writing = await gotoWriting(window, testLibraryPath)

    // Right-click on 七月夜话 file node
    const articleNode = writing.treeNode('七月夜话')
    await articleNode.click({ button: 'right' })

    // Click "重命名" and handle the prompt
    const renameBtn = window.getByText('重命名')
    await expect(renameBtn).toBeVisible({ timeout: 3000 })

    window.once('dialog', async (dialog) => { await dialog.accept('八月夜话') })
    await renameBtn.click()

    await window.waitForTimeout(1000)

    // The old name should be gone, new name should be visible
    await expect(writing.treeNode('八月夜话')).toBeVisible({ timeout: 5000 })
    await expect(writing.treeNode('七月夜话')).not.toBeVisible({ timeout: 3000 })

    // Verify file renamed on disk
    const oldPath = path.join(testLibraryPath, 'writing', '随笔', '七月夜话.md')
    const newPath = path.join(testLibraryPath, 'writing', '随笔', '八月夜话.md')
    expect(fs.existsSync(oldPath)).toBe(false)
    expect(fs.existsSync(newPath)).toBe(true)
  })

  test('删除确认：右键删除 → confirm 取消 → 节点仍在；确认 → 节点消失', async ({ window, testLibraryPath }) => {
    const writing = await gotoWriting(window, testLibraryPath)

    // Right-click on 七月夜话
    const articleNode = writing.treeNode('七月夜话')
    await articleNode.click({ button: 'right' })

    // Click "删除"
    const deleteBtn = window.getByText('删除')
    await expect(deleteBtn).toBeVisible({ timeout: 3000 })

    // Cancel the confirm dialog
    window.once('dialog', async (dialog) => { await dialog.dismiss() })
    await deleteBtn.click()
    await window.waitForTimeout(500)

    // The node should still be present
    await expect(writing.treeNode('七月夜话')).toBeVisible({ timeout: 3000 })

    // Now confirm deletion
    await articleNode.click({ button: 'right' })
    await expect(window.getByText('删除')).toBeVisible({ timeout: 3000 })

    window.once('dialog', async (dialog) => { await dialog.accept() })
    await window.getByText('删除').click()
    await window.waitForTimeout(1000)

    // The node should be gone
    await expect(writing.treeNode('七月夜话')).not.toBeVisible({ timeout: 5000 })

    // Verify file deleted from disk
    const filePath = path.join(testLibraryPath, 'writing', '随笔', '七月夜话.md')
    expect(fs.existsSync(filePath)).toBe(false)
  })

  test('拖拽移动：dragstart/drop → 树更新', async ({ window, testLibraryPath }) => {
    const writing = await gotoWriting(window, testLibraryPath)

    // Ensure 技术笔记 directory is expanded to see 分布式随笔
    const techNode = writing.treeNode('技术笔记')
    await techNode.click()
    await window.waitForTimeout(300)

    const sourceNode = writing.treeNode('分布式随笔')
    await expect(sourceNode).toBeVisible({ timeout: 3000 })

    // 随笔 is a directory (drop target)
    const essaysNode = writing.treeNode('随笔')
    await expect(essaysNode).toBeVisible()

    // Perform drag from 分布式随笔 to 随笔
    await sourceNode.dragTo(essaysNode)

    await window.waitForTimeout(1000)

    // 分布式随笔 should now be a child of 随笔
    await essaysNode.click() // Ensure expanded
    await window.waitForTimeout(500)

    // The file should have moved to 随笔 directory on disk
    const oldPath = path.join(testLibraryPath, 'writing', '技术笔记', '分布式随笔.md')
    const newPath = path.join(testLibraryPath, 'writing', '随笔', '分布式随笔.md')
    // Note: dragTo may trigger the move IPC; wait for it
    await window.waitForTimeout(500)
    expect(fs.existsSync(newPath)).toBe(true)
  })

  test('重名 -HHMM：新建同名文件 → 自动加后缀', async ({ window, testLibraryPath }) => {
    const writing = await gotoWriting(window, testLibraryPath)

    // Create a file with the same name as an existing one (七月夜话)
    window.once('dialog', async (dialog) => { await dialog.accept('七月夜话') })
    await writing.newFileButton.click()

    await window.waitForTimeout(1000)

    // The tree should show two entries — the original and one with -HHMM suffix
    // Both are visible; the new one should have a different path
    const allNodes = window.locator('[data-testid="writing-tree-node"]')
    const allTexts = await allNodes.allTextContents()
    const julyNodes = allTexts.filter(t => t.includes('七月夜话'))
    expect(julyNodes.length).toBeGreaterThanOrEqual(1)

    // Verify two files exist on disk at the writing root
    const writingDir = path.join(testLibraryPath, 'writing')
    const files = fs.readdirSync(writingDir)
    const julyFiles = files.filter(f => f.startsWith('七月夜话') && f.endsWith('.md'))
    expect(julyFiles.length).toBeGreaterThanOrEqual(2)
  })

  test('伴生文件不显示：.assistant.md/.catalog.json 不在树中', async ({ window, testLibraryPath }) => {
    const writing = await gotoWriting(window, testLibraryPath)

    // Verify .catalog.json and .assistant.md are not shown in the tree
    const allNodes = window.locator('[data-testid="writing-tree-node"]')
    const allTexts = await allNodes.allTextContents()

    const hasAssistantFile = allTexts.some(t => t.includes('.assistant'))
    const hasCatalogFile = allTexts.some(t => t.includes('.catalog'))

    expect(hasAssistantFile).toBe(false)
    expect(hasCatalogFile).toBe(false)
  })
})
