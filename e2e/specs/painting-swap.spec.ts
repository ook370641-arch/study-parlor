import { test, expect } from '../fixtures/electron'
import { CoverPage } from '../pages/CoverPage'
import { SELECTORS } from '../helpers/selectors'
import { seedBriefing } from '../helpers/test-library'

function localToday(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

test.describe('@p1 painting swap weight grammar', () => {
  test('swap: weight animation runs, button locks, wall label updates to real attribution', async ({ window, testLibraryPath }) => {
    const today = localToday()
    seedBriefing(testLibraryPath, today)
    const cover = new CoverPage(window)
    await cover.enterName('E2E 测试员')
    await cover.goToBriefing()
    await window.locator(SELECTORS.briefing.receiveDigestButton).click()
    await expect(window.locator(SELECTORS.briefing.academicLayout)).toBeVisible({ timeout: 15000 })

    const bg = window.locator('[data-testid="surface-background"]')
    const label = window.locator('[data-testid="painting-label"]').first()
    // 展签存在且携带真实署名（画家 · 标题）
    await expect(label).toBeAttached()
    const before = (await label.textContent()) ?? ''
    expect(before).toContain('·')

    const swapBtn = window.locator(SELECTORS.briefing.swapPaintingButton)
    await swapBtn.click()
    // 换画动画期间：背景进入 swapping 态，按钮锁定防连点
    await expect(bg).toHaveAttribute('data-swapping', '')
    await expect(swapBtn).toBeDisabled()
    // 落定：动画结束、锁定解除、署名变化（pickRandom 排除当前 id，必然不同）
    await expect(bg).not.toHaveAttribute('data-swapping', '', { timeout: 3000 })
    await expect(swapBtn).toBeEnabled()
    const after = (await label.textContent()) ?? ''
    expect(after).not.toBe(before)
  })
})
