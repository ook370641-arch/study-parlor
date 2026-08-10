import type { Page, Locator } from '@playwright/test'
import { SELECTORS } from '../helpers/selectors'

/**
 * Page object for the writing feature (写作板). Encapsulates tab switching,
 * file/folder creation via prompt dialog, tree navigation, editor interaction,
 * and save status observation.
 */
export class WritingPage {
  readonly listTabArticles: Locator
  readonly listTabRepository: Locator
  readonly newFileButton: Locator
  readonly newFolderButton: Locator
  readonly importFilesButton: Locator
  readonly editor: Locator
  readonly saveStatus: Locator
  readonly boardEmpty: Locator

  constructor(private page: Page) {
    this.listTabArticles = page.locator(SELECTORS.writing.listTabArticles)
    this.listTabRepository = page.locator(SELECTORS.writing.listTabRepository)
    this.newFileButton = page.locator(SELECTORS.writing.newFileButton)
    this.newFolderButton = page.locator(SELECTORS.writing.newFolderButton)
    this.importFilesButton = page.locator(SELECTORS.writing.importFilesButton)
    this.editor = page.locator(SELECTORS.writing.editor)
    this.saveStatus = page.locator(SELECTORS.writing.saveStatus)
    this.boardEmpty = page.locator(SELECTORS.writing.boardEmpty)
  }

  /** Navigate to the writing source. Assumes the app is already loaded. */
  async goto() {
    await this.page.locator(SELECTORS.writing.sourceButton).click()
    await this.listTabArticles.waitFor({ state: 'visible', timeout: 15000 })
  }

  /** Switch source to writing from the sidebar navigation. */
  async switchSource() {
    await this.page.locator(SELECTORS.writing.sourceButton).click()
    await this.listTabArticles.waitFor({ state: 'visible' })
  }

  /** Switch between articles and repository tabs in the list column. */
  async switchListTab(tab: 'articles' | 'repository') {
    const locator = tab === 'articles' ? this.listTabArticles : this.listTabRepository
    await locator.click()
  }

  /** Create a new file by clicking the ＋ button and typing the name in the inline input. */
  async newFile(name: string) {
    await this.newFileButton.click()
    const input = this.page.getByTestId('writing-inline-new')
    await input.waitFor({ state: 'visible' })
    await input.fill(name)
    await input.press('Enter')
  }

  /** Create a new folder by clicking the button and accepting the prompt dialog. */
  async newFolder(name: string) {
    this.page.once('dialog', async (dialog) => { await dialog.accept(name) })
    await this.newFolderButton.click()
    await this.page.waitForTimeout(500)
  }

  /** Find a tree node by its displayed name. */
  treeNode(name: string): Locator {
    return this.page.getByTestId('writing-tree-node').filter({ hasText: name })
  }

  /** Select a file in the tree by name and wait for the editor to appear. */
  async selectFile(name: string) {
    await this.treeNode(name).click()
    await this.editor.waitFor({ state: 'visible' })
  }

  /** Type text into the Milkdown editor (ProseMirror). */
  async typeInEditor(text: string) {
    const proseMirror = this.editor.locator('.ProseMirror')
    await proseMirror.click()
    await proseMirror.fill(text)
  }

  /** Get the current markdown content from the editor. */
  async getEditorContent(): Promise<string> {
    return this.editor.locator('.ProseMirror').textContent()
  }

  /** Get the current save status text. */
  async getSaveStatus(): Promise<string> {
    return this.saveStatus.textContent()
  }

  /** Reload the page and switch back to the writing source. */
  async reloadAndVerify() {
    await this.page.reload()
    await this.switchSource()
  }
}
