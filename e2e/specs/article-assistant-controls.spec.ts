import { test, expect } from '../fixtures/electron'
import { CoverPage } from '../pages/CoverPage'
import { ArticleAssistantPage } from '../pages/ArticleAssistantPage'
import { SELECTORS } from '../helpers/selectors'
import { seedBriefing } from '../helpers/test-library'
import type { Page } from '@playwright/test'

function localToday(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

async function openDigestArticle(window: Page, libPath: string): Promise<ArticleAssistantPage> {
  const today = localToday()
  seedBriefing(libPath, today)

  const cover = new CoverPage(window)
  await cover.enterIfNeeded('E2E 测试员')
  await cover.goToBriefing()

  await window.locator(SELECTORS.briefing.receiveDigestButton).click()
  await expect(window.locator(SELECTORS.briefing.academicLayout)).toBeVisible({ timeout: 15000 })

  const assistant = new ArticleAssistantPage(window)
  await assistant.waitForMounted()
  return assistant
}

test.describe('@p1 article assistant history', () => {
  test('二次打开文章时显示之前的旁注对话', async ({ window, testLibraryPath }) => {
    const assistant = await openDigestArticle(window, testLibraryPath)
    await assistant.openChat()
    await assistant.typeQuestion('What is Constitutional AI?')
    await assistant.send()
    await assistant.waitForAssistantReply()
    await expect(assistant.chatWindow).toContainText('E2E 测试的')

    // 重新加载渲染进程（state/session 走磁盘），重新进入文章
    await window.reload()
    const assistant2 = await openDigestArticle(window, testLibraryPath)
    await assistant2.openChat()

    // 历史消息应从磁盘恢复；使用宽松超时等待异步 loadAssistantSession 完成
    await expect(assistant2.chatWindow).toContainText('What is Constitutional AI?', { timeout: 15000 })
    await expect(assistant2.chatWindow).toContainText('E2E 测试的')
  })
})
