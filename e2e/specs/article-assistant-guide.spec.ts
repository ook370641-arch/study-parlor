import { test, expect } from '../fixtures/electron'
import { CoverPage } from '../pages/CoverPage'
import { ArticleAssistantPage } from '../pages/ArticleAssistantPage'
import { SELECTORS } from '../helpers/selectors'
import { seedBriefing, seedAnthropicArticle, seedStateJson } from '../helpers/test-library'
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

  test('v2 guide: progress stages visible, then context-based guide renders', async ({ window, testLibraryPath }) => {
    const assistant = await openDigestWithGuide(window, testLibraryPath)
    // v2 mock 的合成进度约 3.4s：先断言进度文案出现，再等导读落地
    await expect(window.locator('[data-testid="guide-progress"]')).toContainText('检索背景资料中', { timeout: 15000 })
    await assistant.waitForGuideLoaded()
    await expect(window.locator('[data-testid="guide-chunk"]').first()).toContainText('E2E mock 背景铺陈')
  })

  // 旧缓存失效再生由单元测试覆盖（store-article-assistant.test.ts：
  // "regenerates when briefing cache has no guideVersion (v1)"）。
  // E2E 侧 readGuide IPC 直读磁盘文件，无 mock 分支，无法构造"v1 文件落盘后
  // 触发再生"的确定性场景——v1 种子文件被真实读取绕过了 isGuideCacheCurrent
  // 在 store 层的判定链。此处不重复测试该路径。

  test('anthropic article guide still uses v1 summary format, no v2 progress', async ({ window, testLibraryPath, testConfigDir }) => {
    // 用户打开一篇 Anthropic 博客文章 → 右侧导读栏出现，内容应是旧摘要式
    // （summary），不应出现 v2 背景铺陈（context）或 v2 三阶段进度条。
    seedAnthropicArticle(testLibraryPath, 'test-article', '测试文章', '## AI Safety\n\n正文内容。')
    seedStateJson(testConfigDir, { briefingSource: 'anthropic' })

    const cover = new CoverPage(window)
    await cover.goToBriefing()
    // 切换到 Anthropic 源
    await window.locator(SELECTORS.briefing.sourceAnthropicButton).click()
    await expect(window.locator(SELECTORS.briefing.anthropicPanel)).toBeVisible({ timeout: 15000 })
    // 点击文章行打开阅读器
    await window.locator(SELECTORS.briefing.anthropicArticleRow).first().click()

    const assistant = new ArticleAssistantPage(window)
    await assistant.waitForMounted()
    await assistant.waitForGuideLoaded()
    // Anthropic 文章走旧路径：返回 summary 格式导读，不含 context
    await expect(window.locator('[data-testid="guide-chunk"]').first()).toContainText('Constitutional AI')
    // v2 进度 UI 不应出现（仅 digest 简报有）
    await expect(window.locator('[data-testid="guide-progress"]')).toHaveCount(0)
  })

  test('v2 guide: full three-stage progress sequence', async ({ window, testLibraryPath }) => {
    // 用户打开无缓存的简报 → 导读栏依次显示三个阶段，最后导读内容出现。
    const assistant = await openDigestWithGuide(window, testLibraryPath)
    const progress = window.locator('[data-testid="guide-progress"]')
    // 阶段 1：规划（mock 约 0.4s 内出现）
    await expect(progress).toContainText('规划检索中', { timeout: 5000 })
    // 阶段 2：搜索（mock 在 0.4s + 0.5s 后发第一个搜索进度）
    await expect(progress).toContainText('检索背景资料中', { timeout: 5000 })
    // 阶段 3：撰写（mock 在 ~1.4s 后开始发 writing 进度）
    await expect(progress).toContainText('撰写导读中', { timeout: 15000 })
    // 最终导读落地为 context 格式
    await assistant.waitForGuideLoaded()
    await expect(window.locator('[data-testid="guide-chunk"]').first()).toContainText('E2E mock 背景铺陈')
  })

  test('guide-to-body chunk navigation: hover highlights corresponding body chunk', async ({ window, testLibraryPath }) => {
    // 用户在导读栏 hover §0 → 左侧正文 §0 对应段落高亮（border-ember）。
    const assistant = await openDigestWithGuide(window, testLibraryPath)
    await assistant.waitForGuideLoaded()
    // hover 第一个导读 chunk
    await window.locator('[data-testid="guide-chunk"][data-chunk-index="0"]').hover()
    // 对应正文 chunk 应获得激活态边框
    await expect(window.locator('[data-testid="article-body-chunk"][data-chunk-index="0"]')).toHaveClass(/border-ember/)
    // 移开后失活（mouse move 到页面角落触发真实的 mouseleave）
    await window.mouse.move(0, 0)
    await expect(window.locator('[data-testid="article-body-chunk"][data-chunk-index="0"]')).not.toHaveClass(/border-ember/)
  })
})
