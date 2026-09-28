import { test, expect } from '../fixtures/electron'
import { CoverPage } from '../pages/CoverPage'
import { SELECTORS } from '../helpers/selectors'
import fs from 'node:fs'
import path from 'node:path'

function readState(configDir: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(path.join(configDir, 'state.json'), 'utf8'))
}

test.describe('@p1 painting delete', () => {
  test('封面删除按钮：点击即隐藏当前画作并自动换画，隐藏名单落盘 state.json', async ({ window, testConfigDir }) => {
    // 冷启动落在封面，删除按钮默认出现
    const cover = new CoverPage(window)
    await cover.nameInput.waitFor({ state: 'visible' })
    const deleteBtn = window.locator(SELECTORS.cover.deletePaintingButton)
    await expect(deleteBtn).toBeVisible()
    await expect(deleteBtn).toBeEnabled()

    const label = window.locator(SELECTORS.cover.paintingLabel).first()
    await expect(label).toBeAttached()
    const before = (await label.textContent()) ?? ''
    expect(before).toContain('·')

    await deleteBtn.click()

    // 无确认、无弹窗：署名直接变成下一幅（被删 id 被排除 + pickRandom 排除当前）
    await expect.poll(async () => (await label.textContent()) ?? '').not.toBe(before)

    // 隐藏名单持久化
    await expect.poll(() => ((readState(testConfigDir).hiddenPaintings as string[]) ?? []).length).toBe(1)
  })

  test('设置开关关闭后封面不出现删除按钮，开关状态落盘', async ({ window, testConfigDir }) => {
    const cover = new CoverPage(window)
    await cover.enterApp('E2E 测试员')

    await window.locator(SELECTORS.home.settingsButton).click()
    const toggle = window.locator(SELECTORS.settings.paintingDeleteToggle)
    await expect(toggle).toBeChecked()
    await toggle.click()
    await expect(toggle).not.toBeChecked()

    await expect.poll(() => readState(testConfigDir).paintingDeleteEnabled).toBe(false)

    // reload 后冷启动回封面：按钮不再渲染
    await window.reload()
    await cover.lightButton.waitFor({ state: 'visible' })
    await expect(window.locator(SELECTORS.cover.deletePaintingButton)).toHaveCount(0)
    // 换画按钮不受影响
    await expect(window.locator(SELECTORS.cover.paintingLabel).first()).toBeAttached()
  })
})
