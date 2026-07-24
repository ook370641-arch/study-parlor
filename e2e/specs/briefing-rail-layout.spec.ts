import { test, expect } from '../fixtures/electron'
import { CoverPage } from '../pages/CoverPage'
import { seedBriefing } from '../helpers/test-library'
import { SELECTORS } from '../helpers/selectors'

function localToday(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

test.describe('@p2 briefing rail layout', () => {
  test('rail bottom hosts controls and generated-at meta line', async ({ window, testLibraryPath }) => {
    seedBriefing(testLibraryPath, localToday())
    const cover = new CoverPage(window)
    await cover.enterName('E2E 测试员')
    await cover.goToBriefing()
    await window.locator(SELECTORS.briefing.receiveDigestButton).click()
    await expect(window.locator(SELECTORS.briefing.academicLayout)).toBeVisible({ timeout: 15000 })

    const rail = window.locator(SELECTORS.briefing.sourceSidebar)
    await expect(rail).toBeVisible()

    const controls = window.locator(SELECTORS.briefing.railControls)
    await expect(controls).toBeVisible()
    await expect(controls.locator(SELECTORS.briefing.fontSizeDecrease)).toBeVisible()
    await expect(controls.locator(SELECTORS.briefing.fontSizeIncrease)).toBeVisible()
    await expect(controls.locator(SELECTORS.briefing.themeToggle)).toBeVisible()

    await expect(window.locator(SELECTORS.briefing.generatedAt)).toBeVisible()
  })

  test('job profile entry only shows for job-briefing source', async ({ window }) => {
    const cover = new CoverPage(window)
    await cover.enterName('E2E 测试员')
    await cover.goToBriefing()
    await expect(window.locator(SELECTORS.briefing.sourceSidebar)).toBeVisible()

    // digest source: no job profile entry
    await expect(window.locator(SELECTORS.briefing.jobProfileEntry)).not.toBeVisible()

    // switch to job briefing
    await window.locator(SELECTORS.briefing.sourceJobBriefingButton).click()
    await expect(window.locator(SELECTORS.briefing.jobProfileEntry)).toBeVisible({ timeout: 5000 })

    // switch back to digest
    await window.locator(SELECTORS.briefing.sourceDigestButton).click()
    await expect(window.locator(SELECTORS.briefing.jobProfileEntry)).not.toBeVisible()
  })

  test('academic theme applies glass material; newspaper does not', async ({ window, testLibraryPath }) => {
    seedBriefing(testLibraryPath, localToday())
    const cover = new CoverPage(window)
    await cover.enterName('E2E 测试员')
    await cover.goToBriefing()
    await window.locator(SELECTORS.briefing.receiveDigestButton).click()
    await expect(window.locator(SELECTORS.briefing.academicLayout)).toBeVisible({ timeout: 15000 })

    await expect(window.locator(SELECTORS.briefing.sourceSidebar)).toHaveClass(/backdrop-blur-md/)
    await expect(window.locator(SELECTORS.briefing.listColumn)).toHaveClass(/backdrop-blur-md/)
    await expect(window.locator(SELECTORS.briefing.contentShell)).toHaveClass(/backdrop-blur-md/)

    await window.locator(SELECTORS.briefing.themeToggle).click()
    await expect(window.locator(SELECTORS.briefing.newspaperLayout)).toBeVisible({ timeout: 10000 })

    await expect(window.locator(SELECTORS.briefing.sourceSidebar)).not.toHaveClass(/backdrop-blur-md/)
  })
})
