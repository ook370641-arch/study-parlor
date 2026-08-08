import { test, expect } from '../fixtures/electron'
import { CoverPage } from '../pages/CoverPage'
import { ArticleAssistantPage } from '../pages/ArticleAssistantPage'
import { SELECTORS } from '../helpers/selectors'
import { seedAnthropicArticle, seedStateJson } from '../helpers/test-library'
import type { Page } from '@playwright/test'

const SEL = {
  guideChunk: '[data-testid="guide-chunk"]',
  guideProgress: '[data-testid="guide-progress"]',
  guideRetry: '[data-testid="guide-retry"]',
}

const PROFILE = { name: 'E2E 测试员', profile_text: '', preferred_topics: [] }

type SectionKey = 'engineering' | 'research' | 'alignment' | 'interpretability' | 'product' | 'institute'

/**
 * Seed 一篇已保存的博客文章（写 .md 进 Anthropic博客/ + cache 条目 isSaved:true）。
 * 点击行会直接走 openReader 而非 import（等价 engineering 已保存体验）。
 */
function seedSavedBlogArticle(
  libPath: string,
  opts: {
    slug: string
    title: string
    url: string
    section: SectionKey
    publishedAt: string
    body: string
  }
) {
  const filePath = seedAnthropicArticle(libPath, opts.slug, opts.title, opts.body, {
    source_url: opts.url,
    section: opts.section,
    published_at: opts.publishedAt,
    tags: ['anthropic', opts.section],
  })
  return {
    url: opts.url,
    title: opts.title,
    summary: null,
    publishedAt: opts.publishedAt,
    imageUrl: null,
    isSaved: true,
    filePath,
    section: opts.section,
  }
}

async function openBlogArticle(window: Page, title: string): Promise<void> {
  const cover = new CoverPage(window)
  await cover.goToBriefing()
  await expect(window.locator(SELECTORS.briefing.anthropicPanel)).toBeVisible()
  await window
    .locator(`${SELECTORS.briefing.anthropicArticleRow}:has-text("${title}")`)
    .click()
  await expect(window.locator(SELECTORS.briefing.anthropicArticleReader)).toBeVisible()
}

