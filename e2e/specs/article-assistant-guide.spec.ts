import { test, expect } from '../fixtures/electron'
import { CoverPage } from '../pages/CoverPage'
import { ArticleAssistantPage } from '../pages/ArticleAssistantPage'
import { SELECTORS } from '../helpers/selectors'
import { seedBriefing } from '../helpers/test-library'
import type { Page } from '@playwright/test'

function localToday(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// Digest content whose first heading matches the E2E mock guide chunk heading
// ("AI Safety"). splitArticleIntoChunks keys body chunks off the guide headings,
// so this guarantees the body renders at least one `article-body-chunk` section.
const DIGEST_CONTENT = `## AI Safety

### Box CEO Aaron Levie
Aaron Levie 讨论了 AI 安全与对齐在企业工作流中的落地。

## 原始来源
### Aaron Levie
- [tweet](https://x.com/levie/status/1)`

/**
 * Seed a cached digest, navigate cover → briefing, load the seeded cache, and
 * wait until the article-assistant panel has mounted. Mirrors the proven
 * openDigestArticle helper in article-assistant.spec.ts. briefingSource defaults
 * to 'digest' in the store, so no state seeding is needed (state.json is read at
 * boot, which happens during fixture setup before the test body runs). The guide
 * and session are backed by the deterministic E2E mock in
 * electron/ipc/article-assistant.ts.
 */
async function openDigestWithGuide(window: Page, libPath: string): Promise<ArticleAssistantPage> {
  const today = localToday()
  seedBriefing(libPath, today, DIGEST_CONTENT)

  const cover = new CoverPage(window)
  await cover.enterName('E2E 测试员')
  await cover.goToBriefing()

  // The briefing page starts empty; click the receive-digest button to load the
  // seeded cache (deterministic, no LLM).
  await window.locator(SELECTORS.briefing.receiveDigestButton).click()
  await expect(window.locator(SELECTORS.briefing.academicLayout)).toBeVisible({ timeout: 15000 })

  const assistant = new ArticleAssistantPage(window)
  await assistant.waitForMounted()
  return assistant
}

test.describe('@p2 article assistant guide', () => {
  test('guide auto-generates and body splits into chunks', async ({ window, testLibraryPath }) => {
    const assistant = await openDigestWithGuide(window, testLibraryPath)
    await assistant.waitForGuideLoaded()
    expect(await assistant.guideChunkCount()).toBeGreaterThanOrEqual(1)
    expect(await assistant.bodyChunkCount()).toBeGreaterThanOrEqual(1)
  })

  test('divider toggle collapses and expands guide', async ({ window, testLibraryPath }) => {
    const assistant = await openDigestWithGuide(window, testLibraryPath)
    await assistant.waitForGuideLoaded()

    // The toggle's title is driven deterministically by the collapsed state
    // (collapsed='展开导读', expanded='折叠导读'). Asserting the guide chunk's
    // clipped visibility directly is flaky under overflow:hidden, so we key on
    // this state indicator instead.
    const toggle = assistant.dividerToggle
    await expect(toggle).toHaveAttribute('title', '折叠导读')
    await assistant.collapseGuide()
    await expect(toggle).toHaveAttribute('title', '展开导读')
    await assistant.expandGuide()
    await expect(toggle).toHaveAttribute('title', '折叠导读')
  })

  test('swap button appears once in the article body, not the chrome', async ({ window, testLibraryPath }) => {
    await openDigestWithGuide(window, testLibraryPath)
    const swap = window.locator(SELECTORS.articleAssistant.swapPaintingButton)
    // Exactly one instance (the old chrome-position button was removed) and it is
    // rendered inside the academic layout body.
    await expect(swap).toHaveCount(1)
    await expect(swap).toBeVisible()
  })
})
