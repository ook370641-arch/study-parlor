import { Page, Locator, expect } from '@playwright/test'
import { SELECTORS } from '../helpers/selectors'

export class CoverPage {
  readonly nameInput: Locator
  readonly enterButton: Locator
  readonly lightButton: Locator
  readonly briefingButton: Locator

  constructor(private page: Page) {
    this.nameInput = page.locator(SELECTORS.cover.nameInput)
    this.enterButton = page.locator(SELECTORS.cover.enterButton)
    this.lightButton = page.locator(SELECTORS.cover.lightButton)
    this.briefingButton = page.locator(SELECTORS.cover.briefingButton)
  }

  async enterName(name: string) {
    await this.nameInput.waitFor({ state: 'visible' })
    await this.nameInput.fill(name)
  }

  async enterApp(name: string = 'E2E 测试员') {
    await this.enterName(name)
    await this.enterButton.click()
  }

  async enterIfNeeded(name: string = 'E2E 测试员') {
    await this.nameInput.or(this.lightButton).waitFor({ state: 'visible' })
    if (await this.lightButton.isVisible().catch(() => false)) {
      await this.lightButton.click()
    } else {
      await this.enterApp(name)
    }
  }

  async goToBriefing() {
    await this.briefingButton.click()
  }

  async expectBriefingButtonDisabled() {
    await expect(this.briefingButton).toBeDisabled()
  }

  async expectBriefingButtonEnabled() {
    await expect(this.briefingButton).toBeEnabled()
  }
}
