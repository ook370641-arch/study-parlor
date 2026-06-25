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

  async continueTopic(index: number = 0) {
    const button = this.page.locator(SELECTORS.home.topicContinueButton).nth(index)
    await button.click()
  }

  async expandTopic(index: number = 0) {
    const card = this.page.locator(SELECTORS.home.topicCard).nth(index)
    await card.click()
  }

  async reviewSession(index: number = 0) {
    const button = this.page.locator(SELECTORS.home.sessionReviewButton).nth(index)
    await button.click()
  }

  async continueUnsavedSession() {
    await this.continueUnsavedButton.click()
  }
}
