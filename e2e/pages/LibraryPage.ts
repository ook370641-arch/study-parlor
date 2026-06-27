import { Page, Locator } from '@playwright/test'
import { SELECTORS } from '../helpers/selectors'

export class LibraryPage {
  constructor(private page: Page) {}

  async waitForVisible() {
    await this.page.locator(SELECTORS.home.librarySection).waitFor({ state: 'visible' })
  }

  async filterAll() {
    await this.page.locator(SELECTORS.library.groupTabAll).click()
  }

  async filterByGroup(groupId: string) {
    await this.page.locator(SELECTORS.library.groupTab(groupId)).click()
  }

  async createGroup() {
    await this.page.locator(SELECTORS.library.createGroupButton).click()
  }

  async renameGroup(groupId: string, newName: string) {
    const tab = this.page.locator(SELECTORS.library.groupTab(groupId))
    await tab.dblclick()
    const input = this.page.locator(SELECTORS.library.groupRenameInput)
    await input.fill(newName)
    await input.press('Enter')
  }

  async deleteGroup(groupId: string) {
    await this.page.locator(SELECTORS.library.groupTab(groupId))
      .locator(SELECTORS.library.groupDeleteButton)
      .click()
  }

  async expandTopic(index: number = 0) {
    await this.page.locator(SELECTORS.home.topicCard).nth(index).click()
  }

  async dragTopicToGroup(topicIndex: number, groupId: string) {
    const card = this.page.locator(SELECTORS.home.topicCard).nth(topicIndex)
    const target = this.page.locator(SELECTORS.library.gravityGroupTarget(groupId))
    await card.dragTo(target)
  }

  async openSessionFile(topicIndex: number = 0, sessionIndex: number = 0) {
    await this.expandTopic(topicIndex)
    await this.page.locator(SELECTORS.library.sessionFileButton).nth(sessionIndex).click()
  }

  async openFable(topicIndex: number = 0, sessionIndex: number = 0) {
    await this.expandTopic(topicIndex)
    await this.page.locator(SELECTORS.library.fableButton).nth(sessionIndex).click()
  }

  async generateFable(topicIndex: number = 0, sessionIndex: number = 0) {
    await this.expandTopic(topicIndex)
    await this.page.locator(SELECTORS.library.generateFableButton).nth(sessionIndex).click()
  }

  async openDiagram(topicIndex: number = 0, sessionIndex: number = 0) {
    await this.expandTopic(topicIndex)
    await this.page.locator(SELECTORS.library.diagramButton).nth(sessionIndex).click()
  }

  async generateDiagram(topicIndex: number = 0, sessionIndex: number = 0) {
    await this.expandTopic(topicIndex)
    await this.page.locator(SELECTORS.library.generateDiagramButton).nth(sessionIndex).click()
  }

  async deleteSession(topicIndex: number = 0, sessionIndex: number = 0) {
    await this.expandTopic(topicIndex)
    await this.page.locator(SELECTORS.library.deleteSessionButton).nth(sessionIndex).click()
  }

  async confirmDelete() {
    await this.page.locator(SELECTORS.confirmDialog.confirmButton).click()
  }

  async cancelDelete() {
    await this.page.locator(SELECTORS.confirmDialog.cancelButton).click()
  }

  async closeSessionViewer() {
    await this.page.locator(SELECTORS.library.sessionViewerClose).click()
  }

  async getSessionViewerTitle(): Promise<string | null> {
    return this.page.locator(SELECTORS.library.sessionViewerTitle).textContent()
  }

  async goToPage(index: number) {
    await this.page.locator(SELECTORS.library.paginationDot(index)).click()
  }

  async nextPage() {
    await this.page.locator(SELECTORS.library.paginationNext).click()
  }

  async prevPage() {
    await this.page.locator(SELECTORS.library.paginationPrev).click()
  }
}
