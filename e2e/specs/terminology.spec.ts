import { test as base, expect } from '../fixtures/electron'
import { CoverPage } from '../pages/CoverPage'
import { HomePage } from '../pages/HomePage'
import { ExtensionPage } from '../pages/ExtensionPage'
import { TerminologyPanel } from '../pages/TerminologyPanel'
import { SELECTORS } from '../helpers/selectors'
import {
  createTestConfigDir,
  cleanupTestConfigDir,
  seedTerminology,
} from '../helpers/test-library'
import * as fs from 'node:fs'
import * as path from 'node:path'

const test = base.extend({
  testConfigDir: async ({}, use, testInfo) => {
    const dir = createTestConfigDir()
    // Pre-seed terminology so the store reads it on startup
    if (
      testInfo.title.includes('after reload') ||
      testInfo.title.includes('reset field') ||
      testInfo.title.includes('persists') ||
      testInfo.title.includes('Cover') ||
      testInfo.title.includes('label')
    ) {
      seedTerminology(dir, { startButton: '启程' })
    }
    await use(dir)
    await cleanupTestConfigDir(dir, testInfo.status === 'failed' || testInfo.status === 'timedOut')
  },
})

test.describe('@p1 terminology', () => {
  test('panel visible on extension page', async ({ window }) => {
    const cover = new CoverPage(window)
    await cover.enterIfNeeded()
    const home = new HomePage(window)
    await home.waitForLoaded()
    const extension = new ExtensionPage(window)
    await extension.goto()
    await expect(extension.terminologyPanel).toBeVisible()
  })

  test('modifying ritual verb updates UI and persists', async ({ window, testConfigDir }) => {
    const cover = new CoverPage(window)
    await cover.enterIfNeeded()
    const home = new HomePage(window)
    await home.waitForLoaded()
    const extension = new ExtensionPage(window)
    await extension.goto()
    const panel = new TerminologyPanel(window)
    await panel.setField('startButton', '启明')
    await expect(panel.previewCard).toContainText('启明')
    const statePath = path.join(testConfigDir, 'state.json')
    const state = JSON.parse(fs.readFileSync(statePath, 'utf8'))
    expect(state.terminology.startButton).toBe('启明')
  })

  test('modified label reflects on Cover', async ({ window }) => {
    const cover = new CoverPage(window)
    await cover.enterIfNeeded()
    const button = window.locator(SELECTORS.cover.enterButton)
    await expect(button).toContainText('启程')
  })

  test('reset field restores default', async ({ window, testConfigDir }) => {
    const cover = new CoverPage(window)
    await cover.enterIfNeeded()
    const home = new HomePage(window)
    await home.waitForLoaded()
    const extension = new ExtensionPage(window)
    await extension.goto()
    const panel = new TerminologyPanel(window)
    await panel.resetField('startButton')
    const statePath = path.join(testConfigDir, 'state.json')
    const state = JSON.parse(fs.readFileSync(statePath, 'utf8'))
    // After reset, custom terminology should be empty/undefined for that key
    expect(state.terminology?.startButton ?? null).toBeNull()
  })
})
