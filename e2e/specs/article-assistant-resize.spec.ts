import { test, expect } from '../fixtures/electron'
import { CoverPage } from '../pages/CoverPage'
import { ArticleAssistantPage } from '../pages/ArticleAssistantPage'
import { SELECTORS } from '../helpers/selectors'
import { seedBriefing } from '../helpers/test-library'
import type { Page } from '@playwright/test'

function localToday(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const DIGEST_CONTENT = `## AI Safety

### Box CEO Aaron Levie
Aaron Levie 讨论了 AI 安全与对齐在企业工作流中的落地。

## 原始来源
### Aaron Levie
- [tweet](https://x.com/levie/status/1)`

async function openChatWindow(window: Page, libPath: string): Promise<ArticleAssistantPage> {
  seedBriefing(libPath, localToday(), DIGEST_CONTENT)
  const cover = new CoverPage(window)
  await cover.enterName('E2E 测试员')
  await cover.goToBriefing()
  await window.locator(SELECTORS.briefing.receiveDigestButton).click()
  await expect(window.locator(SELECTORS.briefing.academicLayout)).toBeVisible({ timeout: 15000 })
  const assistant = new ArticleAssistantPage(window)
  await assistant.openChat()
  return assistant
}

test.describe('@p1 旁注窗口 resize', () => {
  test('拖 se 角向右下：尺寸增大且左上角钉死', async ({ window, testLibraryPath }) => {
    const assistant = await openChatWindow(window, testLibraryPath)
    const win = assistant.chatWindow
    const before = (await win.boundingBox())!

    const se = window.locator('[data-testid="resize-handle-se"]')
    const h = (await se.boundingBox())!
    await window.mouse.move(h.x + h.width / 2, h.y + h.height / 2)
    await window.mouse.down()
    await window.mouse.move(h.x + 80, h.y + 80, { steps: 10 })
    await window.mouse.up()

    const after = (await win.boundingBox())!
    expect(after.width).toBeGreaterThan(before.width + 40)
    expect(after.height).toBeGreaterThan(before.height + 40)
    expect(Math.abs(after.x - before.x)).toBeLessThanOrEqual(2)
    expect(Math.abs(after.y - before.y)).toBeLessThanOrEqual(2)
  })

  test('拖 nw 角向左上：右下边缘钉死', async ({ window, testLibraryPath }) => {
    const assistant = await openChatWindow(window, testLibraryPath)
    const win = assistant.chatWindow
    const before = (await win.boundingBox())!
    const rightBefore = before.x + before.width
    const bottomBefore = before.y + before.height

    const nw = window.locator('[data-testid="resize-handle-nw"]')
    const h = (await nw.boundingBox())!
    await window.mouse.move(h.x + h.width / 2, h.y + h.height / 2)
    await window.mouse.down()
    await window.mouse.move(h.x - 60, h.y - 40, { steps: 10 })
    await window.mouse.up()

    const after = (await win.boundingBox())!
    expect(after.width).toBeGreaterThan(before.width + 30)
    expect(Math.abs(after.x + after.width - rightBefore)).toBeLessThanOrEqual(2)
    expect(Math.abs(after.y + after.height - bottomBefore)).toBeLessThanOrEqual(2)
  })

  test('缩到小窗(<320px)：三控件隐藏、发送按钮在界内可点', async ({ window, testLibraryPath }) => {
    const assistant = await openChatWindow(window, testLibraryPath)
    const win = assistant.chatWindow
    const before = (await win.boundingBox())!

    const nw = window.locator('[data-testid="resize-handle-nw"]')
    const h = (await nw.boundingBox())!
    const targetX = before.x + before.width - 280
    await window.mouse.move(h.x + h.width / 2, h.y + h.height / 2)
    await window.mouse.down()
    await window.mouse.move(targetX, h.y + h.height / 2, { steps: 10 })
    await window.mouse.up()

    const after = (await win.boundingBox())!
    expect(after.width).toBeLessThan(320)

    await expect(window.locator('[data-testid="assistant-extras"]')).toBeHidden()
    await expect(assistant.sendBtn).toBeVisible()
    const sendBox = (await assistant.sendBtn.boundingBox())!
    expect(sendBox.x + sendBox.width).toBeLessThanOrEqual(after.x + after.width + 1)

    await assistant.typeQuestion('测试')
    await assistant.send()
    await assistant.waitForAssistantReply()
  })
})
