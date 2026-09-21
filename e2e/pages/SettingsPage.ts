import { Page, Locator, expect } from '@playwright/test'
import { SELECTORS } from '../helpers/selectors'

export class SettingsPage {
  readonly apiKeyInput: Locator
  readonly baseUrlInput: Locator
  readonly modelInput: Locator
  readonly libraryPathInput: Locator
  readonly verifyButton: Locator
  readonly backButton: Locator

  constructor(private page: Page) {
    this.apiKeyInput = page.locator(SELECTORS.settings.apiKeyInput)
    this.baseUrlInput = page.locator(SELECTORS.settings.baseUrlInput)
    this.modelInput = page.locator(SELECTORS.settings.modelInput)
    this.libraryPathInput = page.locator(SELECTORS.settings.libraryPathInput)
    this.verifyButton = page.locator(SELECTORS.settings.verifyButton)
    this.backButton = page.locator(SELECTORS.settings.backButton)
  }

  async waitForLoaded() {
    await this.apiKeyInput.waitFor({ state: 'visible' })
    // 等水合：llmConfigList IPC 异步回填前输入框为空，直接 fill 会被覆盖
    await expect(this.apiKeyInput).toHaveValue(/.+/)
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

  async saveAiConfig() {
    await this.page.locator(SELECTORS.settings.aiSaveButton).click()
  }

  async saveLibraryPath() {
    await this.page.locator(SELECTORS.settings.librarySaveButton).click()
  }

  async addLlmConfig() {
    await this.page.locator(SELECTORS.settings.addLlmConfig).click()
  }

  draft() {
    return this.page.locator(SELECTORS.settings.llmDraft)
  }

  async saveDraft() {
    await this.page.locator(SELECTORS.settings.llmDraftSave).click()
  }

  chips() {
    return this.page.locator(SELECTORS.settings.llmConfigChip)
  }

  async activateEditing() {
    await this.page.locator(SELECTORS.settings.activateLlmConfig).click()
  }

  async goBack() {
    await this.backButton.click()
  }

  async getErrorText(): Promise<string | null> {
    return this.page.locator(SELECTORS.settings.errorDisplay).textContent()
  }

  /** 恢复某个已归档主题（在「已归档主题」区块点「恢复」）。 */
  async restoreArchivedTopic(dirName: string) {
    const row = this.page.locator(SELECTORS.settings.archivedTopics).locator('li', { hasText: dirName })
    await row.waitFor({ state: 'visible' })
    await row.locator(SELECTORS.settings.restoreTopicButton).click()
  }
}
