import { test, expect } from '../fixtures/electron'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { CoverPage } from '../pages/CoverPage'
import { WritingAssistantPanel } from '../pages/WritingAssistantPanel'
import { SELECTORS } from '../helpers/selectors'
import { seedWritingTree } from '../helpers/test-library'

// 写作对照滚动位置记忆(2026-10-03 用户反馈:写作对照位置此前从未持久化,
// CompanionBoard 未接 useScrollMemory;且只记最后四个槽位——主文/博客/二者对照)。
// seedWritingTree 树结构同 writing-companion-pane.spec.ts:
//   writing/技术笔记/分布式随笔.md ← 对照文;writing/随笔/七月夜话.md ← 主文
const COMPANION_SCROLLER = '[data-testid="companion-editor"]'

function treeNode(window: any, name: string) {
  return window.locator('[data-testid="writing-tree-node"]').filter({ hasText: name })
}

async function gotoWriting(window: any) {
  const cover = new CoverPage(window)
  await cover.enterName('E2E 测试员')
  await cover.goToBriefing()
  await expect(window.locator(SELECTORS.briefing.sourceSidebar)).toBeVisible({ timeout: 10000 })
  await window.locator(SELECTORS.writing.sourceButton).click()
  await expect(window.locator(SELECTORS.writing.listTabArticles)).toBeVisible({ timeout: 15000 })
  await window.waitForTimeout(1200)
}

test.describe('@p2 writing-companion-scroll', () => {
  test('对照文滚动 → reload(beforeunload 落盘)→ 对照文与位置一并恢复', async ({ window, testLibraryPath, testConfigDir }) => {
    seedWritingTree(testLibraryPath)
    await gotoWriting(window)

    // 面板折叠态点树 = 切主文(七月夜话)
    await treeNode(window, '七月夜话').click()
    await window.waitForFunction(
      () => (window as any).useStore.getState().writingFile?.path?.includes('七月夜话'),
    )

    // 展开面板切对照 tab,点树选对照文(分布式随笔)
    const assistant = new WritingAssistantPanel(window)
    await assistant.open()
    await expect(window.locator('[data-testid="writing-panel-tab-companion"]')).toBeVisible()
    await window.locator('[data-testid="writing-panel-tab-companion"]').click()
    await expect(window.locator('[data-testid="companion-empty"]')).toBeVisible()
    await treeNode(window, '分布式随笔').click()
    await window.waitForFunction(
      () => (window as any).useStore.getState().companionFile?.path?.includes('分布式随笔'),
    )
    await expect(window.locator('[data-testid="companion-board"]')).toBeVisible()

    // 在对照编辑器打高文档使其可滚动(段中 Enter=新段落)
    const compScroller = window.locator(COMPANION_SCROLLER)
    await compScroller.locator('.ProseMirror').click()
    await window.keyboard.press('Control+End')
    for (let i = 0; i < 40; i++) {
      await window.keyboard.type(`对照滚动段落${i}`)
      await window.keyboard.press('Enter')
    }
    // 等对照 autosave(1.5s 防抖)落盘,否则 reload 后短文档滚不动
    await expect(window.locator('[data-testid="companion-save-status"]')).toContainText('已保存', { timeout: 8000 })

    // 滚到底部,等 400ms 防抖(退出时落盘:此刻 state.json 不应有对照滚动槽位)
    await compScroller.evaluate((el: HTMLElement) => { el.scrollTop = el.scrollHeight; el.dispatchEvent(new Event('scroll')) })
    await window.waitForTimeout(1500)
    const before = JSON.parse(fs.readFileSync(path.join(testConfigDir, 'state.json'), 'utf8'))
    expect(before.writingCompanionScrollMemory ?? null).toBeNull()

    // reload → beforeunload sendSync 落盘
    await window.reload()
    await window.waitForLoadState('domcontentloaded')
    const state = JSON.parse(fs.readFileSync(path.join(testConfigDir, 'state.json'), 'utf8'))
    expect(state.writingCompanionScrollMemory?.filePath ?? '').toContain('分布式随笔')
    expect(state.writingCompanionScrollMemory?.blockIndex ?? 0).toBeGreaterThan(0)

    // 重回写作源:主文(lastWritingFile)+ 对照文(writingCompanionMap + companion 模式)+ 位置全恢复
    await gotoWriting(window)
    await expect(window.locator('[data-testid="companion-board"]')).toBeVisible({ timeout: 10000 })
    await expect(window.locator('[data-testid="companion-filename"]')).toContainText('分布式随笔')
    await expect
      .poll(() => window.locator(COMPANION_SCROLLER).evaluate((el: HTMLElement) => el.scrollTop), { timeout: 8000 })
      .toBeGreaterThan(0)
  })
})
