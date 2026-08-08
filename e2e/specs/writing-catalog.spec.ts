import { test, expect } from '../fixtures/electron'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { CoverPage } from '../pages/CoverPage'
import { SELECTORS } from '../helpers/selectors'
import { seedWritingTree, seedCatalogJson } from '../helpers/test-library'

function readCatalog(lib: string): any | null {
  const p = path.join(lib, 'writing', '.catalog.json')
  if (!fs.existsSync(p)) return null
  return JSON.parse(fs.readFileSync(p, 'utf8'))
}

test.describe('@p2 writing-catalog', () => {
  test('进入写作来源触发 diff 生成：新文章出现 E2E 摘要条目', async ({ window, testLibraryPath }) => {
    // seed 一篇无 catalog 条目的新文章
    fs.mkdirSync(path.join(testLibraryPath, 'writing'), { recursive: true })
    fs.writeFileSync(
      path.join(testLibraryPath, 'writing', 'diff新文章.md'),
      '---\ntype: writing\ntitle: diff新文章\n---\n\n正文内容。\n',
      'utf8'
    )

    const cover = new CoverPage(window)
    await cover.enterName('E2E 测试员')
    await cover.goToBriefing()
    await expect(window.locator(SELECTORS.briefing.sourceSidebar)).toBeVisible({ timeout: 10000 })
    // 默认来源是 digest；点击「写作」触发 setBriefingSource → writingRefreshCatalog
    await window.locator(SELECTORS.writing.sourceButton).click()
    await expect(window.locator(SELECTORS.writing.listTabArticles)).toBeVisible({ timeout: 15000 })

    // 轮询断言条目出现且 summary 为 E2E mock 摘要
    await expect.poll(() => {
      const entry = readCatalog(testLibraryPath)?.entries?.['writing/diff新文章.md']
      return entry?.summary ? entry : null
    }, { timeout: 15000 }).toMatchObject({ title: 'diff新文章', summary: 'E2E 摘要' })

    const entry = readCatalog(testLibraryPath).entries['writing/diff新文章.md']
    expect(typeof entry.mtimeMs).toBe('number')
  })

  test('保存不再立即生成摘要', async ({ window, testLibraryPath }) => {
    fs.mkdirSync(path.join(testLibraryPath, 'writing'), { recursive: true })
    fs.writeFileSync(
      path.join(testLibraryPath, 'writing', '保存静默.md'),
      '---\ntype: writing\ntitle: 保存静默\n---\n\n原始内容。\n',
      'utf8'
    )

    const cover = new CoverPage(window)
    await cover.enterName('E2E 测试员')
    await cover.goToBriefing()
    await expect(window.locator(SELECTORS.briefing.sourceSidebar)).toBeVisible({ timeout: 10000 })
    // 不点击写作来源（不触发 refresh），直接通过 IPC 保存
    await window.evaluate(async () => {
      await (window as any).api.writingWrite({ path: 'writing/保存静默.md', body: '# 改后内容' })
    })
    await window.waitForTimeout(2000)

    // 短窗口内 catalog 不应出现该文件的新条目
    const entry = readCatalog(testLibraryPath)?.entries?.['writing/保存静默.md']
    expect(entry).toBeUndefined()
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

    // 进入来源会触发 diff 生成（seeded 旧格式条目全部重写为带 mtimeMs）。
    // 等它落定再删除，避免后台 updateEntry 与 removeEntry 交错造成假失败。
    await expect.poll(() => {
      const entries = readCatalog(testLibraryPath)?.entries ?? {}
      const keys = Object.keys(entries)
      return keys.length > 0 && keys.every(k => typeof entries[k].mtimeMs === 'number')
    }, { timeout: 15000 }).toBe(true)

    // Delete 七月夜话 via context menu → 渲染端 ConfirmDialog 确认
    const fileNode = window.locator('[data-testid="writing-tree-node"]').filter({ hasText: '七月夜话' })
    await fileNode.click({ button: 'right' })
    const menuDelete = window.getByRole('button', { name: '删除', exact: true })
    await expect(menuDelete).toBeVisible({ timeout: 3000 })
    await menuDelete.click()

    const dialog = window.getByTestId('confirm-dialog')
    await expect(dialog).toBeVisible({ timeout: 3000 })
    await dialog.getByTestId('confirm-dialog-confirm').click()
    await window.waitForTimeout(1000)

    // File should be deleted (moved to trash)
    expect(fs.existsSync(path.join(testLibraryPath, 'writing', '随笔', '七月夜话.md'))).toBe(false)

    // Catalog should not contain the deleted entry
    const catalog = readCatalog(testLibraryPath)
    const keys = Object.keys(catalog?.entries ?? {})
    expect(keys.filter(k => k.includes('七月夜话') && !k.includes('.trash')).length).toBe(0)
  })
})
