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

/**
 * Navigate to job briefing page with a generated result.
 * Waits for the reading pane to appear (post-animation).
 */
async function enterJobBriefingWithResult(window: any) {
  const cover = new CoverPage(window)
  await cover.enterName('E2E 测试员')
  await cover.goToBriefing()
  await window.locator(SELECTORS.briefing.sourceJobBriefingButton).click()
  await window.locator(SELECTORS.briefing.receiveJobButton).waitFor({ state: 'visible', timeout: 15000 })
  await window.locator(SELECTORS.briefing.receiveJobButton).click()
  // Wait for the mock-generated content to appear (same pattern as existing working test).
  // Generation transition takes ~1500ms (resolved → departing → idle).
  await window.locator(SELECTORS.briefing.jobCard).first().waitFor({ timeout: 30000 })
  // Extra settle time for the phase transition to fully complete
  await window.waitForTimeout(500)
}

async function openProfilePanel(window: any) {
  // Use dispatchEvent because Playwright's .click({force:true}) doesn't fire React onClick
  await window.locator('[data-testid="job-profile-panel-trigger"]').waitFor({ state: 'attached', timeout: 5000 })
  await window.evaluate(() => {
    const btn = document.querySelector('[data-testid="job-profile-panel-trigger"]') as HTMLElement
    if (btn) btn.click()
  })
  await window.locator('[data-testid="job-profile-panel"]').waitFor({ state: 'visible', timeout: 5000 })
}

test.describe('@p1 job briefing profile panel', () => {
  test('opens via gear icon trigger after generation', async ({ window }) => {
    await enterJobBriefingWithResult(window)
    await openProfilePanel(window)

    // Verify panel and overlay are visible
    await expect(window.locator('[data-testid="job-profile-panel"]')).toBeVisible()
    await expect(window.locator('[data-testid="job-profile-panel-overlay"]')).toBeVisible()
  })

  test('closes via X button', async ({ window }) => {
    await enterJobBriefingWithResult(window)
    await openProfilePanel(window)

    // Click the close (X) button in the panel header
    await window.locator('[data-testid="job-profile-panel"] button[aria-label="关闭"]').click({ force: true })

    // Panel should close
    await expect(window.locator('[data-testid="job-profile-panel"]')).not.toBeVisible({ timeout: 5000 })
  })

  test('closes via overlay click', async ({ window }) => {
    await enterJobBriefingWithResult(window)
    await openProfilePanel(window)

    // Click the backdrop overlay
    await window.locator('[data-testid="job-profile-panel-overlay"]').click({ force: true })

    // Panel should close
    await expect(window.locator('[data-testid="job-profile-panel"]')).not.toBeVisible({ timeout: 5000 })
  })

  test('closes via Escape key', async ({ window }) => {
    await enterJobBriefingWithResult(window)
    await openProfilePanel(window)

    // Press Escape
    await window.keyboard.press('Escape')

    // Panel should close
    await expect(window.locator('[data-testid="job-profile-panel"]')).not.toBeVisible({ timeout: 5000 })
  })

  test('edit profile fields, save, reopen — data persists', async ({ window, testConfigDir }) => {
    await enterJobBriefingWithResult(window)
    await openProfilePanel(window)

    // Fill profile fields
    await window.locator('[data-testid="job-profile-target-roles"]').fill('AI产品经理，模型产品经理')
    await window.locator('[data-testid="job-profile-direction"]').fill('大模型/Agent 产品，偏评测与平台')
    await window.locator('[data-testid="job-profile-skills"]').fill('RAG，提示词工程，数据分析')
    await window.locator('[data-testid="job-profile-experience"]').fill('AI 产品实习，参与 RAG 评测项目')
    await window.locator('[data-testid="job-profile-notes"]').fill('只要北上深杭')

    // Save
    await window.locator('[data-testid="job-profile-save"]').click()
    // Panel closes after save
    await expect(window.locator('[data-testid="job-profile-panel"]')).not.toBeVisible({ timeout: 5000 })

    // Reopen panel
    await openProfilePanel(window)

    // Verify fields retain saved values
    await expect(window.locator('[data-testid="job-profile-target-roles"]')).toHaveValue('AI产品经理，模型产品经理')
    await expect(window.locator('[data-testid="job-profile-direction"]')).toHaveValue('大模型/Agent 产品，偏评测与平台')
    await expect(window.locator('[data-testid="job-profile-skills"]')).toHaveValue('RAG，提示词工程，数据分析')
    await expect(window.locator('[data-testid="job-profile-experience"]')).toHaveValue('AI 产品实习，参与 RAG 评测项目')
    await expect(window.locator('[data-testid="job-profile-notes"]')).toHaveValue('只要北上深杭')

    // Verify state.json persistence
    const statePath = path.join(testConfigDir, 'state.json')
    const state = JSON.parse(fs.readFileSync(statePath, 'utf8'))
    expect(state.jobProfile.targetRoles).toEqual(['AI产品经理', '模型产品经理'])
    expect(state.jobProfile.direction).toContain('大模型/Agent')
    expect(state.jobProfile.skills).toContain('RAG')
    expect(state.jobProfile.experience).toContain('RAG 评测项目')
    expect(state.jobProfile.additionalNotes).toContain('北上深杭')
    expect(state.jobProfile.updatedAt).toBeTruthy()
  })

  test('add and remove companies', async ({ window }) => {
    await enterJobBriefingWithResult(window)
    await openProfilePanel(window)

    // Add a company — fill the input below the company list then press Enter
    const companyInput = window.locator('[data-testid="job-profile-panel"] input[placeholder*="新公司名"]')
    await companyInput.fill('字节跳动')
    await companyInput.press('Enter')
    await window.waitForTimeout(500)

    // Verify company appears in the panel
    await expect(window.locator('[data-testid="job-profile-panel"]')).toContainText('字节跳动')

    // Remove the company — find the row containing our company name and click its last button
    const panel = window.locator('[data-testid="job-profile-panel"]')
    // Each company row has: checkbox, priority, name, url, edit btn, delete btn
    // The delete button is the last button in the row, marked with ×
    const deleteBtn = panel.locator('button').filter({ hasText: '×' }).last()
    await deleteBtn.click({ force: true })
    await window.waitForTimeout(500)

    // Verify company removed
    await expect(window.locator('[data-testid="job-profile-panel"]')).not.toContainText('字节跳动')
  })

  test('keyword generation button exists', async ({ window }) => {
    await enterJobBriefingWithResult(window)
    await openProfilePanel(window)

    // Verify the generate keywords button is visible
    const generateBtn = window.locator('[data-testid="job-profile-generate-keywords"]')
    await expect(generateBtn).toBeVisible()

    // Verify the discover pages button is visible
    const discoverBtn = window.locator('[data-testid="job-profile-discover-pages"]')
    await expect(discoverBtn).toBeVisible()
  })

  test('profile hint shows when profile empty, "填写档案" opens panel', async ({ window }) => {
    await enterJobBriefingWithResult(window)

    // Empty profile + generated result — hint banner appears
    const hint = window.locator('[data-testid="job-briefing-profile-hint"]')
    await expect(hint).toBeVisible({ timeout: 5000 })
    await expect(hint).toContainText('完善求职档案')

    // Click "填写档案" button — panel should open (NOT navigate to settings)
    await window.locator('[data-testid="job-briefing-profile-hint-goto"]').click()
    await expect(window.locator('[data-testid="job-profile-panel"]')).toBeVisible({ timeout: 5000 })
  })

  test('profile hint dismiss button hides the hint', async ({ window }) => {
    await enterJobBriefingWithResult(window)

    // Hint banner visible
    const hint = window.locator('[data-testid="job-briefing-profile-hint"]')
    await expect(hint).toBeVisible({ timeout: 5000 })

    // Click dismiss
    await window.locator('[data-testid="job-briefing-profile-hint-dismiss"]').click()

    // Hint should disappear
    await expect(hint).not.toBeVisible({ timeout: 5000 })
  })

  test('panel trigger NOT visible when source is digest', async ({ window }) => {
    const cover = new CoverPage(window)
    await cover.enterName('E2E 测试员')
    await cover.goToBriefing()

    // Ensure we are on digest source (default when entering briefing)
    await window.locator(SELECTORS.briefing.sourceSidebar).waitFor({ state: 'visible', timeout: 10000 })
    // Click digest button to make sure we're on digest
    await window.locator(SELECTORS.briefing.sourceDigestButton).click()
    await window.waitForTimeout(500)

    // Panel trigger and hint should NOT exist in digest mode
    await expect(window.locator('[data-testid="job-profile-panel-trigger"]')).toHaveCount(0)
    await expect(window.locator('[data-testid="job-briefing-profile-hint"]')).toHaveCount(0)
  })
})

