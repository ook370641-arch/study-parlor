import { test, expect } from '../fixtures/electron'
import { CoverPage } from '../pages/CoverPage'
import { SELECTORS } from '../helpers/selectors'
import fs from 'node:fs'

test.describe('@p1 briefing delete cleanup', () => {
  test('delete removes sibling annotation and assistant files', async ({ window }) => {
    const cover = new CoverPage(window)
    await cover.enterName('E2E 测试员')
    await cover.goToBriefing()

    // Generate briefing
    await window.locator(SELECTORS.briefing.receiveDigestButton).click()
    await window.locator('[data-testid="briefing-reading-pane"]').waitFor({ state: 'visible', timeout: 30000 })

    // Get file path
    const result = await window.evaluate(() => {
      const store = (window as any).__ZUSTAND_STORE__
      return store?.getState?.()?.briefing?.result
    })
    const briefingPath = result.filePath
    const annoPath = briefingPath.replace(/\.md$/, '.annotations.md')
    const sessionPath = briefingPath.replace(/\.md$/, '.assistant.md')
    const guidePath = briefingPath.replace(/\.md$/, '.guide.md')

    // Create dummy sibling files
    fs.writeFileSync(annoPath, 'test annotation', 'utf8')
    fs.writeFileSync(sessionPath, 'test session', 'utf8')
    fs.writeFileSync(guidePath, 'test guide', 'utf8')
    expect(fs.existsSync(annoPath)).toBe(true)

    // Right-click the date item to delete
    const dateItem = window.locator(SELECTORS.briefing.dateItem(result.date))
    await dateItem.waitFor({ state: 'visible', timeout: 5000 })
    await dateItem.click({ button: 'right' })

    // Click delete in context menu
    const dateMenu = window.locator(SELECTORS.briefing.dateMenu)
    await dateMenu.waitFor({ state: 'visible', timeout: 5000 })
    await window.locator(SELECTORS.briefing.dateDelete).click()

    // Confirm deletion
    await window.locator(SELECTORS.confirmDialog.confirmButton).click()
    await expect(window.locator(SELECTORS.confirmDialog.dialog)).not.toBeVisible({ timeout: 5000 })

    // Verify sibling files are deleted
    expect(fs.existsSync(annoPath)).toBe(false)
    expect(fs.existsSync(sessionPath)).toBe(false)
    expect(fs.existsSync(guidePath)).toBe(false)
  })
})
