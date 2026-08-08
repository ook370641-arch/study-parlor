import { test, expect } from '../fixtures/electron'
import { CoverPage } from '../pages/CoverPage'
import { SELECTORS } from '../helpers/selectors'
import { localDateString } from '../helpers/test-library'
import fs from 'node:fs'
import path from 'node:path'

test.describe('@p1 briefing annotations persistence', () => {
  test('annotations file created after marking text in briefing', async ({ window, testLibraryPath }) => {
    const cover = new CoverPage(window)
    await cover.enterName('E2E 测试员')
    await cover.goToBriefing()

    // Generate briefing
    await window.locator(SELECTORS.briefing.receiveDigestButton).click()
    await window.locator('[data-testid="briefing-reading-pane"]').waitFor({ state: 'visible', timeout: 30000 })

    // Construct the annotations file path from library path + today's date
    const today = localDateString()
    const briefingPath = path.join(testLibraryPath, '夜航简报', `夜航简报-${today}.md`)
    const annotationsPath = briefingPath.replace(/\.md$/, '.annotations.md')

    // Trigger ghost pen via E2E helper on the article body
    await window.evaluate(() => {
      const container = document.querySelector('.briefing-article-body')
      if (!container) return
      const paras = container.querySelectorAll('p')
      if (paras.length === 0) return
      const firstPara = paras[0] as HTMLElement
      const textNode = Array.from(firstPara.childNodes).find(
        (n): n is Text => n.nodeType === Node.TEXT_NODE && (n.textContent?.length ?? 0) > 10,
      ) as Text | undefined
      if (!textNode) return
      const range = document.createRange()
      range.setStart(textNode, 0)
      range.setEnd(textNode, Math.min(15, textNode.textContent?.length ?? 0))
      const sel = window.getSelection()
      sel?.removeAllRanges()
      sel?.addRange(range)
      // Dispatch mouseup to trigger ghost pen
      firstPara.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
    })

    // Click ghost pen
    const ghostPen = window.locator('[data-testid="anno-ghost-pen"]')
    await ghostPen.waitFor({ state: 'visible', timeout: 10000 })
    await ghostPen.click()

    // Note card should appear
    const noteCard = window.locator('[data-testid="anno-note-card"]')
    await noteCard.waitFor({ state: 'visible', timeout: 5000 })

    // Type a note and save
    await noteCard.locator('[data-testid="anno-note-textarea"]').fill('E2E test note')
    await window.locator('[data-testid="anno-save-button"]').click()

    // Wait for save to complete
    await expect(noteCard).not.toBeVisible({ timeout: 5000 })

    // Verify annotations file was created on disk
    expect(fs.existsSync(annotationsPath)).toBe(true)
  })
})
