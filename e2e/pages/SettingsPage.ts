import { Page, Locator } from '@playwright/test'
import { SELECTORS } from '../helpers/selectors'

export class SettingsPage {
  readonly apiKeyInput: Locator
  readonly baseUrlInput: Locator
  readonly modelInput: Locator
  readonly libraryPathInput: Locator
  readonly verifyButton: Locator
  readonly saveButton: Locator
  readonly resetButton: Locator
  readonly backButton: Locator

  constructor(private page: Page) {
    this.apiKeyInput = page.locator(SELECTORS.settings.apiKeyInput)
    this.baseUrlInput = page.locator(SELECTORS.settings.baseUrlInput)
    this.modelInput = page.locator(SELECTORS.settings.modelInput)
    this.libraryPathInput = page.locator(SELECTORS.settings.libraryPathInput)
    this.verifyButton = page.locator(SELECTORS.settings.verifyButton)
    this.saveButton = page.locator(SELECTORS.settings.saveButton)
    this.resetButton = page.locator(SELECTORS.settings.resetButton)
    this.backButton = page.locator(SELECTORS.settings.backButton)
  }

  async waitForLoaded() {
    await this.apiKeyInput.waitFor({ state: 'visible' })
  }

  async fillApiKey(key: string) {
    await this.apiKeyInput.fill(key)
  }

  async toggleApiKeyVisibility() {
    await this.page.locator(SELECTORS.settings.apiKeyToggle).click()
  }

  async fillBaseUrl(url: string) {
    await this.baseUrlInput.fill(url)
  }

  async fillModel(model: string) {
    await this.modelInput.fill(model)
  }

  async fillLibraryPath(path: string) {
    await this.libraryPathInput.fill(path)
  }

  async clickVerify() {
    await this.verifyButton.click()
  }

  async getVerifyStatus(): Promise<string | null> {
    return this.page.locator(SELECTORS.settings.verifyStatus).textContent()
  }

  async saveSearchApiKey(key: string) {
    await this.page.locator(SELECTORS.settings.searchApiKeyInput).fill(key)
    await this.page.locator(SELECTORS.settings.searchSaveButton).click()
  }

  async saveConfig() {
    await this.saveButton.click()
  }

  async resetForm() {
    await this.resetButton.click()
  }

  async goBack() {
    await this.backButton.click()
  }

  async getErrorText(): Promise<string | null> {
    return this.page.locator(SELECTORS.settings.errorDisplay).textContent()
  }
}
