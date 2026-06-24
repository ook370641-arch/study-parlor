import { test as base } from '@playwright/test'
import { ElectronApplication, Page, _electron as electron } from 'playwright'
import { createTestLibrary, cleanupTestLibrary } from '../helpers/test-library'

type E2EFixtures = {
  electronApp: ElectronApplication
  window: Page
  testLibraryPath: string
}

export const test = base.extend<E2EFixtures>({
  testLibraryPath: async ({}, use) => {
    const dir = createTestLibrary()
    await use(dir)
  },

  electronApp: async ({ testLibraryPath }, use, testInfo) => {
    const app = await electron.launch({
      args: ['.'],
      cwd: process.cwd(),
      env: {
        ...process.env,
        NODE_ENV: 'test',
        E2E_STUDY_LIBRARY_PATH: testLibraryPath,
      },
    })

    await use(app)

    await app.close()

    const failed = testInfo.status === 'failed' || testInfo.status === 'timedOut'
    if (failed) {
      console.log(`[e2e] test failed, keeping test library for inspection: ${testLibraryPath}`)
    }
    try {
      await cleanupTestLibrary(testLibraryPath, failed)
    } catch (err) {
      console.warn('[e2e] failed to clean up test library:', testLibraryPath, err)
    }
  },

  window: async ({ electronApp }, use) => {
    const page = await electronApp.firstWindow()
    await use(page)
  },
})

export { expect } from '@playwright/test'
