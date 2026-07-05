import type { Page } from '@playwright/test'
import { SELECTORS } from '../helpers/selectors'

export class ExtensionPage {
  constructor(private page: Page) {}

  async goto() {
    await this.page.locator(SELECTORS.home.extensionButton).click()
    await this.page.locator(SELECTORS.extension.page).waitFor({ state: 'visible' })
  }

  async waitForLoaded() {
    await this.page.locator(SELECTORS.extension.page).waitFor({ state: 'visible' })
  }

  get terminologyPanel() {
    return this.page.locator(SELECTORS.extension.terminologyPanel)
  }

  get libraryDirectoryCard() {
    return this.page.locator(SELECTORS.extension.libraryDirectoryCard)
  }

  get localAgentCard() {
    return this.page.locator(SELECTORS.extension.localAgentCard)
  }

  get customPicturesCard() {
    return this.page.locator(SELECTORS.extension.customPicturesCard)
  }
}
