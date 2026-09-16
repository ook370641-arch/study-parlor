import { test, expect } from '../fixtures/electron'
import { CoverPage } from '../pages/CoverPage'
import { SELECTORS } from '../helpers/selectors'
import { seedAnthropicArticle, seedStateJson, seedWritingTree } from '../helpers/test-library'
import type { Page } from '@playwright/test'

// 博客对照写作挑选器 E2E——对应 docs/superpowers/specs/2026-09-16-blog-companion-writing-picker.md。
// 断言只认 data-testid；唯一文案匹配是文件名「分布式随笔」（seed 固定，红线豁免）。
//
// seedWritingTree 树结构（顶层组默认展开）：
//   writing/技术笔记/分布式随笔.md   ← 本 spec 挑进对照槽的文章
//   writing/随笔/七月夜话.md

const PROFILE = { name: 'E2E 测试员', profile_text: '', preferred_topics: [] }
const BLOG_TITLE = 'E2E Picker Blog'

const SEL = {
  picker: '[data-testid="companion-writing-picker"]',
  companionBoard: '[data-testid="article-companion-board"]',
  companionTab: '[data-testid="article-panel-tab-companion-anthropic"]',
  treeNode: '[data-testid="writing-tree-node"]',
}

test.use({ extraEnv: { E2E_ANTHROPIC_OFFLINE: '1' } })

/** seed 一篇已保存博客 + 写作树 + 离线 cache，直接进入博客栏目。 */
async function openBlogWithCompanion(libPath: string, configDir: string, window: Page) {
  const filePath = seedAnthropicArticle(libPath, 'e2e-picker-blog', BLOG_TITLE, '## 甲\n\n挑选器测试正文。', {
    source_url: 'https://www.anthropic.com/engineering/e2e-picker-blog',
    section: 'engineering',
    tags: ['anthropic', 'engineering'],
  })
  seedWritingTree(libPath)
  seedStateJson(configDir, {
    profile: PROFILE,
    briefingSource: 'anthropic',
    anthropicBlogCache: {
      lastFetchedAt: new Date().toISOString(),
      articles: [{
        url: 'https://www.anthropic.com/engineering/e2e-picker-blog',
        title: BLOG_TITLE,
        summary: null,
        publishedAt: '2026-09-01T00:00:00.000Z',
        imageUrl: null,
        isSaved: true,
        filePath,
        section: 'engineering',
      }],
      loading: false,
      error: null,
      sectionStatus: {},
    },
  })

  const cover = new CoverPage(window)
  await cover.goToBriefing()
  await expect(window.locator(SELECTORS.briefing.anthropicPanel)).toBeVisible()
  await window.locator(`${SELECTORS.briefing.anthropicArticleRow}:has-text("${BLOG_TITLE}")`).click()
  await expect(window.locator(SELECTORS.briefing.anthropicArticleReader)).toBeVisible()
  await expect(window.locator(SELECTORS.briefing.anthropicReaderTitle)).toHaveText(BLOG_TITLE)
}

test.describe('@p1 博客对照写作挑选器', () => {
  test('对照 tab 下点「写作」→ 左栏变写作树挑选器，点文件进对照槽，再点「写作」回文章列表', async ({
    window,
    testLibraryPath,
    testConfigDir,
  }) => {
    await openBlogWithCompanion(testLibraryPath, testConfigDir, window)

    // 切到对照 tab（此时 picker 资格成立）
    await window.locator(SEL.companionTab).click()

    // 点来源栏「写作」→ 不跳转：主区阅读器不动，左栏出现挑选器
    await window.locator(SELECTORS.writing.sourceButton).click()
    await expect(window.locator(SEL.picker)).toBeVisible()
    await expect(window.locator(SELECTORS.briefing.anthropicArticleReader)).toBeVisible()
    await expect(window.locator(SELECTORS.briefing.anthropicReaderTitle)).toHaveText(BLOG_TITLE)
    // 没有整页跳转：写作页自己的列表 tab 不出现
    await expect(window.locator(SELECTORS.writing.listTabArticles)).toBeHidden()

    // 点树中文件 → 对照槽显示该文件（文件名 + 正文都出现才证明读取链路通）
    await window.locator(SEL.treeNode).filter({ hasText: '分布式随笔' }).click()
    await expect(window.locator(SEL.companionBoard)).toBeVisible()
    await expect(window.locator(SEL.companionBoard)).toContainText('分布式随笔')
    await expect(window.locator(SEL.companionBoard)).toContainText('关于分布式系统的思考')
    // 主区仍然不动
    await expect(window.locator(SELECTORS.briefing.anthropicReaderTitle)).toHaveText(BLOG_TITLE)

    // 再点「写作」→ 回到博客文章列表
    await window.locator(SELECTORS.writing.sourceButton).click()
    await expect(window.locator(SEL.picker)).toBeHidden()
    await expect(window.locator(SELECTORS.briefing.anthropicArticleRow).first()).toBeVisible()
    // 对照槽内容保留（映射未清）
    await expect(window.locator(SEL.companionBoard)).toContainText('分布式随笔')
  })

  test('回归护栏：导读 tab（默认）点「写作」→ 仍整页跳转到写作界面', async ({
    window,
    testLibraryPath,
    testConfigDir,
  }) => {
    await openBlogWithCompanion(testLibraryPath, testConfigDir, window)

    // 不切对照 tab（默认导读），点「写作」→ 现状整页跳转
    await window.locator(SELECTORS.writing.sourceButton).click()
    await expect(window.locator(SELECTORS.writing.listTabArticles)).toBeVisible({ timeout: 15000 })
    await expect(window.locator(SEL.picker)).toBeHidden()
  })
})