test.describe('@p1 博客导读终态（Task 8 验收）', () => {
  test.describe('导读失败终态（E2E_GUIDE_BAD_JSON）', () => {
    test.use({ extraEnv: { E2E_ANTHROPIC_OFFLINE: '1', E2E_GUIDE_BAD_JSON: '1' } })

    test('失败终态必达：guide-retry 可见、撰写导读中消失、重试可再触发生成', async ({
      window,
      testLibraryPath,
      testConfigDir,
    }) => {
      const article = seedSavedBlogArticle(testLibraryPath, {
        slug: 'e2e-guide-bad',
        title: 'E2E Guide Bad',
        url: 'https://www.anthropic.com/engineering/e2e-guide-bad',
        section: 'engineering',
        publishedAt: '2026-08-01T00:00:00.000Z',
        body: '## 甲\n\n导读失败测试正文。\n\n## 乙\n\n第二节。',
      })
      seedStateJson(testConfigDir, {
        profile: PROFILE,
        briefingSource: 'anthropic',
        anthropicBlogCache: {
          lastFetchedAt: new Date().toISOString(),
          articles: [article],
          loading: false,
          error: null,
          sectionStatus: {},
        },
      })
      await openBlogArticle(window, 'E2E Guide Bad')

      // mock 合成三阶段进度 → 先出现进度（含撰写导读中）
      await expect(window.locator(SEL.guideProgress)).toBeVisible({ timeout: 15000 })

      // E2E_GUIDE_BAD_JSON 门控 → 最终终态：错误 + 重试，进度消失（撰写导读中 toBeHidden）
      await expect(window.locator(SEL.guideRetry)).toBeVisible({ timeout: 15000 })
      await expect(window.locator(SEL.guideProgress)).toBeHidden()
      await expect(window.locator(SEL.guideChunk)).toHaveCount(0)

      // 点击重试：重新触发生成（进度再次出现），证明重试按钮可用
      await window.locator(SEL.guideRetry).click()
      await expect(window.locator(SEL.guideProgress)).toBeVisible({ timeout: 10000 })
    })
  })

  test.describe('正常 mock 导读渲染成功', () => {
    test.use({ extraEnv: { E2E_ANTHROPIC_OFFLINE: '1' } })

    test('导读渲染成功：summary 形状 chunk 落地', async ({ window, testLibraryPath, testConfigDir }) => {
      const article = seedSavedBlogArticle(testLibraryPath, {
        slug: 'e2e-guide-ok',
        title: 'E2E Guide Ok',
        url: 'https://www.anthropic.com/research/e2e-guide-ok',
        section: 'research',
        publishedAt: '2026-08-01T00:00:00.000Z',
        body: '## 对齐研究\n\n导读成功测试正文。\n\n## 训练数据\n\n第二节。',
      })
      seedStateJson(testConfigDir, {
        profile: PROFILE,
        briefingSource: 'anthropic',
        anthropicBlogCache: {
          lastFetchedAt: new Date().toISOString(),
          articles: [article],
          loading: false,
          error: null,
          sectionStatus: {},
        },
      })
      await openBlogArticle(window, 'E2E Guide Ok')

      // E2E mock 为 anthropic-article 合成 2 个 summary 形状 chunk
      await expect(window.locator(SEL.guideChunk)).toHaveCount(2, { timeout: 30000 })
      await expect(window.locator(SEL.guideChunk).first()).toContainText('AI Safety')
    })

    test('新源全链路等价 engineering：Alignment 色签 → 阅读器 → 导读 → 旁注 → 删除确认', async ({
      window,
      testLibraryPath,
      testConfigDir,
    }) => {
      const article = seedSavedBlogArticle(testLibraryPath, {
        slug: 'e2e-algn-msm',
        title: 'E2E Alignment MSM',
        url: 'https://alignment.anthropic.com/2026/msm/',
        section: 'alignment',
        publishedAt: '2026-08-02T00:00:00.000Z',
        body: '## 机制可解释性\n\n对齐团队对机制可解释性的研究进展。\n\n## 综述\n\n更多内容。',
      })
      seedStateJson(testConfigDir, {
        profile: PROFILE,
        briefingSource: 'anthropic',
        anthropicBlogCache: {
          lastFetchedAt: new Date().toISOString(),
          articles: [article],
          loading: false,
          error: null,
          sectionStatus: {},
        },
      })

      const cover = new CoverPage(window)
      await cover.goToBriefing()
      await expect(window.locator(SELECTORS.briefing.anthropicPanel)).toBeVisible()

      // 行显示 Alignment 色签（新源 = engineering 体验的列表锚）
      const row = window.locator(`${SELECTORS.briefing.anthropicArticleRow}:has-text("E2E Alignment MSM")`)
      await expect(row.locator(SELECTORS.briefing.anthropicSectionTag)).toHaveText('Alignment')

      // 点击打开阅读器，正文渲染
      await row.click()
      await expect(window.locator(SELECTORS.briefing.anthropicArticleReader)).toBeVisible()
      await expect(window.locator(SELECTORS.briefing.anthropicReaderTitle)).toHaveText('E2E Alignment MSM')
      await window.locator('article p').first().waitFor({ state: 'visible', timeout: 15000 })

      // 导读 mock 生成成功（summary 形状 2 chunk）
      await expect(window.locator(SEL.guideChunk)).toHaveCount(2, { timeout: 30000 })
      await expect(window.locator(SEL.guideChunk).first()).toContainText('AI Safety')

      // 添加旁注：打开助手、发送、等待 mock 回复
      const assistant = new ArticleAssistantPage(window)
      await assistant.openChat()
      await assistant.typeQuestion('这篇讲什么？')
      await assistant.send()
      await assistant.waitForAssistantReply()
      await expect(window.locator(SELECTORS.articleAssistant.chatMessage).last()).toContainText('E2E 测试的')

      // 删除弹确认：右键行 → 删除 → 确认对话框 → 确认
      await row.click({ button: 'right' })
      await window.locator('[data-testid="anthropic-row-delete"]').click()
      const confirmDialog = window.locator(SELECTORS.confirmDialog.dialog)
      await expect(confirmDialog).toBeVisible()
      await window.locator(SELECTORS.confirmDialog.confirmButton).click()
      await expect(confirmDialog).toBeHidden()
    })
  })
})
