import { test, expect } from '../fixtures/electron'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { CoverPage } from '../pages/CoverPage'
import { SELECTORS } from '../helpers/selectors'
import { seedWritingTree, seedRepository } from '../helpers/test-library'

/**
 * Tree tests. Uses exact text matching for tree nodes to avoid
 * substring collisions (e.g., '随笔' matching '分布式随笔').
 */
test.describe('@p2 writing-tree', () => {
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
})
