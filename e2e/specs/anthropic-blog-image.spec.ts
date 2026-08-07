import { test, expect } from '../fixtures/electron'
import { CoverPage } from '../pages/CoverPage'
import { SELECTORS } from '../helpers/selectors'
import {
  createTestLibrary,
  cleanupTestLibrary,
  createTestConfigDir,
  cleanupTestConfigDir,
  seedStateJson,
  seedAnthropicArticleWithImage,
} from '../helpers/test-library'

// Deterministic E2E regression for the Anthropic article inline image fix.
// The article is seeded directly into the test library so the test does not
// depend on network scraping, and the reader must render the local .assets
// image via the readAssetAsDataUrl IPC path.
test.describe('Anthropic 博客正文图片', () => {
  test('E2E-IMAGE-1: 已保存文章的本地图片在阅读器中显示为 data URL', async ({
    window,
    testLibraryPath,
    testConfigDir,
  }) => {
    const slug = 'image-regression-test'
    const title = 'Image Regression Test Article'
    const { filePath } = seedAnthropicArticleWithImage(
      testLibraryPath,
      slug,
      title,
      '## 概述\n\n这是一篇用于回归测试的文章，包含一张本地图片。\n\n![](./.assets/image.png)\n\n图片应正常显示。'
    )

    const articleUrl = `https://www.anthropic.com/engineering/${slug}`
    seedStateJson(testConfigDir, {
      profile: { name: 'E2E 测试员', profile_text: '', preferred_topics: [] },
      briefingSource: 'anthropic',
      anthropicBlogCache: {
        lastFetchedAt: new Date().toISOString(),
        articles: [
          {
            url: articleUrl,
            title,
            summary: 'Regression test article with an inline image.',
            publishedAt: new Date().toISOString(),
            imageUrl: null,
            isSaved: true,
            filePath,
          },
        ],
        loading: false,
        error: null,
      },
    })

    const cover = new CoverPage(window)
    // Profile is seeded, so the cover shows the briefing shortcut directly.
    await cover.goToBriefing()
    await expect(window.locator(SELECTORS.briefing.page)).toBeVisible()

    await expect(
      window.locator(SELECTORS.briefing.sourceAnthropicButton)
    ).toBeVisible()
    await window.locator(SELECTORS.briefing.sourceAnthropicButton).click()

    const rows = window.locator(SELECTORS.briefing.anthropicArticleRow)
    // 列表恒有宪法报告置顶行（T8 引入），过滤后才是 seeded 文章
    const articleRows = rows.filter({ hasNot: window.locator(SELECTORS.briefing.anthropicConstitutionPill) })
    await expect(articleRows).toHaveCount(1)
    await articleRows.first().click()

    const reader = window.locator(SELECTORS.briefing.anthropicArticleReader)
    await expect(reader).toBeVisible()
    await expect(window.locator(SELECTORS.briefing.anthropicReaderTitle)).toHaveText(title)

    const image = window.locator(SELECTORS.briefing.anthropicReaderImage)
    await expect(image).toBeVisible()

    const src = await image.getAttribute('src')
    expect(src).toMatch(/^data:image\/png;base64,/)

    // Confirm the image actually decoded to a non-zero size in the browser.
    await expect
      .poll(async () => image.evaluate((el) => (el as HTMLImageElement).naturalWidth))
      .toBeGreaterThan(0)
  })
})
