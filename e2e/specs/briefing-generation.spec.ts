import { test, expect } from '../fixtures/electron'
import { CoverPage } from '../pages/CoverPage'
import { BriefingPage } from '../pages/BriefingPage'
import * as fs from 'node:fs'
import * as path from 'node:path'

test.describe('@p1 briefing generation', () => {
  test('auto-generates briefing and writes cache', async ({ window, testLibraryPath }) => {
    const cover = new CoverPage(window)
    await cover.enterIfNeeded()
    await cover.goToBriefing()
    const briefing = new BriefingPage(window)
    await briefing.waitForGenerationComplete()
    // Verify the generated content is visible
    await expect(briefing.academicLayout).toContainText('中文摘要')
    // Verify cache file was written to library
    const today = new Date().toISOString().slice(0, 10)
    const cachePath = path.join(testLibraryPath, '夜航简报', `夜航简报-${today}.md`)
    expect(fs.existsSync(cachePath)).toBe(true)
    const content = fs.readFileSync(cachePath, 'utf8')
    expect(content).toContain('中文摘要')
  })
})
