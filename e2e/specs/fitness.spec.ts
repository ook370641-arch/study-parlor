import { test, expect } from '../fixtures/electron'
import { CoverPage } from '../pages/CoverPage'
import { SELECTORS } from '../helpers/selectors'
import { seedStateJson, seedFitnessJson } from '../helpers/test-library'

const SEED_FITNESS = {
  version: 1,
  routines: [
    { id: 'push', name: '推', exercises: [{ id: 'ex-bench', name: '平板卧推', sets: 2 }] },
  ],
  schedule: [{ weekday: 1, routineId: 'push' }],
  records: [
    { id: 'r1', date: '2026-09-28', routineId: 'push', entries: [
      { exerciseId: 'ex-bench', name: '平板卧推', sets: [{ weight: 60, reps: 8 }, { weight: 60, reps: 8 }] },
    ] },
  ],
  bodyMetrics: [{ date: '2026-09-28', weight: 72.5 }],
}

test.describe('健身来源', () => {
  test('E2E-FIT-1: 入口可见，落地态显示种子记录', async ({ window, testConfigDir }) => {
    seedStateJson(testConfigDir, {
      profile: { name: 'E2E 测试员', profile_text: '', preferred_topics: [] },
      briefingSource: 'fitness',
    })
    seedFitnessJson(testConfigDir, SEED_FITNESS)

    const cover = new CoverPage(window)
    await cover.goToBriefing()
    await window.locator(SELECTORS.fitness.sourceButton).click()

    await expect(window.locator(SELECTORS.fitness.panel)).toBeVisible({ timeout: 5000 })
    await expect(window.locator('[data-testid="fitness-routine-col-push"]')).toContainText('平板卧推')
    await expect(window.locator('[data-testid="fitness-routine-col-push"]')).toContainText('60')
    await expect(window.locator('[data-testid="fitness-trend-chart"]')).toBeVisible()
  })

  test('E2E-FIT-2: 记录当下 → 保存 → 重载后仍在', async ({ window, testConfigDir }) => {
    seedStateJson(testConfigDir, {
      profile: { name: 'E2E 测试员', profile_text: '', preferred_topics: [] },
      briefingSource: 'fitness',
    })
    seedFitnessJson(testConfigDir, SEED_FITNESS)

    const cover = new CoverPage(window)
    await cover.goToBriefing()
    await window.locator(SELECTORS.fitness.sourceButton).click()
    await window.locator(SELECTORS.fitness.recordButton).click()

    // 预填 60，改成 62.5
    const w0 = window.locator('[data-testid="fitness-set-weight-ex-bench-0"]')
    await w0.fill('62.5')
    await window.locator(SELECTORS.fitness.recordSave).click()

    // 新快照标签出现（今天）
    const today = new Date()
    const chipLabel = `${today.getMonth() + 1}/${today.getDate()}`
    await expect(window.locator('[data-testid^="fitness-record-chip-"]', { hasText: chipLabel })).toBeVisible()

    // 重载持久化 —— 重载回到封面，需重新进入简报
    await window.reload()
    await window.waitForLoadState('domcontentloaded')
    const cover2 = new CoverPage(window)
    await cover2.goToBriefing()
    await window.locator(SELECTORS.fitness.sourceButton).click()
    await expect(window.locator('[data-testid^="fitness-record-chip-"]', { hasText: chipLabel })).toBeVisible({ timeout: 5000 })
  })

  test('E2E-FIT-3: 尺寸记一次 → 表格新行 → 重载持久化', async ({ window, testConfigDir }) => {
    seedStateJson(testConfigDir, {
      profile: { name: 'E2E 测试员', profile_text: '', preferred_topics: [] },
      briefingSource: 'fitness',
    })
    seedFitnessJson(testConfigDir, SEED_FITNESS)

    const cover = new CoverPage(window)
    await cover.goToBriefing()
    await window.locator(SELECTORS.fitness.sourceButton).click()
    await window.locator(SELECTORS.fitness.faceBody).click()

    await window.locator('[data-testid="fitness-body-input-weight"]').fill('73')
    await window.locator(SELECTORS.fitness.bodySave).click()

    const today = new Date()
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    await expect(window.locator(`[data-testid="fitness-body-row-${todayStr}"]`)).toBeVisible()

    await window.reload()
    await window.waitForLoadState('domcontentloaded')
    const cover2 = new CoverPage(window)
    await cover2.goToBriefing()
    await window.locator(SELECTORS.fitness.sourceButton).click()
    await window.locator(SELECTORS.fitness.faceBody).click()
    await expect(window.locator(`[data-testid="fitness-body-row-${todayStr}"]`)).toBeVisible({ timeout: 5000 })
  })
})
