import { test, expect } from '../fixtures/electron'
import { CoverPage } from '../pages/CoverPage'
import { ArticleAssistantPage } from '../pages/ArticleAssistantPage'
import { SELECTORS } from '../helpers/selectors'
import { seedBlogArticleWithCache } from '../helpers/test-library'
import type { Page } from '@playwright/test'

const ARTICLE_SLUG = 'e2e-guide-visibility'
const ARTICLE_TITLE = 'E2E Guide Visibility'
const ARTICLE_BODY = `## AI Safety

### Box CEO Aaron Levie
Aaron Levie 讨论了 AI 安全与对齐在企业工作流中的落地。

## 原始来源
### Aaron Levie
- [tweet](https://x.com/levie/status/1)`

async function openArticleWithGuide(window: Page, libPath: string, configDir: string): Promise<ArticleAssistantPage> {
  seedBlogArticleWithCache(libPath, configDir, { slug: ARTICLE_SLUG, title: ARTICLE_TITLE, body: ARTICLE_BODY })
  const cover = new CoverPage(window)
  await cover.goToBriefing()
  await expect(window.locator(SELECTORS.briefing.anthropicPanel)).toBeVisible({ timeout: 10000 })
  await window.locator(`${SELECTORS.briefing.anthropicArticleRow}:has-text("${ARTICLE_TITLE}")`).click()
  await expect(window.locator(SELECTORS.briefing.anthropicArticleReader)).toBeVisible({ timeout: 15000 })
  const assistant = new ArticleAssistantPage(window)
  await assistant.waitForMounted()
  return assistant
}

test.describe('@p2 导读可见性', () => {
  test('academic 主题导读面板 z-index 站上压暗遮罩', async ({ window, testLibraryPath, testConfigDir }) => {
    const assistant = await openArticleWithGuide(window, testLibraryPath, testConfigDir)
    await assistant.waitForGuideLoaded()

    const panel = window.locator('[data-testid="article-assistant-panel"]')
    await expect(panel).toHaveCSS('z-index', '5')
  })

  test('newspaper 主题导读卡片为亮色', async ({ window, testLibraryPath, testConfigDir }) => {
    const assistant = await openArticleWithGuide(window, testLibraryPath, testConfigDir)
    await assistant.waitForGuideLoaded()

    await window.locator(SELECTORS.briefing.themeToggle).click()
    // newspaper 主题：页面根变为浅底 bg-white（digest 版式 testid 已随 digest 删除）
    await expect(window.locator(SELECTORS.briefing.page)).toHaveClass(/bg-white/, { timeout: 10000 })

    const chunk = window.locator(SELECTORS.articleAssistant.guideChunk).first()
    await expect(chunk).toHaveCSS('background-color', 'rgb(255, 255, 255)')
  })
})
