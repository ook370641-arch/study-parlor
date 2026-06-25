import { Page, Locator } from '@playwright/test'
import { SELECTORS } from '../helpers/selectors'

export class CoverPage {
  readonly nameInput: Locator
  readonly enterButton: Locator
  readonly lightButton: Locator

  constructor(private page: Page) {
    this.nameInput = page.locator(SELECTORS.cover.nameInput)
    this.enterButton = page.locator(SELECTORS.cover.enterButton)
    this.lightButton = page.locator(SELECTORS.cover.lightButton)
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
    // Fresh isolated config lands on the name-input cover. Existing profile lands on the
    // "light the lamp" cover. Handle both deterministically.
    await this.nameInput.or(this.lightButton).waitFor({ state: 'visible' })
    if (await this.lightButton.isVisible().catch(() => false)) {
      await this.lightButton.click()
    } else {
      await this.enterApp(name)
    }
  }
}
