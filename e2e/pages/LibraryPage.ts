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

  async createGroup(name: string = '新分组'): Promise<string> {
    const createButton = this.page.locator(SELECTORS.library.createGroupButton)
    await createButton.waitFor({ state: 'visible' })
    await createButton.click()

    // The create input appears in place of the create button; it has no data-testid, so locate by placeholder.
    const createInput = this.page.locator('input[placeholder="分组名"]')
    await createInput.waitFor({ state: 'visible' })
    await createInput.fill(name)
    await createInput.press('Enter')

    // Wait for the new group tab with the given name to appear, then capture its generated id.
    const newTab = this.page.locator(`[data-testid^="group-tab-"]`).filter({ hasText: name })
    await newTab.waitFor({ state: 'visible' })
    const testId = await newTab.getAttribute('data-testid')
    const groupId = testId?.replace('group-tab-', '') ?? ''
    if (!groupId) throw new Error(`Could not determine id of newly created group "${name}"`)
    return groupId
  }

  async renameGroup(groupId: string, newName: string) {
    const tab = this.page.locator(SELECTORS.library.groupTab(groupId))
    await tab.waitFor({ state: 'visible' })
    await tab.click({ button: 'right' })

    const renameMenuItem = this.page.locator('text=重命名')
    await renameMenuItem.waitFor({ state: 'visible' })
    await renameMenuItem.click()

    const input = this.page.locator(SELECTORS.library.groupRenameInput)
    await input.waitFor({ state: 'visible' })
    await input.fill(newName)
    await input.press('Enter')
  }

  async deleteGroup(groupId: string) {
    const tab = this.page.locator(SELECTORS.library.groupTab(groupId))
    await tab.waitFor({ state: 'visible' })
    const deleteBtn = tab.locator(SELECTORS.library.groupDeleteButton)
    await deleteBtn.waitFor({ state: 'visible' })
    await deleteBtn.click()
  }

  async expandTopic(index: number = 0) {
    const card = this.page.locator(SELECTORS.home.topicCard).nth(index)
    await card.waitFor({ state: 'visible' })
    await card.click()
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
    const button = this.page.locator(SELECTORS.library.fableButton).nth(sessionIndex)
    await button.waitFor({ state: 'visible' })
    await button.click()
  }

  async generateFable(topicIndex: number = 0, sessionIndex: number = 0) {
    await this.expandTopic(topicIndex)
    const button = this.page.locator(SELECTORS.library.generateFableButton).nth(sessionIndex)
    await button.waitFor({ state: 'visible' })
    await button.click()
  }

  async openDiagram(topicIndex: number = 0, sessionIndex: number = 0) {
    await this.expandTopic(topicIndex)
    const button = this.page.locator(SELECTORS.library.diagramButton).nth(sessionIndex)
    await button.waitFor({ state: 'visible' })
    await button.click()
  }

  async generateDiagram(topicIndex: number = 0, sessionIndex: number = 0) {
    await this.expandTopic(topicIndex)
    const button = this.page.locator(SELECTORS.library.generateDiagramButton).nth(sessionIndex)
    await button.waitFor({ state: 'visible' })
    await button.click()
  }

  async deleteSession(topicIndex: number = 0, sessionIndex: number = 0) {
    await this.expandTopic(topicIndex)
    const button = this.page.locator(SELECTORS.library.deleteSessionButton).nth(sessionIndex)
    await button.waitFor({ state: 'visible' })
    await button.click()
  }

  async confirmDelete() {
    const button = this.page.locator(SELECTORS.confirmDialog.confirmButton)
    await button.waitFor({ state: 'visible' })
    await button.click()
  }

  async cancelDelete() {
    const button = this.page.locator(SELECTORS.confirmDialog.cancelButton)
    await button.waitFor({ state: 'visible' })
    await button.click()
  }

  async closeSessionViewer() {
    const button = this.page.locator(SELECTORS.library.sessionViewerClose)
    await button.waitFor({ state: 'visible' })
    await button.click()
  }

  async getSessionViewerTitle(): Promise<string | null> {
    const title = this.page.locator(SELECTORS.library.sessionViewerTitle)
    await title.waitFor({ state: 'visible' })
    return title.textContent()
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
