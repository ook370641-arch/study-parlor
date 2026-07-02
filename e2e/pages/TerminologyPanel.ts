import type { Page } from '@playwright/test'
import { SELECTORS } from '../helpers/selectors'

export class TerminologyPanel {
  constructor(private page: Page) {}

  get panel() {
    return this.page.locator(SELECTORS.extension.terminologyPanel)
  }

  inputForField(field: string) {
    return this.page.locator(SELECTORS.extension.terminologyInput(field))
  }

  async setField(field: string, value: string) {
    const input = this.inputForField(field)
    await input.fill(value)
  }

  async resetField(field: string) {
    await this.page.locator(SELECTORS.extension.terminologyReset(field)).click()
  }

  async resetAll() {
    await this.page.locator(SELECTORS.extension.terminologyResetAll).click()
  }

  get previewCard() {
    return this.page.locator(SELECTORS.extension.terminologyPreview)
  }
}
