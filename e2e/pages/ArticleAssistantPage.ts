import { Page, Locator, expect } from '@playwright/test'
import { SELECTORS } from '../helpers/selectors'

/**
 * Page object for the article margin assistant (文章旁注助手) overlay that mounts
 * on top of the briefing / anthropic article reader. Encapsulates the open/send
 * waits so specs only express intent. Streaming replies are backed by the
 * deterministic E2E mock in electron/ipc/article-assistant.ts.
 */
export class ArticleAssistantPage {
  readonly tab: Locator
  readonly chatWindow: Locator
  readonly input: Locator
  readonly searchBtn: Locator
  readonly sendBtn: Locator
  readonly stopBtn: Locator
  readonly divider: Locator
  readonly dividerToggle: Locator
  readonly guideChunks: Locator
  readonly bodyChunks: Locator
  readonly swapPaintingButton: Locator
  readonly anthropicSwapPaintingButton: Locator
  readonly socraticBtn: Locator
  readonly thinkingBtn: Locator
  readonly pendingSelection: Locator
  readonly selectionCancelBtn: Locator
  readonly chatMessages: Locator
  readonly reasoningBlock: Locator

  constructor(private page: Page) {
    this.tab = page.locator(SELECTORS.articleAssistant.tab)
    this.chatWindow = page.locator(SELECTORS.articleAssistant.chatWindow)
    this.input = page.locator(SELECTORS.articleAssistant.input)
    this.searchBtn = page.locator(SELECTORS.articleAssistant.searchBtn)
    this.sendBtn = page.locator(SELECTORS.articleAssistant.sendBtn)
    this.stopBtn = page.locator(SELECTORS.articleAssistant.stopBtn)
    this.divider = page.locator(SELECTORS.articleAssistant.divider)
    this.dividerToggle = page.locator(SELECTORS.articleAssistant.dividerToggle)
    this.guideChunks = page.locator(SELECTORS.articleAssistant.guideChunk)
    this.bodyChunks = page.locator(SELECTORS.articleAssistant.bodyChunk)
    this.swapPaintingButton = page.locator(SELECTORS.articleAssistant.swapPaintingButton)
    this.anthropicSwapPaintingButton = page.locator(SELECTORS.articleAssistant.anthropicSwapPaintingButton)
    this.socraticBtn = page.locator(SELECTORS.articleAssistant.socraticBtn)
    this.thinkingBtn = page.locator(SELECTORS.articleAssistant.thinkingBtn)
    this.pendingSelection = page.locator(SELECTORS.articleAssistant.pendingSelection)
    this.selectionCancelBtn = page.locator(SELECTORS.articleAssistant.selectionCancelBtn)
    this.chatMessages = page.locator(SELECTORS.articleAssistant.chatMessage)
    this.reasoningBlock = page.locator(SELECTORS.articleAssistant.reasoningBlock)
  }

  async waitForMounted(timeout = 30000) {
    await this.tab.waitFor({ state: 'visible', timeout })
  }

  async openChat() {
    await this.waitForMounted()
    await this.tab.click()
    await this.chatWindow.waitFor({ state: 'visible' })
  }

  async typeQuestion(text: string) {
    await this.input.fill(text)
  }

  async send() {
    await this.sendBtn.click()
  }

  /**
   * Toggle the search switch, then park the mouse at a neutral corner: the
   * button has a hover:text-parchment/70 variant in its off state, so leaving
   * the cursor on it would make non-hover color assertions (toHaveCSS) read
   * the hover color instead.
   */
  async clickSearch() {
    await this.searchBtn.click()
    await this.page.mouse.move(0, 0)
  }

  /**
   * Wait until the assistant has produced a non-empty reply. Keys on the store
   * state rather than a fixed sleep so it stays stable regardless of streaming
   * timing. window.useStore is the E2E automation hook exposed by src/store.
   */
  async waitForAssistantReply(timeout = 30000) {
    await this.page.waitForFunction(
      () => {
        const s = (window as any).useStore?.getState()?.assistantSession
        if (!s || s.streaming) return false
        return s.messages.some(
          (m: any) => m.role === 'assistant' && m.content.trim().length > 0
        )
      },
      undefined,
      { timeout }
    )
  }

