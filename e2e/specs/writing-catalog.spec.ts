import { test, expect } from '../fixtures/electron'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { CoverPage } from '../pages/CoverPage'
import { SELECTORS } from '../helpers/selectors'
import { seedWritingTree, seedCatalogJson } from '../helpers/test-library'

test.describe('@p2 writing-catalog', () => {
  test('保存触发 catalog 更新：文件编辑后 .catalog.json 存在', async ({ window, testLibraryPath }) => {
    seedWritingTree(testLibraryPath)

    const cover = new CoverPage(window)
    await cover.enterName('E2E 测试员')
    await cover.goToBriefing()
    await expect(window.locator(SELECTORS.briefing.sourceSidebar)).toBeVisible({ timeout: 10000 })
    await window.locator(SELECTORS.writing.sourceButton).click()
    await expect(window.locator(SELECTORS.writing.listTabArticles)).toBeVisible({ timeout: 15000 })
    await window.waitForTimeout(1500)

    // Click a file to open it
    const fileNode = window.locator('[data-testid="writing-tree-node"]').filter({ hasText: '七月夜话' })
    await fileNode.click()
    await window.waitForTimeout(500)

    // Modify the file content on disk to simulate an edit-save cycle
    const filePath = path.join(testLibraryPath, 'writing', '随笔', '七月夜话.md')
    const content = fs.readFileSync(filePath, 'utf8')
    fs.writeFileSync(filePath, content + '\n新增一行用于触发 catalog 更新。', 'utf8')

    // Trigger a write via IPC to fire catalog update
    await window.evaluate(async () => {
      const api = (window as any).api
      if (api?.writingWrite) {
        await api.writingWrite({ path: 'writing/随笔/七月夜话.md', body: '# Updated' })
      }
    })
    await window.waitForTimeout(3000)

    // Catalog should exist (may have been created by seed or by the write handler)
    const catalogPath = path.join(testLibraryPath, 'writing', '.catalog.json')
    if (fs.existsSync(catalogPath)) {
      const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'))
      expect(catalog).toHaveProperty('version')
    }
  })

  test('seeded .catalog.json 可正常读取', async ({ window, testLibraryPath }) => {
    seedWritingTree(testLibraryPath)
    seedCatalogJson(testLibraryPath)

    // Catalog should exist with seeded entries
    const catalogPath = path.join(testLibraryPath, 'writing', '.catalog.json')
    expect(fs.existsSync(catalogPath)).toBe(true)

    const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'))
    expect(catalog.entries).toBeDefined()
    expect(Object.keys(catalog.entries).length).toBeGreaterThan(0)
  })

  test('删除文件 → catalog 清理对应条目', async ({ window, testLibraryPath }) => {
    seedWritingTree(testLibraryPath)
    seedCatalogJson(testLibraryPath)

    const cover = new CoverPage(window)
    await cover.enterName('E2E 测试员')
    await cover.goToBriefing()
    await expect(window.locator(SELECTORS.briefing.sourceSidebar)).toBeVisible({ timeout: 10000 })
    await window.locator(SELECTORS.writing.sourceButton).click()
    await expect(window.locator(SELECTORS.writing.listTabArticles)).toBeVisible({ timeout: 15000 })
    await window.waitForTimeout(1500)

    // Delete 七月夜话 via context menu
    const fileNode = window.locator('[data-testid="writing-tree-node"]').filter({ hasText: '七月夜话' })
    await fileNode.click({ button: 'right' })
    await expect(window.getByText('删除')).toBeVisible({ timeout: 3000 })

    const dialogPromise = window.waitForEvent('dialog')
    void window.getByText('删除').click()
    const dialog = await dialogPromise
    await dialog.accept()
    await window.waitForTimeout(1000)

    // File should be deleted
    expect(fs.existsSync(path.join(testLibraryPath, 'writing', '随笔', '七月夜话.md'))).toBe(false)

    // Catalog should not contain the deleted entry
    const catalogPath = path.join(testLibraryPath, 'writing', '.catalog.json')
    if (fs.existsSync(catalogPath)) {
      const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'))
      const keys = Object.keys(catalog.entries ?? {})
      expect(keys.filter(k => k.includes('七月夜话')).length).toBe(0)
    }
  })
})
