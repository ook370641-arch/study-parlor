import { Page, Locator } from '@playwright/test'
import { SELECTORS } from '../helpers/selectors'

export class PreStudyPage {
  readonly modal: Locator
  readonly topicInput: Locator
  readonly startButton: Locator
  readonly cancelButton: Locator

  constructor(private page: Page) {
    this.modal = page.locator(SELECTORS.preStudy.modal)
    this.topicInput = page.locator(SELECTORS.preStudy.topicInput)
    this.startButton = page.locator(SELECTORS.preStudy.startButton)
    this.cancelButton = page.locator(SELECTORS.preStudy.cancelButton)
  }

  async waitForVisible() {
    await this.modal.waitFor({ state: 'visible' })
  }

  async fillTopic(topic: string) {
    await this.topicInput.fill(topic)
  }

  async ensureNewTopicSource() {
    const newSource = this.page.locator(SELECTORS.preStudy.topicSourceNew)
    const selected = await newSource.evaluate(el => {
      return el.classList.contains('bg-ember')
    }).catch(() => false)
    if (!selected) {
      await newSource.click()
    }
  }

  async selectMode(mode: 'progress' | 'review') {
    // Mode is selected by the caller (openPreStudy). This helper waits for UI to reflect it.
    const expectedText = mode === 'progress' ? '探索新知' : '复习检测'
    await this.modal.locator(`text=${expectedText}`).first().waitFor({ state: 'visible' })
  }

  async clickStart() {
    await this.startButton.click()
  }
}
