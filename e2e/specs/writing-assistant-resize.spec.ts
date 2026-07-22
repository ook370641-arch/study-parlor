import { test, expect } from '../fixtures/electron'
import { CoverPage } from '../pages/CoverPage'
import { WritingAssistantPanel } from '../pages/WritingAssistantPanel'
import { SELECTORS } from '../helpers/selectors'
import { seedWritingTree } from '../helpers/test-library'

async function setup(window: any, testLibraryPath: string) {
  seedWritingTree(testLibraryPath)
  const cover = new CoverPage(window)
  await cover.enterName('E2E 测试员')
  await cover.goToBriefing()
  await expect(window.locator(SELECTORS.briefing.sourceSidebar)).toBeVisible({ timeout: 10000 })
  await window.locator(SELECTORS.writing.sourceButton).click()
  await expect(window.locator(SELECTORS.writing.listTabArticles)).toBeVisible({ timeout: 15000 })
  await window.waitForTimeout(1500)
}

test.describe('@p2 writing-assistant-resize', () => {
  test('拖 resize handle 向左 → 面板宽度增大', async ({ window, testLibraryPath }) => {
    await setup(window, testLibraryPath)

    const assistant = new WritingAssistantPanel(window)
    await assistant.open()

    const panel = window.locator(SELECTORS.writing.assistantPanel)
    const before = (await panel.boundingBox())!

    // Resize handle is on the LEFT edge of the panel — drag left to expand
    const handle = window.locator(SELECTORS.writing.assistantResizeHandle)
    const h = (await handle.boundingBox())!
    await window.mouse.move(h.x + h.width / 2, h.y + h.height / 2)
    await window.mouse.down()
    await window.mouse.move(h.x - 60, h.y + h.height / 2, { steps: 10 })
    await window.mouse.up()

    const after = (await panel.boundingBox())!
    expect(after.width).toBeGreaterThan(before.width + 30)
  })

  test('拖 resize handle 向右 → 面板宽度缩小，不低于 200px', async ({ window, testLibraryPath }) => {
    await setup(window, testLibraryPath)

    const assistant = new WritingAssistantPanel(window)
    await assistant.open()

    const panel = window.locator(SELECTORS.writing.assistantPanel)
    const before = (await panel.boundingBox())!

    // Resize handle is on the LEFT edge — drag right to shrink
    const handle = window.locator(SELECTORS.writing.assistantResizeHandle)
    const h = (await handle.boundingBox())!
    await window.mouse.move(h.x + h.width / 2, h.y + h.height / 2)
    await window.mouse.down()
    await window.mouse.move(h.x + 200, h.y + h.height / 2, { steps: 10 })
    await window.mouse.up()

    const after = (await panel.boundingBox())!
    // Width should shrink but not below 200px (MIN in WritingAssistantPanel.tsx)
    expect(after.width).toBeLessThan(before.width - 50)
    expect(after.width).toBeGreaterThanOrEqual(200)
  })
})
