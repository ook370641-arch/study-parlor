import { Page, Locator } from '@playwright/test'
import { SELECTORS } from '../helpers/selectors'

export class SetupWizardPage {
  constructor(private page: Page) {}

  async waitForStep(step: number) {
    await this.page.locator(SELECTORS.setupWizard.stepIndicator(step))
      .locator('..')
      .locator('text=当前') // or assert class
      .waitFor({ state: 'visible' })
  }

  async start() {
    await this.page.locator(SELECTORS.setupWizard.nextButton).click()
  }

  async fillApiKey(key: string) {
    await this.page.locator(SELECTORS.setupWizard.apiKeyInput).fill(key)
  }

  async fillBaseUrl(url: string) {
    await this.page.locator(SELECTORS.setupWizard.baseUrlInput).fill(url)
  }

  async fillModel(model: string) {
    await this.page.locator(SELECTORS.setupWizard.modelInput).fill(model)
  }

  async verifyAndContinue() {
    await this.page.locator(SELECTORS.setupWizard.nextButton).click()
  }

  async fillLibraryPath(path: string) {
    await this.page.locator(SELECTORS.setupWizard.libraryPathInput).fill(path)
  }

  async selectDirectory() {
    await this.page.locator(SELECTORS.setupWizard.selectDirectoryButton).click()
  }

  async confirmLibraryPath() {
    await this.page.locator(SELECTORS.setupWizard.nextButton).click()
  }

  async fillName(name: string) {
    await this.page.locator(SELECTORS.setupWizard.nameInput).fill(name)
  }

  async fillProfileText(text: string) {
    await this.page.locator(SELECTORS.setupWizard.profileTextInput).fill(text)
  }

  async fillPreferredTopics(topics: string) {
    await this.page.locator(SELECTORS.setupWizard.preferredTopicsInput).fill(topics)
  }

  async complete() {
    await this.page.locator(SELECTORS.setupWizard.nextButton).click()
  }

  async getErrorText(): Promise<string | null> {
    return this.page.locator(SELECTORS.setupWizard.errorDisplay).textContent()
  }
}
