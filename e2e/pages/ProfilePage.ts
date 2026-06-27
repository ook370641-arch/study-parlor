import { Page, Locator } from '@playwright/test'
import { SELECTORS } from '../helpers/selectors'

export class ProfilePage {
  readonly nameDisplay: Locator
  readonly textDisplay: Locator
  readonly topicsDisplay: Locator
  readonly difficultyDisplay: Locator
  readonly temperatureDisplay: Locator
  readonly editButton: Locator
  readonly saveButton: Locator
  readonly cancelButton: Locator
  readonly exitButton: Locator

  constructor(private page: Page) {
    this.nameDisplay = page.locator(SELECTORS.profile.nameDisplay)
    this.textDisplay = page.locator(SELECTORS.profile.textDisplay)
    this.topicsDisplay = page.locator(SELECTORS.profile.topicsDisplay)
    this.difficultyDisplay = page.locator(SELECTORS.profile.difficultyDisplay)
    this.temperatureDisplay = page.locator(SELECTORS.profile.temperatureDisplay)
    this.editButton = page.locator(SELECTORS.profile.editButton)
    this.saveButton = page.locator(SELECTORS.profile.saveButton)
    this.cancelButton = page.locator(SELECTORS.profile.cancelButton)
    this.exitButton = page.locator(SELECTORS.profile.exitButton)
  }

  async waitForLoaded() {
    await this.nameDisplay.waitFor({ state: 'visible' })
  }

  async enterEditMode() {
    await this.editButton.click()
  }

  async setName(name: string) {
    await this.page.locator(SELECTORS.profile.nameInput).fill(name)
  }

  async setProfileText(text: string) {
    await this.page.locator(SELECTORS.profile.textInput).fill(text)
  }

  async setPreferredTopics(topics: string) {
    await this.page.locator(SELECTORS.profile.topicsInput).fill(topics)
  }

  async setDifficulty(difficulty: 'low' | 'mid' | 'high') {
    await this.page.locator(SELECTORS.profile.difficultyButton(difficulty)).click()
  }

  async setTemperature(temperature: 'strict' | 'balanced' | 'creative') {
    await this.page.locator(SELECTORS.profile.temperatureButton(temperature)).click()
  }

  async save() {
    await this.saveButton.click()
  }

  async cancel() {
    await this.cancelButton.click()
  }

  async exit() {
    await this.exitButton.click()
  }
}
