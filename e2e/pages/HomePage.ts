import { Page, Locator } from '@playwright/test'
import { SELECTORS } from '../helpers/selectors'

export class HomePage {
  readonly greeting: Locator
  readonly newTopicButton: Locator
  readonly librarySection: Locator
  readonly continueUnsavedButton: Locator
  readonly burnUnsavedButton: Locator
  readonly settingsButton: Locator
  readonly profileButton: Locator
  readonly extensionButton: Locator

  constructor(private page: Page) {
    this.greeting = page.locator(SELECTORS.home.greeting)
    this.newTopicButton = page.locator(SELECTORS.home.newTopicButton)
    this.librarySection = page.locator(SELECTORS.home.librarySection)
    this.continueUnsavedButton = page.locator(SELECTORS.home.continueUnsavedButton)
    this.burnUnsavedButton = page.locator(SELECTORS.home.burnUnsavedButton)
    this.settingsButton = page.locator(SELECTORS.home.settingsButton)
    this.profileButton = page.locator(SELECTORS.home.profileButton)
    this.extensionButton = page.locator(SELECTORS.home.extensionButton)
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

  async expandTopic(index: number = 0) {
    const card = this.page.locator(SELECTORS.home.topicCard).nth(index)
    await card.click()
  }

  async continueTopic(index: number = 0) {
    const button = this.page.locator(SELECTORS.home.topicContinueButton).nth(index)
    await button.click()
  }

  async reviewSession(index: number = 0) {
    const button = this.page.locator(SELECTORS.home.sessionReviewButton).nth(index)
    await button.click()
  }

  async continueUnsavedSession() {
    await this.continueUnsavedButton.click()
  }

  async burnUnsavedSession() {
    await this.burnUnsavedButton.click()
  }

  async assertUnsavedSessionVisible(topic: string) {
    await this.continueUnsavedButton.waitFor({ state: 'visible' })
    const title = this.page.locator(SELECTORS.home.unsavedSessionTitle)
    await title.waitFor({ state: 'visible' })
    const text = await title.textContent()
    if (!text?.includes(topic)) {
      throw new Error(`Expected unsaved session title to include "${topic}", got "${text}"`)
    }
  }

  async isUnsavedSessionVisible(): Promise<boolean> {
    return this.continueUnsavedButton.isVisible().catch(() => false)
  }

  async goToSettings() {
    await this.settingsButton.click()
  }

  async goToProfile() {
    await this.profileButton.click()
  }

  async goToExtension() {
    await this.extensionButton.click()
  }

  async switchInspirationStrategy(version: 'v1' | 'v2' | 'v3') {
    await this.page.locator(SELECTORS.home.strategyOption(version)).click()
  }

  async getGroupRecCardCount(): Promise<number> {
    return this.page.locator(SELECTORS.home.groupRecCard).count()
  }

  async refreshGroupRec(index: number = 0) {
    await this.page.locator(SELECTORS.home.groupRecRefresh).nth(index).click()
  }

  async clickGroupRecTopic(index: number = 0) {
    await this.page.locator(SELECTORS.home.groupRecCard).nth(index).click()
  }
}
