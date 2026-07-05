import { Page, Locator } from '@playwright/test'
import { SELECTORS } from '../helpers/selectors'

export class ArchiveReportPage {
  readonly modal: Locator
  readonly title: Locator
  readonly body: Locator
  readonly closeButton: Locator

  constructor(private page: Page) {
    this.modal = page.locator('[data-testid="archive-report-modal"]')
    this.title = page.locator(SELECTORS.study.archiveReportTitle)
    this.body = page.locator(SELECTORS.study.archiveReportBody)
    this.closeButton = page.locator(SELECTORS.study.archiveReportClose)
  }

  async waitForVisible(timeout: number = 120000) {
    await this.modal.waitFor({ state: 'visible', timeout })
  }

  async getTitle(): Promise<string | null> {
    return this.title.textContent()
  }

  async getBody(): Promise<string | null> {
    return this.body.textContent()
  }

  async close() {
    await this.closeButton.click()
  }
}
