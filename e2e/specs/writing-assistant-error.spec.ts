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

test.describe('@p2 writing-assistant-error', () => {
  test.describe('with error injection', () => {
    test.use({ extraEnv: { E2E_WRITING_ASSISTANT_ERROR: 'CHAT_NETWORK_ERROR' } })

    test('错误注入 → "回复失败" + 重试按钮', async ({ window, testLibraryPath }) => {
      await setup(window, testLibraryPath)
      const node = window.locator('[data-testid="writing-tree-node"]').filter({ hasText: '七月夜话' })
      await node.click()
      await window.locator(SELECTORS.writing.editor).waitFor({ state: 'visible', timeout: 5000 })

      const assistant = new WritingAssistantPanel(window)
      await assistant.open()
      await assistant.send('触发错误')
      await window.waitForTimeout(1500)

      await expect(window.getByText('回复失败')).toBeVisible({ timeout: 5000 })
      await expect(window.getByText('重试')).toBeVisible()
    })
  })

  test.describe('without error injection', () => {
    test('正常发送 → 无错误 UI', async ({ window, testLibraryPath }) => {
      await setup(window, testLibraryPath)
      const node = window.locator('[data-testid="writing-tree-node"]').filter({ hasText: '七月夜话' })
      await node.click()
      await window.locator(SELECTORS.writing.editor).waitFor({ state: 'visible', timeout: 5000 })

      const assistant = new WritingAssistantPanel(window)
      await assistant.open()
      await assistant.send('正常消息')
      await assistant.waitForStreamingDone(15000)

      await expect(window.getByText('回复失败')).toHaveCount(0)
    })
  })
})
