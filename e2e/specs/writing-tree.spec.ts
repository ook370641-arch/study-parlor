import { test, expect } from '../fixtures/electron'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { CoverPage } from '../pages/CoverPage'
import { SELECTORS } from '../helpers/selectors'
import { seedWritingTree, seedRepository, seedCatalogJson } from '../helpers/test-library'

/**
 * Tree tests. Uses exact text matching for tree nodes to avoid
 * substring collisions (e.g., '随笔' matching '分布式随笔').
 */
test.describe('@p2 writing-tree', () => {
  async function gotoWriting(window: any, testLibraryPath: string) {
    seedWritingTree(testLibraryPath)
    seedRepository(testLibraryPath)
    seedCatalogJson(testLibraryPath)

    const cover = new CoverPage(window)
    await cover.enterName('E2E 测试员')
    await cover.goToBriefing()
    await expect(window.locator(SELECTORS.briefing.sourceSidebar)).toBeVisible({ timeout: 10000 })
    await window.locator(SELECTORS.writing.sourceButton).click()
    await expect(window.locator(SELECTORS.writing.listTabArticles)).toBeVisible({ timeout: 15000 })
    await window.waitForTimeout(1500)
  }

  test('嵌套树渲染：树节点数量 >= 2', async ({ window, testLibraryPath }) => {
    await gotoWriting(window, testLibraryPath)

    const nodes = window.locator('[data-testid="writing-tree-node"]')
    expect(await nodes.count()).toBeGreaterThanOrEqual(2)
  })

  test('新建文章：prompt 输入 → 文件在磁盘', async ({ window, testLibraryPath }) => {
    await gotoWriting(window, testLibraryPath)

    await window.locator(SELECTORS.writing.newFileButton).click()
    await window.getByTestId('writing-prompt-input').fill('我的新文章')
    await window.getByTestId('writing-prompt-confirm').click()
    await window.waitForTimeout(1500)

    // File should exist on disk
    expect(fs.existsSync(path.join(testLibraryPath, 'writing', '我的新文章.md'))).toBe(true)
  })

  test('新建分组：右键 → 新建子分组', async ({ window, testLibraryPath }) => {
    await gotoWriting(window, testLibraryPath)

    // Find the 随笔 directory node (not 分布式随笔)
    const essaysNode = window.locator('[data-testid="writing-tree-node"]').filter({
      hasText: /^[▾▸]随笔$/
    }).first()
    await essaysNode.click({ button: 'right' })
    await expect(window.getByRole('button', { name: '新建子分组', exact: true })).toBeVisible({ timeout: 3000 })
    await window.getByRole('button', { name: '新建子分组', exact: true }).click()

    await window.getByTestId('writing-prompt-input').fill('子分组测试')
    await window.getByTestId('writing-prompt-confirm').click()
    await window.waitForTimeout(1500)

    expect(fs.existsSync(path.join(testLibraryPath, 'writing', '随笔', '子分组测试'))).toBe(true)
  })

  test('重命名：右键 → 文件更名（含 .md 后缀）', async ({ window, testLibraryPath }) => {
    await gotoWriting(window, testLibraryPath)

    // Find the file node for 七月夜话.md
    const fileNode = window.locator('[data-testid="writing-tree-node"]').filter({
      hasText: /七月夜话\.md/
    }).first()
    await fileNode.click({ button: 'right' })
    await expect(window.getByRole('button', { name: '重命名', exact: true })).toBeVisible({ timeout: 3000 })
    await window.getByRole('button', { name: '重命名', exact: true }).click()

    // Must include .md extension
    await window.getByTestId('writing-prompt-input').fill('八月夜话.md')
    await window.getByTestId('writing-prompt-confirm').click()
    await window.waitForTimeout(1500)

    expect(fs.existsSync(path.join(testLibraryPath, 'writing', '随笔', '八月夜话.md'))).toBe(true)
    expect(fs.existsSync(path.join(testLibraryPath, 'writing', '随笔', '七月夜话.md'))).toBe(false)
  })

  test('删除确认：cancel → 文件仍在；confirm → 文件删除', async ({ window, testLibraryPath }) => {
    await gotoWriting(window, testLibraryPath)

    const deleteButton = () => window.getByRole('button', { name: '删除', exact: true })

    const fileNode = window.locator('[data-testid="writing-tree-node"]').filter({
      hasText: /七月夜话\.md/
    }).first()
    await fileNode.click({ button: 'right' })
    await expect(deleteButton()).toBeVisible({ timeout: 3000 })

    // Cancel — fire-and-forget click: window.confirm blocks the renderer synchronously,
    // so awaiting click() would deadlock before we can handle the dialog.
    let dialogPromise = window.waitForEvent('dialog')
    void deleteButton().click()
    let dialog = await dialogPromise
    await dialog.dismiss()
    await window.waitForTimeout(500)
    expect(fs.existsSync(path.join(testLibraryPath, 'writing', '随笔', '七月夜话.md'))).toBe(true)

    // Confirm — re-open context menu
    await fileNode.click({ button: 'right' })
    await expect(deleteButton()).toBeVisible({ timeout: 3000 })
    dialogPromise = window.waitForEvent('dialog')
    void deleteButton().click()
    dialog = await dialogPromise
    await dialog.accept()
    await window.waitForTimeout(1500)
    expect(fs.existsSync(path.join(testLibraryPath, 'writing', '随笔', '七月夜话.md'))).toBe(false)
  })

  test('伴生文件不显示：.assistant.md 不在树中', async ({ window, testLibraryPath }) => {
    await gotoWriting(window, testLibraryPath)

    const allNodes = window.locator('[data-testid="writing-tree-node"]')
    const texts = await allNodes.allTextContents()
    expect(texts.some((t: string) => t.includes('.assistant'))).toBe(false)
  })

  test('拖拽移动文件到另一目录：磁盘位置变化 + 树更新', async ({ window, testLibraryPath }) => {
    await gotoWriting(window, testLibraryPath)

    // Verify source file exists initially
    const srcPath = path.join(testLibraryPath, 'writing', '技术笔记', '子组', '深度文章.md')
    expect(fs.existsSync(srcPath)).toBe(true)

    // Use Playwright dragTo: drag "深度文章" node onto "随笔" directory node
    const srcNode = window.locator('[data-testid="writing-tree-node"]').filter({ hasText: '深度文章' }).first()
    const targetDir = window.locator('[data-testid="writing-tree-node"]').filter({ hasText: /^[▾▸]随笔$/ }).first()

    await srcNode.dragTo(targetDir)
    await window.waitForTimeout(1500)

    // File should have moved
    const newPath = path.join(testLibraryPath, 'writing', '随笔', '深度文章.md')
    expect(fs.existsSync(newPath)).toBe(true)
    expect(fs.existsSync(srcPath)).toBe(false)
  })

  test('hover 文件节点 → 显示 catalog 摘要', async ({ window, testLibraryPath }) => {
    await gotoWriting(window, testLibraryPath)

    // seedWritingTree + seedCatalogJson ensure 七月夜话 has a summary
    const fileNode = window.locator('[data-testid="writing-tree-node"]').filter({ hasText: /七月夜话/ }).first()
    await fileNode.hover()
    await window.waitForTimeout(500)

    // Summary text should appear (seeded catalog entry: "关于七月的随笔")
    const nodeText = await fileNode.textContent()
    expect(nodeText).toContain('关于七月的随笔')
  })
})
