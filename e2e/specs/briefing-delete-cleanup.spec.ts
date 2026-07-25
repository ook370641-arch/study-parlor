import { test, expect } from '../fixtures/electron'
import { CoverPage } from '../pages/CoverPage'
import { SELECTORS } from '../helpers/selectors'
import fs from 'node:fs'
import path from 'node:path'

test.describe('@p1 briefing delete cleanup', () => {
  test('delete removes sibling annotation and assistant files', async ({ window, testLibraryPath }) => {
    const cover = new CoverPage(window)
    await cover.enterName('E2E 测试员')
    await cover.goToBriefing()

    // Generate briefing
    await window.locator(SELECTORS.briefing.receiveDigestButton).click()
    await window.locator('[data-testid="briefing-reading-pane"]').waitFor({ state: 'visible', timeout: 30000 })

    // Construct file paths from library path + today's date (mock generates for today)
    const today = new Date().toISOString().slice(0, 10)
    const briefingPath = path.join(testLibraryPath, '夜航简报', `夜航简报-${today}.md`)
    const annoPath = briefingPath.replace(/\.md$/, '.annotations.md')
    const sessionPath = briefingPath.replace(/\.md$/, '.assistant.md')

    // Create dummy sibling files (guide.md may be auto-generated asynchronously,
    // so we only test annotations and assistant session cleanup)
    fs.writeFileSync(annoPath, 'test annotation', 'utf8')
    fs.writeFileSync(sessionPath, 'test session', 'utf8')
    expect(fs.existsSync(annoPath)).toBe(true)
    expect(fs.existsSync(sessionPath)).toBe(true)

    // Right-click the date item to open context menu
    const dateItem = window.locator(SELECTORS.briefing.dateItem(today))
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
  })
})
