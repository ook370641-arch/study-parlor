import { Page, Locator } from '@playwright/test'
import { SELECTORS } from '../helpers/selectors'

export class HomePage {
  readonly greeting: Locator
  readonly newTopicButton: Locator
  readonly librarySection: Locator
  readonly continueUnsavedButton: Locator

  constructor(private page: Page) {
    this.greeting = page.locator(SELECTORS.home.greeting)
    this.newTopicButton = page.locator(SELECTORS.home.newTopicButton)
    this.librarySection = page.locator(SELECTORS.home.librarySection)
    this.continueUnsavedButton = page.locator(SELECTORS.home.continueUnsavedButton)
  }

  async waitForLoaded() {
    await this.greeting.waitFor({ state: 'visible' })
    await this.librarySection.waitFor({ state: 'visible' })
  }

  async startNewTopic() {
    await this.newTopicButton.click()
  }

  async getTopicCardCount(): Promise<number> {
    return this.page.locator(SELECTORS.home.topicCard).count()
  }

  async continueUnsavedSession() {
    await this.continueUnsavedButton.click()
  }
}
