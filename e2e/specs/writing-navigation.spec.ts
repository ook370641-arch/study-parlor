import { test, expect } from '../fixtures/electron'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { CoverPage } from '../pages/CoverPage'
import { SELECTORS } from '../helpers/selectors'
import { seedWritingTree, seedRepository, seedCatalogJson } from '../helpers/test-library'

test.describe('@p2 writing-navigation', () => {
  test('点击 writing 源 → 列表栏出现', async ({ window, testLibraryPath }) => {
    seedWritingTree(testLibraryPath)

    const cover = new CoverPage(window)
    await cover.enterName('E2E 测试员')
    await cover.goToBriefing()
    await expect(window.locator(SELECTORS.briefing.sourceSidebar)).toBeVisible({ timeout: 10000 })

    await window.locator(SELECTORS.writing.sourceButton).click()
    await expect(window.locator(SELECTORS.writing.listTabArticles)).toBeVisible({ timeout: 15000 })

    // Tree nodes should render
    await window.waitForTimeout(2000)
    const treeNodes = window.locator('[data-testid="writing-tree-node"]')
    expect(await treeNodes.count()).toBeGreaterThan(0)
  })

  test('切换到其他源再切回来：源切换正常', async ({ window, testLibraryPath }) => {
    seedWritingTree(testLibraryPath)

    const cover = new CoverPage(window)
    await cover.enterName('E2E 测试员')
    await cover.goToBriefing()
    await expect(window.locator(SELECTORS.briefing.sourceSidebar)).toBeVisible({ timeout: 10000 })

    await window.locator(SELECTORS.writing.sourceButton).click()
    await expect(window.locator(SELECTORS.writing.listTabArticles)).toBeVisible({ timeout: 15000 })

    // Switch to digest and back
    await window.locator(SELECTORS.briefing.sourceDigestButton).click()
    await expect(window.locator(SELECTORS.writing.listTabArticles)).not.toBeVisible({ timeout: 5000 })

    await window.locator(SELECTORS.writing.sourceButton).click()
    await expect(window.locator(SELECTORS.writing.listTabArticles)).toBeVisible({ timeout: 15000 })
  })

  test('Reload 后来源/tab 持久化（state.json 断言）', async ({ window, testLibraryPath, testConfigDir }) => {
    seedWritingTree(testLibraryPath)
    seedRepository(testLibraryPath)

    const cover = new CoverPage(window)
    await cover.enterName('E2E 测试员')
    await cover.goToBriefing()
    await expect(window.locator(SELECTORS.briefing.sourceSidebar)).toBeVisible({ timeout: 10000 })

    await window.locator(SELECTORS.writing.sourceButton).click()
    await expect(window.locator(SELECTORS.writing.listTabArticles)).toBeVisible({ timeout: 15000 })

    // Switch to repository tab
    await window.locator(SELECTORS.writing.listTabRepository).click()
    await expect(window.locator(SELECTORS.writing.listTabRepository)).toBeVisible()
    await window.waitForTimeout(500)

    // Verify state.json persistence
    const statePath = path.join(testConfigDir, 'state.json')
    const state = JSON.parse(fs.readFileSync(statePath, 'utf8'))
    expect(state.briefingSource).toBe('writing')
    expect(state.writingListTab).toBe('repository')
  })

  // 2026-09-22 用户反馈:每次打开恢复到上次的文章与浏览位置。
  // lastWritingFile/writingScrollMemory 均落 state.json,进入写作页即恢复。
  test('打开文章+滚动 → reload → 恢复同一文章与浏览位置', async ({ window, testLibraryPath, testConfigDir }) => {
    seedWritingTree(testLibraryPath)
    seedRepository(testLibraryPath)
    seedCatalogJson(testLibraryPath)

    const cover = new CoverPage(window)
    await cover.enterName('E2E 测试员')
    await cover.goToBriefing()
    await expect(window.locator(SELECTORS.briefing.sourceSidebar)).toBeVisible({ timeout: 10000 })
    await window.locator(SELECTORS.writing.sourceButton).click()
    await expect(window.locator(SELECTORS.writing.listTabArticles)).toBeVisible({ timeout: 15000 })
    await window.waitForTimeout(1200)

    const editor = window.locator('[data-testid="writing-editor"]')
    // 自动选中第一篇文章后,改开「分布式随笔」(depth-0 分组默认展开)
    await window.locator('[data-testid="writing-tree-node"]').filter({ hasText: /分布式随笔/ }).first().click()
    await expect(editor.locator('.ProseMirror')).toContainText('关于分布式系统的思考', { timeout: 5000 })

    // 打高文档使其可滚动(段中 Enter=新段落,Typora 式)
    await editor.locator('.ProseMirror').click()
    await window.keyboard.press('Control+End')
    for (let i = 0; i < 40; i++) {
      await window.keyboard.type(`滚动测试段落${i}`)
      await window.keyboard.press('Enter')
    }
    // 必须等 autosave(1.5s 防抖)落盘再 reload,否则打高的段落全丢,
    // 短文档滚不动,恢复断言恒为 0
    await expect(window.locator('[data-testid="writing-save-status"]')).toContainText('已保存', { timeout: 8000 })

    // 滚到底部,等 400ms 防抖(2026-10-02 起改退出时落盘:此刻 state.json 不应有滚动位置)
    await editor.evaluate((el: HTMLElement) => { el.scrollTop = el.scrollHeight })
    await window.waitForTimeout(1000)

    const before = JSON.parse(fs.readFileSync(path.join(testConfigDir, 'state.json'), 'utf8'))
    expect(before.lastWritingFile ?? '').toContain('分布式随笔.md')
    expect(before.writingScrollMemory ?? null).toBeNull()

    // reload 触发 beforeunload 落盘 → state.json 出现滚动位置槽位
    await window.reload()
    await window.waitForLoadState('domcontentloaded')
    const state = JSON.parse(fs.readFileSync(path.join(testConfigDir, 'state.json'), 'utf8'))
    expect(state.writingScrollMemory?.filePath ?? '').toContain('分布式随笔')
    expect(state.writingScrollMemory?.blockIndex ?? 0).toBeGreaterThan(0)

    // 重新走封面 → 简报 → 写作来源(reload 后 currentPage 回到 cover)
    const cover2 = new CoverPage(window)
    await cover2.enterName('E2E 测试员')
    await cover2.goToBriefing()
    await expect(window.locator(SELECTORS.briefing.sourceSidebar)).toBeVisible({ timeout: 10000 })
    await window.locator(SELECTORS.writing.sourceButton).click()
    await expect(window.locator(SELECTORS.writing.listTabArticles)).toBeVisible({ timeout: 15000 })

    // 恢复上次打开的文章(而不是自动选第一篇)
    await expect(editor.locator('.ProseMirror')).toContainText('关于分布式系统的思考', { timeout: 10000 })
    // 恢复浏览位置(滚动恢复轮询最多 ~2s)
    await expect
      .poll(async () => editor.evaluate((el: HTMLElement) => el.scrollTop), { timeout: 8000 })
      .toBeGreaterThan(0)
  })
})
