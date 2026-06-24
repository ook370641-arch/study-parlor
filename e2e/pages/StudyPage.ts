import { Page, Locator } from '@playwright/test'
import { SELECTORS } from '../helpers/selectors'

export class StudyPage {
  readonly pageElement: Locator
  readonly messageList: Locator
  readonly chatInput: Locator
  readonly sendButton: Locator
  readonly archivePendingBanner: Locator
  readonly archiveButton: Locator

  constructor(private page: Page) {
    this.pageElement = page.locator(SELECTORS.study.page)
    this.messageList = page.locator(SELECTORS.study.messageList)
    this.chatInput = page.locator(SELECTORS.study.chatInput)
    this.sendButton = page.locator(SELECTORS.study.sendButton)
    this.archivePendingBanner = page.locator(SELECTORS.study.archivePendingBanner)
    this.archiveButton = page.locator(SELECTORS.study.archiveButton)
  }

  async waitForLoaded() {
    await this.pageElement.waitFor({ state: 'visible' })
  }

  async waitForAssistantContent(timeout: number = 60000) {
    // Wait until there is at least one assistant message with non-empty text.
    await this.messageList.locator('.assistant, > div')
      .filter({ hasText: /\S/ })
      .first()
      .waitFor({ state: 'visible', timeout })
  }

  async sendMessage(text: string) {
    await this.chatInput.fill(text)
    await this.sendButton.click()
  }

  async archive() {
    await this.archivePendingBanner.waitFor({ state: 'visible' })
    await this.archiveButton.click()
  }
}
