import { Page, Locator } from '@playwright/test'
import { SELECTORS } from '../selectors'

export class CoverPage {
  readonly briefingButton: Locator

  constructor(private page: Page) {
    this.briefingButton = page.locator(SELECTORS.cover.briefingButton)
  }

  async gotoBriefing() {
    await this.briefingButton.waitFor({ state: 'visible' })
    await this.briefingButton.click()
  }
}