  // --- Guide sidebar + resizable divider (Task 10) ---

  /** Wait until the guide has been generated/loaded (at least one guide chunk visible). */
  async waitForGuideLoaded(timeout = 30000) {
    await this.guideChunks.first().waitFor({ state: 'visible', timeout })
  }

  /**
   * Toggle the divider button to collapse the guide sidebar (width -> 0).
   * Dispatches a synthetic click on the button rather than a pointer click: the
   * parent divider calls setPointerCapture on pointerdown, which redirects the
   * real click away from this button, so a normal .click() never fires its
   * onClick. dispatchEvent hits the handler directly and deterministically.
   */
  async collapseGuide() {
    await this.dividerToggle.dispatchEvent('click')
  }

  /** Toggle the divider button to expand the guide sidebar again (see collapseGuide). */
  async expandGuide() {
    await this.dividerToggle.dispatchEvent('click')
  }

  /**
   * Drag the divider handle to an absolute client x coordinate using the mouse.
   * Reads the divider's current bounding box for the start point.
   */
  async dragDividerTo(clientX: number) {
    const box = await this.divider.boundingBox()
    if (!box) throw new Error('article-assistant divider not found')
    const startX = box.x + box.width / 2
    const y = box.y + box.height / 2
    await this.page.mouse.move(startX, y)
    await this.page.mouse.down()
    await this.page.mouse.move(clientX, y, { steps: 10 })
    await this.page.mouse.up()
  }

  /**
   * Read the rendered width of the guide sidebar container (the divider's next
   * sibling — it has no testid of its own; ArticleAssistantPanel drives its
   * width inline from the store).
   */
  async guideSidebarWidth(): Promise<number> {
    return this.page.evaluate((dividerSel) => {
      const divider = document.querySelector(dividerSel)
      const sidebar = divider?.nextElementSibling as HTMLElement | null
      return sidebar ? sidebar.getBoundingClientRect().width : -1
    }, SELECTORS.articleAssistant.divider)
  }

  /**
   * E2E only: read-only count of assistant session messages from the store
   * (window.useStore is the E2E automation hook exposed by src/store). Used to
   * assert that UI toggles do NOT send messages.
   */
  async messageCount(): Promise<number> {
    return this.page.evaluate(
      () => (window as any).useStore?.getState()?.assistantSession?.messages?.length ?? 0
    )
  }

  async expectBodyChunks(count: number) {
    await expect(this.bodyChunks).toHaveCount(count)
  }

  async expectGuideChunks(count: number) {
    await expect(this.guideChunks).toHaveCount(count)
  }

  async guideChunkCount(): Promise<number> {
    return this.guideChunks.count()
  }

  async bodyChunkCount(): Promise<number> {
    return this.bodyChunks.count()
  }

  /**
   * Drag-select text inside the first article paragraph. Returns the bounding
   * box of the paragraph for callers that need to assert positions.
   */
  async dragSelectFirstParagraph(chars = 120) {
    const p = this.page.locator('article p').first()
    await p.waitFor({ state: 'visible', timeout: 15000 })
    const box = await p.boundingBox()
    if (!box) throw new Error('article paragraph not found')
    const startX = box.x + 5
    const startY = box.y + box.height / 2
    const endX = Math.min(box.x + chars, box.x + box.width - 5)
    await this.page.mouse.move(startX, startY)
    await this.page.mouse.down()
    await this.page.mouse.move(endX, startY, { steps: 10 })
    await this.page.mouse.up()
    return box
  }

  async clickSocratic() { await this.socraticBtn.click() }
  async clickThinking() { await this.thinkingBtn.click() }

  /** 从默认 off 起，把深度思考循环到目标档位 */
  async setThinkingEffort(target: 'off' | 'high' | 'max') {
    const clicks = { off: 0, high: 1, max: 2 }[target]
    for (let i = 0; i < clicks; i++) await this.clickThinking()
  }

  async cancelSelection() { await this.selectionCancelBtn.click() }
}
