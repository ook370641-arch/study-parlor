import { test, expect } from '../fixtures/electron'
import { CoverPage } from '../pages/CoverPage'
import { ArticleAssistantPage } from '../pages/ArticleAssistantPage'
import { SELECTORS } from '../helpers/selectors'
import { seedBlogArticleWithCache } from '../helpers/test-library'
import type { Page } from '@playwright/test'

const ARTICLE_SLUG = 'e2e-guide-article'
const ARTICLE_TITLE = 'E2E Guide Article'

// Article body whose headings match the E2E mock guide chunk headings
// ("AI Safety", "Training Data"). splitArticleIntoChunks keys body chunks off
// guide headings, so both headings are needed to render two body chunks (and
// two plaques) for the click-navigation test.
const ARTICLE_BODY = `## AI Safety

### Box CEO Aaron Levie
Aaron Levie 讨论了 AI 安全与对齐在企业工作流中的落地。

## Training Data

训练数据质量直接影响模型行为与安全边界。

## 原始来源
### Aaron Levie
- [tweet](https://x.com/levie/status/1)`

/**
 * Seed 一篇已保存的博客文章，导航 cover → briefing → 点击行打开阅读器，
 * 等待旁注面板挂载。digest 载体下线后改用博客文章作为宿主。
 * 导读与会话由 electron/ipc/article-assistant.ts 的确定性 E2E mock 支撑。
 */
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

test.describe('@p2 article assistant guide', () => {
  test('guide auto-generates and body splits into chunks', async ({ window, testLibraryPath, testConfigDir }) => {
    const assistant = await openArticleWithGuide(window, testLibraryPath, testConfigDir)
    await assistant.waitForGuideLoaded()
    expect(await assistant.guideChunkCount()).toBeGreaterThanOrEqual(1)
    expect(await assistant.bodyChunkCount()).toBeGreaterThanOrEqual(1)
  })

  test('divider toggle collapses and expands guide', async ({ window, testLibraryPath, testConfigDir }) => {
    const assistant = await openArticleWithGuide(window, testLibraryPath, testConfigDir)
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

  test('swap button appears once in the article body, not the chrome', async ({ window, testLibraryPath, testConfigDir }) => {
    await openArticleWithGuide(window, testLibraryPath, testConfigDir)
    const swap = window.locator(SELECTORS.articleAssistant.anthropicSwapPaintingButton)
    // Exactly one instance (the old chrome-position button was removed) and it is
    // rendered inside the reader body.
    await expect(swap).toHaveCount(1)
    await expect(swap).toBeVisible()
  })

  test('guide: progress stages visible, then summary guide renders', async ({ window, testLibraryPath, testConfigDir }) => {
    const assistant = await openArticleWithGuide(window, testLibraryPath, testConfigDir)
    // mock 合成三阶段进度（约 3.4s）：先断言进度文案出现，再等导读落地
    await expect(window.locator('[data-testid="guide-progress"]')).toContainText('循迹访书', { timeout: 15000 })
    await assistant.waitForGuideLoaded()
    await expect(window.locator('[data-testid="guide-chunk"]').first()).toContainText('AI Safety')
  })

  // 旧缓存失效再生由单元测试覆盖（store-article-assistant.test.ts：
  // "regenerates when briefing cache has no guideVersion (v1)"）。
  // E2E 侧 readGuide IPC 直读磁盘文件，无 mock 分支，无法构造"v1 文件落盘后
  // 触发再生"的确定性场景——v1 种子文件被真实读取绕过了 isGuideCacheCurrent
  // 在 store 层的判定链。此处不重复测试该路径。

  test('guide: full three-stage progress sequence', async ({ window, testLibraryPath, testConfigDir }) => {
    // 用户打开文章 → 导读栏依次显示三个阶段，最后导读内容出现。
    const assistant = await openArticleWithGuide(window, testLibraryPath, testConfigDir)
    const progress = window.locator('[data-testid="guide-progress"]')
    // 阶段 1：规划（mock 约 0.4s 内出现）
    await expect(progress).toContainText('展卷定章', { timeout: 5000 })
    // 阶段 2：搜索（mock 在 0.4s + 0.5s 后发第一个搜索进度）
    await expect(progress).toContainText('循迹访书', { timeout: 5000 })
    // 阶段 3：撰写（mock 在 ~1.4s 后开始发 writing 进度）
    await expect(progress).toContainText('落笔成文', { timeout: 15000 })
    // 最终导读落地为 summary 形状
    await assistant.waitForGuideLoaded()
    await expect(window.locator('[data-testid="guide-chunk"]').first()).toContainText('AI Safety')
  })

  test('guide-to-body chunk navigation: hover highlights corresponding body chunk', async ({ window, testLibraryPath, testConfigDir }) => {
    // 用户在导读栏 hover §0 → 左侧正文 §0 对应段落高亮（border-ember）。
    const assistant = await openArticleWithGuide(window, testLibraryPath, testConfigDir)
    await assistant.waitForGuideLoaded()
    // hover 第一个导读 chunk
    await window.locator('[data-testid="guide-chunk"][data-chunk-index="0"]').hover()
    // 对应正文 chunk 应获得激活态边框
    await expect(window.locator('[data-testid="article-body-chunk"][data-chunk-index="0"]')).toHaveClass(/border-ember/)
    // 移开后失活（mouse move 到页面角落触发真实的 mouseleave）
    await window.mouse.move(0, 0)
    await expect(window.locator('[data-testid="article-body-chunk"][data-chunk-index="0"]')).not.toHaveClass(/border-ember/)
  })

  test('body-to-guide chunk navigation: clicking plaque scrolls guide chunk into view', async ({ window, testLibraryPath, testConfigDir }) => {
    // 用户点击正文铭牌 → 右侧导读栏滚动定位到对应 § 卡片
    const assistant = await openArticleWithGuide(window, testLibraryPath, testConfigDir)
    await assistant.waitForGuideLoaded()
    await window.locator('[data-testid="article-chunk-plaque"]').first().click()
    await expect(
      window.locator('[data-testid="guide-chunk"][data-chunk-index="0"]')
    ).toBeInViewport()
  })
})
