import { test, expect } from '../fixtures/electron'
import type { Page } from '@playwright/test'
import { CoverPage } from '../pages/CoverPage'
import { SELECTORS } from '../helpers/selectors'
import fs from 'node:fs'
import path from 'node:path'

const SIDEBAR = '[data-testid="briefing-source-sidebar"]'
const BTN = (id: string) => `[data-testid="briefing-source-${id}"]`

async function navOrder(window: Page): Promise<string[]> {
  return window.locator(`${SIDEBAR} nav button`).evaluateAll(
    (els: Element[]) => els.map((el) => el.getAttribute('data-testid') ?? ''),
  )
}

test.describe('来源边栏拖拽排序', () => {
  test('拖拽博客到首位 → DOM 顺序与 state.json 同步，重启后保持', async ({ window, testConfigDir }) => {
    const cover = new CoverPage(window)
    await cover.enterName('E2E 测试员')
    await cover.goToBriefing()
    await expect(window.locator(SELECTORS.briefing.page)).toBeVisible()

    expect(await navOrder(window)).toEqual([
      'briefing-source-writing',
      'briefing-source-digest',
      'briefing-source-anthropic',
      'briefing-source-job-briefing',
      'briefing-source-scout',
    ])

    // HTML5 DnD：手动 mouse 事件（dragTo 对 draggable 可靠性差）
    const src = window.locator(BTN('anthropic'))
    const dst = window.locator(BTN('writing'))
    const srcBox = (await src.boundingBox())!
    const dstBox = (await dst.boundingBox())!
    await window.mouse.move(srcBox.x + srcBox.width / 2, srcBox.y + srcBox.height / 2)
    await window.mouse.down()
    await window.mouse.move(dstBox.x + dstBox.width / 2, dstBox.y + 4, { steps: 10 })
    await window.mouse.up()

    await expect.poll(() => navOrder(window)).toEqual([
      'briefing-source-anthropic',
      'briefing-source-writing',
      'briefing-source-digest',
      'briefing-source-job-briefing',
      'briefing-source-scout',
    ])

    // state.json 落盘
    await expect.poll(() => {
      const raw = JSON.parse(fs.readFileSync(path.join(testConfigDir, 'state.json'), 'utf8'))
      return raw.briefingSourceOrder
    }).toEqual(['anthropic', 'writing', 'digest', 'job-briefing', 'scout'])

    // 重载后顺序保持（init 从 state.json 归一化恢复）
    // 注意：enterName 只填输入框不持久化 profile，reload 后需重新填名才能进简报
    await window.reload()
    await window.waitForLoadState('domcontentloaded')
    const cover2 = new CoverPage(window)
    await cover2.enterName('E2E 测试员')
    await cover2.goToBriefing()
    await expect(window.locator(SELECTORS.briefing.page)).toBeVisible()
    expect(await navOrder(window)).toEqual([
      'briefing-source-anthropic',
      'briefing-source-writing',
      'briefing-source-digest',
      'briefing-source-job-briefing',
      'briefing-source-scout',
    ])
  })

  test('折叠态不可拖拽', async ({ window }) => {
    const cover = new CoverPage(window)
    await cover.enterName('E2E 测试员')
    await cover.goToBriefing()
    await expect(window.locator(SELECTORS.briefing.page)).toBeVisible()
    await window.locator('[data-testid="briefing-sidebar-toggle"]').click()
    await expect(window.locator(BTN('anthropic'))).not.toHaveAttribute('draggable', 'true')
  })
})
