import { test, expect } from '../fixtures/electron'
import { CoverPage } from '../pages/CoverPage'
import { SELECTORS } from '../helpers/selectors'

test.describe('@p1 briefing assistant session persistence', () => {
  test('chat messages survive source switch and return', async ({ window }) => {
    const cover = new CoverPage(window)
    await cover.enterName('E2E 测试员')
    await cover.goToBriefing()

    // Generate briefing
    await window.locator(SELECTORS.briefing.receiveDigestButton).click()
    await window.locator('[data-testid="briefing-reading-pane"]').waitFor({ state: 'visible', timeout: 30000 })

    // Open assistant chat
    const chatTab = window.locator('[data-testid="article-assistant-tab"]')
    await chatTab.waitFor({ state: 'visible', timeout: 10000 })
    await chatTab.click()

    const chatWindow = window.locator('[data-testid="article-assistant-chat-window"]')
    await chatWindow.waitFor({ state: 'visible', timeout: 5000 })

    // Send a message
    await window.locator('[data-testid="article-assistant-input"]').fill('这篇文章讲了什么？')
    await window.locator('[data-testid="article-assistant-send-btn"]').click()

    // Wait for response (mock returns a reply)
    await expect(window.locator('[data-testid="chat-message"]')).toHaveCount(2, { timeout: 10000 })

    // Switch to writing source
    await window.locator(SELECTORS.writing.sourceButton).click()
    await window.locator('[data-testid="writing-board-empty"]').waitFor({ state: 'visible', timeout: 10000 })

    // Switch back to digest
    await window.locator(SELECTORS.briefing.sourceDigestButton).click()
    await window.locator('[data-testid="briefing-reading-pane"]').waitFor({ state: 'visible', timeout: 10000 })

    // Open assistant again
    await chatTab.click()
    await chatWindow.waitFor({ state: 'visible', timeout: 5000 })

    // Verify messages are still there
    const messages = window.locator('[data-testid="chat-message"]')
    await expect(messages).toHaveCount(2, { timeout: 5000 })
  })
})
