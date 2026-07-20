import { test, expect } from '../fixtures/electron'
import { CoverPage } from '../pages/CoverPage'
import { SELECTORS } from '../helpers/selectors'
import { seedStateJson } from '../helpers/test-library'
import fs from 'node:fs'
import path from 'node:path'

function localToday(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

test.describe('@p1 job briefing generation', () => {
  test('generates job briefing via mock and writes cache', async ({ window, testLibraryPath }) => {
    const cover = new CoverPage(window)
    await cover.enterName('E2E 测试员')
    await cover.goToBriefing()

    // Switch the briefing source to 求职简报.
    await window.locator(SELECTORS.briefing.sourceJobBriefingButton).click()

    // Empty state: trigger generation.
    const receiveButton = window.locator(SELECTORS.briefing.receiveJobButton)
    await receiveButton.waitFor({ state: 'visible', timeout: 15000 })
    await receiveButton.click()

    // Mock pipeline returns one event, one job card, one question, and a trends section.
    await window.locator(SELECTORS.briefing.jobCard).first().waitFor({ timeout: 30000 })
    await expect(window.locator(SELECTORS.briefing.jobEvent)).toHaveCount(1)
    await expect(window.locator(SELECTORS.briefing.jobCard)).toHaveCount(1)
    await expect(window.locator(SELECTORS.briefing.jobQuestion)).toHaveCount(1)
    await expect(window.getByRole('heading', { name: '今日新动态' })).toBeVisible()
    await expect(window.getByRole('heading', { name: '与你最适配的岗位' })).toBeVisible()
    await expect(window.getByRole('heading', { name: '高频考察问题' })).toBeVisible()
    await expect(window.getByRole('heading', { name: '趋势解读' })).toBeVisible()

    // Cache file is written under {library}/求职简报/.
    const today = localToday()
    const file = path.join(testLibraryPath, '求职简报', `求职简报-${today}.md`)
    expect(fs.existsSync(file)).toBe(true)
  })

  test('profile fill removes hint banner and persists to state.json', async ({ window, testConfigDir }) => {
    const cover = new CoverPage(window)
    await cover.enterName('E2E 测试员')
    await cover.goToBriefing()

    await window.locator(SELECTORS.briefing.sourceJobBriefingButton).click()

    // Step 1: Generate with empty profile → hint banner visible
    const receiveButton = window.locator(SELECTORS.briefing.receiveJobButton)
    await receiveButton.waitFor({ state: 'visible', timeout: 15000 })
    await receiveButton.click()
    await window.locator(SELECTORS.briefing.jobCard).first().waitFor({ timeout: 30000 })
    await expect(window.locator('[data-testid="job-briefing-profile-hint"]')).toBeVisible()

    // Step 2: Navigate to settings, fill job profile, save
    await window.locator('[data-testid="home-settings-button"]').click()
    await window.locator('[data-testid="settings-api-key-input"]').waitFor({ state: 'visible', timeout: 15000 })
    await window.locator('[data-testid="settings-jobprofile-target-roles"]').fill('AI产品经理，模型产品经理')
    await window.locator('[data-testid="settings-jobprofile-direction"]').fill('大模型/Agent 产品，偏评测与平台')
    await window.locator('[data-testid="settings-jobprofile-experience"]').fill('RAG 评测项目实习')
    await window.locator('[data-testid="settings-jobprofile-save"]').click()
    await expect(window.locator('[data-testid="toast-message"]')).toBeVisible()

    // Step 3: Return to briefing, regenerate
    await window.locator('[data-testid="settings-back-button"]').click()
    await window.locator(SELECTORS.briefing.sourceJobBriefingButton).click()
    await window.locator(SELECTORS.briefing.receiveJobButton).waitFor({ state: 'visible', timeout: 15000 })
    await window.locator(SELECTORS.briefing.receiveJobButton).click()
    await window.locator(SELECTORS.briefing.jobCard).first().waitFor({ timeout: 30000 })

    // Step 4: Hint banner gone (profile now non-empty)
    await expect(window.locator('[data-testid="job-briefing-profile-hint"]')).not.toBeVisible()

    // Step 5: Verify persistence to state.json
    const statePath = path.join(testConfigDir, 'state.json')
    const state = JSON.parse(fs.readFileSync(statePath, 'utf8'))
    expect(state.jobProfile.targetRoles).toContain('AI产品经理')
    expect(state.jobProfile.direction).toContain('大模型/Agent')
    expect(state.jobProfile.experience).toContain('RAG 评测项目实习')
    expect(state.jobProfile.updatedAt).toBeTruthy()
  })

  test('shows progress indicator during generation', async ({ window }) => {
    const cover = new CoverPage(window)
    await cover.enterName('E2E 测试员')
    await cover.goToBriefing()
    await window.locator(SELECTORS.briefing.sourceJobBriefingButton).click()

    const receiveButton = window.locator(SELECTORS.briefing.receiveJobButton)
    await receiveButton.waitFor({ state: 'visible', timeout: 15000 })
    await receiveButton.click()

    // Progress container appears during generation
    await expect(window.locator('[data-testid="briefing-progress"]')).toBeVisible({ timeout: 5000 })

    // Wait for completion
    await window.locator(SELECTORS.briefing.academicLayout).waitFor({ timeout: 30000 })
    await expect(window.getByRole('heading', { name: '今日新动态' })).toBeVisible()
  })

  test('reuses cached briefing on second generation', async ({ window, testLibraryPath }) => {
    const cover = new CoverPage(window)
    await cover.enterName('E2E 测试员')
    await cover.goToBriefing()
    await window.locator(SELECTORS.briefing.sourceJobBriefingButton).click()

    // First generation (mock)
    await window.locator(SELECTORS.briefing.receiveJobButton).waitFor({ state: 'visible', timeout: 15000 })
    await window.locator(SELECTORS.briefing.receiveJobButton).click()
    await window.locator(SELECTORS.briefing.jobCard).first().waitFor({ timeout: 30000 })

    // Verify cache file written
    const today = localToday()
    const cacheFile = path.join(testLibraryPath, '求职简报', `求职简报-${today}.md`)
    expect(fs.existsSync(cacheFile)).toBe(true)
    const firstContent = fs.readFileSync(cacheFile, 'utf8')

    // Leave and re-enter briefing (simulate second visit)
    await window.locator('[data-testid="settings-back-button"]').click()
    await window.locator('[data-testid="cover-briefing-button"]').waitFor({ state: 'visible', timeout: 15000 })
    await window.locator('[data-testid="cover-briefing-button"]').click()
    await window.locator(SELECTORS.briefing.sourceJobBriefingButton).click()

    // Second generation hits cache (instant, no progress wait needed)
    await window.locator(SELECTORS.briefing.receiveJobButton).waitFor({ state: 'visible', timeout: 15000 })
    await window.locator(SELECTORS.briefing.receiveJobButton).click()
    await window.locator(SELECTORS.briefing.jobCard).first().waitFor({ timeout: 10000 })

    // Cache file should be unchanged (mock output is deterministic)
    const secondContent = fs.readFileSync(cacheFile, 'utf8')
    expect(secondContent).toBe(firstContent)
  })

  test('saves job profile settings and verifies in state.json', async ({ window, testConfigDir }) => {
    const cover = new CoverPage(window)
    await cover.enterName('E2E 测试员')
    await window.locator('[data-testid="home-settings-button"]').click()
    await window.locator('[data-testid="settings-api-key-input"]').waitFor({ state: 'visible', timeout: 15000 })

    // Fill all five profile fields
    await window.locator('[data-testid="settings-jobprofile-target-roles"]').fill('AI产品经理，模型产品经理')
    await window.locator('[data-testid="settings-jobprofile-direction"]').fill('大模型/Agent 产品，偏评测与平台')
    await window.locator('[data-testid="settings-jobprofile-skills"]').fill('RAG，提示词工程，数据分析')
    await window.locator('[data-testid="settings-jobprofile-experience"]').fill('AI 产品实习，参与 RAG 评测项目')
    await window.locator('[data-testid="settings-jobprofile-notes"]').fill('只要北上深杭')

    // Save and verify toast
    await window.locator('[data-testid="settings-jobprofile-save"]').click()
    await expect(window.locator('[data-testid="toast-message"]')).toBeVisible()

    // Verify state.json has persisted all fields
    const statePath = path.join(testConfigDir, 'state.json')
    const state = JSON.parse(fs.readFileSync(statePath, 'utf8'))
    expect(state.jobProfile.targetRoles).toEqual(['AI产品经理', '模型产品经理'])
    expect(state.jobProfile.direction).toContain('大模型/Agent')
    expect(state.jobProfile.skills).toContain('RAG')
    expect(state.jobProfile.experience).toContain('RAG 评测项目')
    expect(state.jobProfile.additionalNotes).toContain('北上深杭')
    expect(state.jobProfile.updatedAt).toBeTruthy()
  })
})

test.describe('@real @unstable job briefing real API', () => {
  test.use({
    extraEnv: { E2E_JOB_BRIEFING_DISABLE_MOCK: '1' },
  })

  test('generates job briefing via real Tavily + Kimi', async ({ window, testLibraryPath }) => {
    const cover = new CoverPage(window)
    await cover.enterName('E2E 测试员')
    await cover.goToBriefing()
    await window.locator(SELECTORS.briefing.sourceJobBriefingButton).click()

    await window.locator(SELECTORS.briefing.receiveJobButton).waitFor({ state: 'visible', timeout: 15000 })
    await window.locator(SELECTORS.briefing.receiveJobButton).click()

    // Real API may take several minutes
    await window.locator(SELECTORS.briefing.jobCard).first().waitFor({ timeout: 600_000 })

    // Loose assertions: four section headings present
    await expect(window.getByRole('heading', { name: '今日新动态' })).toBeVisible()
    await expect(window.getByRole('heading', { name: '与你最适配的岗位' })).toBeVisible()
    await expect(window.getByRole('heading', { name: '高频考察问题' })).toBeVisible()
    await expect(window.getByRole('heading', { name: '趋势解读' })).toBeVisible()

    // Cache file written
    const today = localToday()
    expect(fs.existsSync(path.join(testLibraryPath, '求职简报', `求职简报-${today}.md`))).toBe(true)
  })
})
