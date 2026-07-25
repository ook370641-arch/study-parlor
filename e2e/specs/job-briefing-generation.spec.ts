import { test, expect } from '../fixtures/electron'
import { CoverPage } from '../pages/CoverPage'
import { SELECTORS } from '../helpers/selectors'
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

    // Salary rendered on job card
    await expect(window.locator(SELECTORS.briefing.jobCard).first()).toContainText('25-40K')
  })

  test('profile fill removes hint banner and persists to state.json', async ({ window, testConfigDir }) => {
    const cover = new CoverPage(window)
    await cover.enterName('E2E 测试员')
    await cover.goToBriefing()
    await window.locator(SELECTORS.briefing.sourceJobBriefingButton).click()

    // Generate (empty profile -> hint shows)
    const receiveButton = window.locator(SELECTORS.briefing.receiveJobButton)
    await receiveButton.waitFor({ state: 'visible', timeout: 15000 })
    await receiveButton.click()
    await window.locator(SELECTORS.briefing.jobCard).first().waitFor({ timeout: 30000 })

    // Empty profile -> hint banner visible
    await expect(window.locator('[data-testid="job-briefing-profile-hint"]')).toBeVisible()

    // Open panel via hint "填写档案" button (not via old settings navigation)
    await window.evaluate(() => {
      const btn = document.querySelector('[data-testid="job-briefing-profile-hint-goto"]') as HTMLElement
      if (btn) btn.click()
    })
    await window.locator('[data-testid="job-profile-panel"]').waitFor({ state: 'visible', timeout: 5000 })

    // Fill profile fields in panel
    await window.locator('[data-testid="job-profile-target-roles"]').fill('AI产品经理，模型产品经理')
    await window.locator('[data-testid="job-profile-direction"]').fill('大模型/Agent 产品，偏评测与平台')
    await window.locator('[data-testid="job-profile-experience"]').fill('RAG 评测项目实习')

    // Save (panel closes automatically after save)
    await window.evaluate(() => {
      const btn = document.querySelector('[data-testid="job-profile-save"]') as HTMLElement
      if (btn) btn.click()
    })
    await expect(window.locator('[data-testid="job-profile-panel"]')).not.toBeVisible({ timeout: 5000 })

    // Filled profile -> hint banner must NOT appear
    await expect(window.locator('[data-testid="job-briefing-profile-hint"]')).not.toBeVisible()

    // Verify state.json persistence
    const statePath = path.join(testConfigDir, 'state.json')
    const state = JSON.parse(fs.readFileSync(statePath, 'utf8'))
    expect(state.jobProfile.targetRoles).toContain('AI产品经理')
    expect(state.jobProfile.direction).toContain('大模型/Agent')
    expect(state.jobProfile.experience).toContain('RAG 评测项目实习')
    expect(state.jobProfile.updatedAt).toBeTruthy()
  })

  test('generation completes and renders four sections (progress verified by completion)', async ({ window }) => {
    const cover = new CoverPage(window)
    await cover.enterName('E2E 测试员')
    await cover.goToBriefing()
    await window.locator(SELECTORS.briefing.sourceJobBriefingButton).click()

    const receiveButton = window.locator(SELECTORS.briefing.receiveJobButton)
    await receiveButton.waitFor({ state: 'visible', timeout: 15000 })
    await receiveButton.click()

    // Mock pipeline is synchronous — progress flashes too fast to capture.
    // Verify generation succeeded by waiting for content to appear.
    // Note: job briefing renders in <main> directly, not AcademicBriefingLayout.
    await window.locator(SELECTORS.briefing.jobCard).first().waitFor({ timeout: 30000 })
    await expect(window.getByRole('heading', { name: '今日新动态' })).toBeVisible()
    await expect(window.getByRole('heading', { name: '与你最适配的岗位' })).toBeVisible()
    await expect(window.getByRole('heading', { name: '高频考察问题' })).toBeVisible()
    await expect(window.getByRole('heading', { name: '趋势解读' })).toBeVisible()
  })

  test('reuses cached briefing on second generation', async ({ window, testLibraryPath, testConfigDir }) => {
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

    // Leave briefing -> cover -> re-enter name -> re-enter briefing
    await window.locator('[aria-label="返回封面"]').click()
    // On cover: enter name to enable the briefing button (disabled after return)
    await cover.enterName('E2E 测试员')
    await cover.goToBriefing()

    // Content persists across navigation (store state retained in SPA)
    await window.locator(SELECTORS.briefing.jobCard).first().waitFor({ timeout: 10000 })
    await expect(window.getByRole('heading', { name: '今日新动态' })).toBeVisible()

    // Cache file unchanged (mock output is deterministic)
    const secondContent = fs.readFileSync(cacheFile, 'utf8')
    expect(secondContent).toBe(firstContent)

    // Counter: mock was invoked only once (cache hit on second visit)
    const counter = JSON.parse(fs.readFileSync(path.join(testConfigDir, 'job-briefing-mock-count.json'), 'utf8'))
    expect(counter.count).toBe(1)
  })

  test('saves job profile settings and verifies in state.json', async ({ window, testConfigDir }) => {
    const cover = new CoverPage(window)
    await cover.enterName('E2E 测试员')
    await cover.goToBriefing()
    await window.locator(SELECTORS.briefing.sourceJobBriefingButton).click()

    // Generate to make the profile panel trigger visible
    await window.locator(SELECTORS.briefing.receiveJobButton).waitFor({ state: 'visible', timeout: 15000 })
    await window.locator(SELECTORS.briefing.receiveJobButton).click()
    await window.locator(SELECTORS.briefing.jobCard).first().waitFor({ timeout: 30000 })

    // Open panel via gear icon
    await window.evaluate(() => { const btn = document.querySelector('[data-testid="job-profile-panel-trigger"]') as HTMLElement; if (btn) btn.click() })
    await window.locator('[data-testid="job-profile-panel"]').waitFor({ state: 'visible', timeout: 5000 })

    // Fill all five profile fields
    await window.locator('[data-testid="job-profile-target-roles"]').fill('AI产品经理，模型产品经理')
    await window.locator('[data-testid="job-profile-direction"]').fill('大模型/Agent 产品，偏评测与平台')
    await window.locator('[data-testid="job-profile-skills"]').fill('RAG，提示词工程，数据分析')
    await window.locator('[data-testid="job-profile-experience"]').fill('AI 产品实习，参与 RAG 评测项目')
    await window.locator('[data-testid="job-profile-notes"]').fill('只要北上深杭')

    // Save
    await window.locator('[data-testid="job-profile-save"]').click()
    await expect(window.locator('[data-testid="job-profile-panel"]')).not.toBeVisible({ timeout: 5000 })

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

  test('求职背景注入请求：profile 字段出现在 last-job-request.json', async ({ window, testConfigDir, testLibraryPath }) => {
    const cover = new CoverPage(window)
    await cover.enterName('E2E 测试员')
    await cover.goToBriefing()
    await window.locator(SELECTORS.briefing.sourceJobBriefingButton).click()

    // First generation (empty profile) — creates cache we'll delete later
    await window.locator(SELECTORS.briefing.receiveJobButton).waitFor({ state: 'visible', timeout: 15000 })
    await window.locator(SELECTORS.briefing.receiveJobButton).click()
    await window.locator(SELECTORS.briefing.jobCard).first().waitFor({ timeout: 30000 })

    // Open panel via gear icon and fill profile
    await window.evaluate(() => { const btn = document.querySelector('[data-testid="job-profile-panel-trigger"]') as HTMLElement; if (btn) btn.click() })
    await window.locator('[data-testid="job-profile-panel"]').waitFor({ state: 'visible', timeout: 5000 })
    await window.locator('[data-testid="job-profile-target-roles"]').fill('AI产品经理，模型产品经理')
    await window.locator('[data-testid="job-profile-direction"]').fill('大模型/Agent 产品方向')
    await window.locator('[data-testid="job-profile-experience"]').fill('RAG 评测项目实习经历')
    await window.locator('[data-testid="job-profile-save"]').click()
    await expect(window.locator('[data-testid="job-profile-panel"]')).not.toBeVisible({ timeout: 5000 })

    // Delete today's cached briefing so re-generation hits the E2E mock block
    const today = localToday()
    const cachePath = path.join(testLibraryPath, '求职简报', `求职简报-${today}.md`)
    if (fs.existsSync(cachePath)) fs.rmSync(cachePath)

    // Re-generate: click today in date column triggers generateJobBriefing(today)
    // which sets result:null then enters mock path (cache deleted)
    await window.locator('[data-testid="briefing-date-item-' + today + '"]').click()
    await window.locator(SELECTORS.briefing.jobCard).first().waitFor({ timeout: 30000 })

    // Read the request dump
    const requestPath = path.join(testConfigDir, 'last-job-request.json')
    expect(fs.existsSync(requestPath)).toBe(true)
    const req = JSON.parse(fs.readFileSync(requestPath, 'utf8'))
    expect(req.profile).toContain('AI产品经理')
    expect(req.profile).toContain('大模型/Agent')
    expect(req.profile).toContain('RAG 评测')
    expect(req.hasProfile).toBe(true)
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
