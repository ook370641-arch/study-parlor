import { Page, Locator } from '@playwright/test'
import { SELECTORS } from '../helpers/selectors'

export class PreStudyPage {
  readonly modal: Locator
  readonly topicInput: Locator
  readonly startButton: Locator
  readonly cancelButton: Locator

  constructor(private page: Page) {
    this.modal = page.locator(SELECTORS.preStudy.modal)
    this.topicInput = page.locator(SELECTORS.preStudy.topicInput)
    this.startButton = page.locator(SELECTORS.preStudy.startButton)
    this.cancelButton = page.locator(SELECTORS.preStudy.cancelButton)
  }

  async waitForVisible() {
    await this.modal.waitFor({ state: 'visible' })
  }

  async fillTopic(topic: string) {
    await this.topicInput.fill(topic)
  }

  async ensureNewTopicSource() {
    const newSource = this.page.locator(SELECTORS.preStudy.topicSourceNew)
    const selected = await newSource.evaluate(el => {
      return el.classList.contains('bg-ember')
    }).catch(() => false)
    if (!selected) {
      await newSource.click()
    }
  }

  async selectExistingTopicSource() {
    await this.page.locator(SELECTORS.preStudy.topicSourceExisting).click()
  }

  async selectExistingTopic(title: string) {
    await this.page.locator(SELECTORS.preStudy.existingTopicOption)
      .filter({ hasText: title })
      .first()
      .click()
  }

  async fillCustomTopic(text: string) {
    await this.page.locator(SELECTORS.preStudy.customTopicInput).fill(text)
  }

  async selectContinueSuggestion(index: number = 0) {
    await this.page.locator(SELECTORS.preStudy.continueSuggestionCard).nth(index).click()
  }

  async fillUserRequirement(text: string) {
    await this.page.locator(SELECTORS.preStudy.userRequirementInput).fill(text)
  }

  async setDifficulty(difficulty: 'low' | 'mid' | 'high') {
    await this.page.locator(SELECTORS.preStudy.difficultyButton(difficulty)).click()
  }

  async setTemperature(temperature: 'strict' | 'balanced' | 'creative') {
    await this.page.locator(SELECTORS.preStudy.temperatureButton(temperature)).click()
  }

  async toggleExternalMaterials() {
    await this.page.locator(SELECTORS.preStudy.externalMaterialsToggle).click()
  }

  async clickStart() {
    await this.startButton.click()
  }

  async close() {
    await this.cancelButton.click()
  }

  async isVisible(): Promise<boolean> {
    return this.modal.isVisible().catch(() => false)
  }
}
