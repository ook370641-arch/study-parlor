import { Page, Locator } from '@playwright/test'
import { SELECTORS } from '../helpers/selectors'

export class StudyPage {
  readonly pageElement: Locator
  readonly messageList: Locator
  readonly chatInput: Locator
  readonly sendButton: Locator
  readonly archivePendingBanner: Locator
  readonly archiveButton: Locator
  readonly dismissArchiveButton: Locator
  readonly archiveReportClose: Locator
  readonly archiveReportTitle: Locator
  readonly archiveReportBody: Locator
  readonly archiveLoadingOverlay: Locator
  readonly archiveReturnHomeButton: Locator
  readonly streamErrorBanner: Locator
  readonly streamRetryButton: Locator
  readonly streamDismissButton: Locator

  constructor(private page: Page) {
    this.pageElement = page.locator(SELECTORS.study.page)
    this.messageList = page.locator(SELECTORS.study.messageList)
    this.chatInput = page.locator(SELECTORS.study.chatInput)
    this.sendButton = page.locator(SELECTORS.study.sendButton)
    this.archivePendingBanner = page.locator(SELECTORS.study.archivePendingBanner)
    this.archiveButton = page.locator(SELECTORS.study.archiveButton)
    this.dismissArchiveButton = page.locator(SELECTORS.study.dismissArchiveButton)
    this.archiveReportClose = page.locator(SELECTORS.study.archiveReportClose)
    this.archiveReportTitle = page.locator(SELECTORS.study.archiveReportTitle)
    this.archiveReportBody = page.locator(SELECTORS.study.archiveReportBody)
    this.archiveLoadingOverlay = page.locator(SELECTORS.study.archiveLoadingOverlay)
    this.archiveReturnHomeButton = page.locator(SELECTORS.study.archiveReturnHomeButton)
    this.streamErrorBanner = page.locator(SELECTORS.study.streamErrorBanner)
    this.streamRetryButton = page.locator(SELECTORS.study.streamRetryButton)
    this.streamDismissButton = page.locator(SELECTORS.study.streamDismissButton)
  }

  async waitForLoaded() {
    await this.pageElement.waitFor({ state: 'visible' })
  }

  async waitForAssistantContent(timeout: number = 60000) {
    await this.messageList.locator(SELECTORS.study.assistantMessage)
      .filter({ hasText: /\S/ })
      .first()
      .waitFor({ state: 'visible', timeout })
  }

  async sendMessage(text: string) {
    await this.chatInput.fill(text)
    await this.sendButton.click()
  }

  async typeMultiline(text: string) {
    await this.chatInput.fill(text)
  }

  async archive() {
    await this.archivePendingBanner.waitFor({ state: 'visible' })
    await this.archiveButton.click()
  }

  async dismissArchive() {
    await this.dismissArchiveButton.waitFor({ state: 'visible' })
    await this.dismissArchiveButton.click()
  }

  async closeArchiveReport() {
    await this.archiveReportClose.waitFor({ state: 'visible', timeout: 120000 })
    await this.archiveReportClose.click()
  }

  async getArchiveReportTitle(): Promise<string | null> {
    return this.archiveReportTitle.textContent()
  }

  async returnHomeDuringArchiving() {
    await this.archiveReturnHomeButton.waitFor({ state: 'visible' })
    await this.archiveReturnHomeButton.click()
  }

  async waitForStreamError(timeout: number = 120000) {
    await this.streamErrorBanner.waitFor({ state: 'visible', timeout })
  }

  async retryStream() {
    await this.streamRetryButton.waitFor({ state: 'visible' })
    await this.streamRetryButton.click()
  }

  async dismissStreamError() {
    await this.streamDismissButton.waitFor({ state: 'visible' })
    await this.streamDismissButton.click()
  }

  async waitForHistoryLength(minLength: number, timeout: number = 120000) {
    await this.page.waitForFunction(
      (min: number) => {
        const session = (window as any).useStore?.getState()?.session
        return (session?.history?.length ?? 0) >= min && !session?.streaming
      },
      minLength,
      { timeout }
    )
  }

  async forceArchivePending() {
    await this.page.evaluate(() => {
      const store = (window as any).useStore
      const session = store.getState().session
      if (session) {
        store.setState({ session: { ...session, archivePending: true } })
      }
    })
  }

  async goBack() {
    await this.page.keyboard.press('Escape')
  }
}
