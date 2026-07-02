import type { Page } from '@playwright/test'
import { SELECTORS } from '../helpers/selectors'

export class BriefingPage {
  constructor(private page: Page) {}

  get pageRoot() {
    return this.page.locator(SELECTORS.briefing.page)
  }

  get progress() {
    return this.page.locator(SELECTORS.briefing.progress)
  }

  get academicLayout() {
    return this.page.locator(SELECTORS.briefing.academicLayout)
  }

  get newspaperLayout() {
    return this.page.locator(SELECTORS.briefing.newspaperLayout)
  }

  get regenerateButton() {
    return this.page.locator(SELECTORS.briefing.regenerateButton)
  }

  async waitForLoaded() {
    await this.page.locator(SELECTORS.briefing.page).waitFor({ state: 'visible' })
  }

  async waitForGenerationComplete() {
    await this.page.locator(SELECTORS.briefing.academicLayout).waitFor({ state: 'visible', timeout: 30000 })
  }

  async toggleTheme() {
    await this.page.locator(SELECTORS.briefing.themeToggle).click()
  }
}
