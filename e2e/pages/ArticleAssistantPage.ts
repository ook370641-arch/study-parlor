import { Page, Locator } from '@playwright/test'
import { SELECTORS } from '../helpers/selectors'

/**
 * Page object for the article margin assistant (文章旁注助手) overlay that mounts
 * on top of the briefing / anthropic article reader. Encapsulates the open/send
 * waits so specs only express intent. Streaming replies are backed by the
 * deterministic E2E mock in electron/ipc/article-assistant.ts.
 */
export class ArticleAssistantPage {
  readonly tab: Locator
  readonly chatWindow: Locator
  readonly input: Locator
  readonly searchBtn: Locator
  readonly sendBtn: Locator
  readonly stopBtn: Locator

  constructor(private page: Page) {
    this.tab = page.locator(SELECTORS.articleAssistant.tab)
    this.chatWindow = page.locator(SELECTORS.articleAssistant.chatWindow)
    this.input = page.locator(SELECTORS.articleAssistant.input)
    this.searchBtn = page.locator(SELECTORS.articleAssistant.searchBtn)
    this.sendBtn = page.locator(SELECTORS.articleAssistant.sendBtn)
    this.stopBtn = page.locator(SELECTORS.articleAssistant.stopBtn)
  }

  async waitForMounted(timeout = 30000) {
    await this.tab.waitFor({ state: 'visible', timeout })
  }

  async openChat() {
    await this.waitForMounted()
    await this.tab.click()
    await this.chatWindow.waitFor({ state: 'visible' })
  }

  async typeQuestion(text: string) {
    await this.input.fill(text)
  }

  async send() {
    await this.sendBtn.click()
  }

  async clickSearch() {
    await this.searchBtn.click()
  }

  /**
   * Wait until the assistant has produced a non-empty reply. Keys on the store
   * state rather than a fixed sleep so it stays stable regardless of streaming
   * timing. window.useStore is the E2E automation hook exposed by src/store.
   */
  async waitForAssistantReply(timeout = 30000) {
    await this.page.waitForFunction(
      () => {
        const s = (window as any).useStore?.getState()?.assistantSession
        if (!s || s.streaming) return false
        return s.messages.some(
          (m: any) => m.role === 'assistant' && m.content.trim().length > 0
        )
      },
      undefined,
      { timeout }
    )
  }
}