test.describe('@p1 settings cleanup', () => {
  test('settings page has redirect link to briefing page', async ({ window }) => {
    const cover = new CoverPage(window)
    await cover.enterApp('E2E 测试员')
    await window.locator('[data-testid="home-settings-button"]').click()
    await window.locator('[data-testid="settings-api-key-input"]').waitFor({ state: 'visible', timeout: 15000 })

    // Verify redirect link exists
    const gotoLink = window.locator('[data-testid="settings-goto-job-profile"]')
    await expect(gotoLink).toBeVisible()
    await expect(gotoLink).toContainText('求职简报页面')

    // Click the link — should navigate to briefing page
    await gotoLink.click()
    await expect(window.locator(SELECTORS.briefing.page)).toBeVisible({ timeout: 10000 })
  })

  test('settings page does NOT have old job profile fields', async ({ window }) => {
    const cover = new CoverPage(window)
    await cover.enterApp('E2E 测试员')
    await window.locator('[data-testid="home-settings-button"]').click()
    await window.locator('[data-testid="settings-api-key-input"]').waitFor({ state: 'visible', timeout: 15000 })

    // Old profile fields moved to panel — verify they are NOT in settings
    await expect(window.locator('[data-testid="settings-jobprofile-target-roles"]')).toHaveCount(0)
    await expect(window.locator('[data-testid="settings-jobprofile-direction"]')).toHaveCount(0)
    await expect(window.locator('[data-testid="settings-jobprofile-skills"]')).toHaveCount(0)
    await expect(window.locator('[data-testid="settings-jobprofile-experience"]')).toHaveCount(0)
    await expect(window.locator('[data-testid="settings-jobprofile-notes"]')).toHaveCount(0)
    await expect(window.locator('[data-testid="settings-jobprofile-save"]')).toHaveCount(0)

    // The redirect link should exist (replacing the old profile section)
    await expect(window.locator('[data-testid="settings-goto-job-profile"]')).toBeVisible()
  })
})
