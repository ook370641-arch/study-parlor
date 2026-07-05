import { test, expect } from '../fixtures/electron'
import { CoverPage } from '../pages/CoverPage'
import { HomePage } from '../pages/HomePage'
import { ProfilePage } from '../pages/ProfilePage'
import * as fs from 'node:fs'
import * as path from 'node:path'

test.describe('@p1 profile', () => {
  test('edit and save profile', async ({ window, testConfigDir }) => {
    const cover = new CoverPage(window)
    await cover.enterIfNeeded()

    const home = new HomePage(window)
    await home.waitForLoaded()
    await home.goToProfile()

    const profile = new ProfilePage(window)
    await profile.waitForLoaded()
    await profile.enterEditMode()
    await profile.setName('苏格拉底')
    await profile.setProfileText('喜欢追问到底')
    await profile.setPreferredTopics('哲学,数学')
    await profile.setDifficulty('high')
    await profile.setTemperature('strict')
    await profile.save()

    await expect(profile.nameDisplay).toContainText('苏格拉底')

    const statePath = path.join(testConfigDir, 'state.json')
    const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'))
    expect(state.profile.name).toBe('苏格拉底')
    expect(state.profile.profile_text).toBe('喜欢追问到底')
    expect(state.profile.preferred_topics).toEqual(['哲学', '数学'])
    expect(state.lastUsed.difficulty).toBe('high')
    expect(state.lastUsed.temperature).toBe(0.3)
  })

  test('cancel edit discards changes', async ({ window }) => {
    const cover = new CoverPage(window)
    await cover.enterIfNeeded()

    const home = new HomePage(window)
    await home.waitForLoaded()
    await home.goToProfile()

    const profile = new ProfilePage(window)
    await profile.waitForLoaded()
    const originalName = await profile.nameDisplay.textContent()

    await profile.enterEditMode()
    await profile.setName('临时名字')
    await profile.cancel()

    await expect(profile.nameDisplay).toContainText(originalName ?? '')
  })
})
