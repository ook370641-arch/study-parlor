import { test, expect } from '../fixtures/electron'
import { CoverPage } from '../pages/CoverPage'
import { SELECTORS } from '../helpers/selectors'
import { seedBriefing } from '../helpers/test-library'

function localToday(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

test.describe('@p1 briefing generation', () => {
  test('shows briefing page with auto-generated content @unstable', async ({ window, testLibraryPath }) => {
    const cover = new CoverPage(window)
    await cover.enterIfNeeded()
    await cover.goToBriefing()
    // Wait for either the academic layout (content loaded) or progress bar (generating)
    const academicLayout = window.locator(SELECTORS.briefing.academicLayout)
    const progressBar = window.locator(SELECTORS.briefing.progress)
    // The page starts generating automatically; wait for content or progress
    await expect(academicLayout.or(progressBar)).toBeVisible({ timeout: 15000 })
  })

  test('shows cached briefing from seed', async ({ window, testLibraryPath }) => {
    const today = localToday()
    seedBriefing(testLibraryPath, today)
    const cover = new CoverPage(window)
    await cover.enterIfNeeded()
    await cover.goToBriefing()
    await expect(window.locator(SELECTORS.briefing.academicLayout)).toBeVisible({ timeout: 15000 })
    await expect(window.locator(SELECTORS.briefing.academicLayout)).toContainText('Box CEO Aaron Levie')
  })
})
