import type { Page, Locator } from '@playwright/test'
import { SELECTORS } from '../helpers/selectors'

/**
 * Page object for the AI writing assistant panel. Covers the collapsed tab,
 * expanded panel, input controls, search/thinking/snapshot toggles, and messages.
 */
export class WritingAssistantPanel {
  readonly collapsedTab: Locator
  readonly panel: Locator
  readonly input: Locator
  readonly sendBtn: Locator
  readonly stopBtn: Locator
  readonly searchBtn: Locator
  readonly thinkingBtn: Locator
  readonly snapshotBtn: Locator
  readonly closeBtn: Locator
  readonly messages: Locator
  readonly resizeHandle: Locator

  constructor(private page: Page) {
    this.collapsedTab = page.locator(SELECTORS.writing.assistantCollapsed)
    this.panel = page.locator(SELECTORS.writing.assistantPanel)
    this.input = page.locator(SELECTORS.writing.assistantInput)
    this.sendBtn = page.locator(SELECTORS.writing.assistantSendBtn)
    this.stopBtn = page.locator(SELECTORS.writing.assistantStopBtn)
    this.searchBtn = page.locator(SELECTORS.writing.assistantSearchBtn)
    this.thinkingBtn = page.locator(SELECTORS.writing.assistantThinkingBtn)
    this.snapshotBtn = page.locator(SELECTORS.writing.assistantSnapshotBtn)
    this.closeBtn = page.locator(SELECTORS.writing.assistantCloseBtn)
    this.messages = page.locator(SELECTORS.writing.assistantMessages)
    this.resizeHandle = page.locator(SELECTORS.writing.assistantResizeHandle)
  }

  /** Open the assistant by clicking the collapsed tab. */
  async open() {
    await this.collapsedTab.click()
    await this.panel.waitFor({ state: 'visible' })
  }

  /** Close the assistant by clicking the close button in the panel header. */
  async close() {
    await this.closeBtn.click()
  }

  /** Type and send a message to the assistant. */
  async send(text: string) {
    await this.input.fill(text)
    await this.sendBtn.click()
  }

  /** Get the text content of the last assistant message in the panel. */
  async getLastMessage(): Promise<string> {
    return this.messages.locator('> div:last-child').textContent()
  }

  /** Get text content of all source chips visible in the messages area. */
  async sourceChipTexts(): Promise<string[]> {
    return this.messages.locator('[data-testid*="source"]').allTextContents()
  }

  /** Toggle the article-snapshot (📄) button. */
  async toggleSnapshot() {
    await this.snapshotBtn.click()
  }

  /** Toggle the search (🔍) button. */
  async toggleSearch() {
    await this.searchBtn.click()
  }

  /** Cycle through thinking effort levels (off → high → max → off). */
  async cycleThinking() {
    await this.thinkingBtn.click()
  }

  /** Check if the search toggle is currently active (glowing). */
  async isSearchEnabled(): Promise<boolean> {
    return this.searchBtn.evaluate((el) => el.classList.contains('text-sky-400'))
  }

  /** Check if streaming is in progress (send button shows stop icon). */
  async isStreaming(): Promise<boolean> {
    return this.stopBtn.isVisible().catch(() => false)
  }

  /** Wait for streaming to finish (stop button disappears → send button visible). */
  async waitForStreamingDone(timeout = 30000) {
    await this.sendBtn.waitFor({ state: 'visible', timeout })
  }
}
