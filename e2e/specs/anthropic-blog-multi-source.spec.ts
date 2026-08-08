import { test, expect } from '../fixtures/electron'
import { CoverPage } from '../pages/CoverPage'
import { SELECTORS } from '../helpers/selectors'
import { seedAnthropicArticle, seedStateJson } from '../helpers/test-library'
import type { Page } from '@playwright/test'
import * as fs from 'node:fs'
import * as path from 'node:path'

const SEL = {
  sectionChip: '[data-testid="anthropic-section-chip"]',
  sectionTag: '[data-testid="anthropic-section-tag"]',
  sectionError: '[data-testid="anthropic-section-error"]',
  filterAll: '[data-testid="anthropic-filter-all"]',
  guideChunk: '[data-testid="guide-chunk"]',
}

const PROFILE = { name: 'E2E 测试员', profile_text: '', preferred_topics: [] }

type SectionKey = 'engineering' | 'research' | 'alignment' | 'interpretability' | 'product' | 'institute'

function seedSectionArticle(
  libPath: string,
  section: SectionKey,
  slug: string,
  title: string,
  publishedAt: string,
  opts: { url?: string; body?: string; isSaved?: boolean } = {}
) {
  const url = opts.url ?? `https://www.anthropic.com/${section}/${slug}`
  const filePath = seedAnthropicArticle(libPath, slug, title, opts.body ?? '## 一\n\n正文占位。', {
    source_url: url,
    section,
    published_at: publishedAt,
    tags: ['anthropic', section],
  })
  return {
    url,
    title,
    summary: null,
    publishedAt,
    imageUrl: null,
    isSaved: opts.isSaved ?? false,
    filePath: opts.isSaved ? filePath : undefined,
    section,
  }
}

function seedCache(
  configDir: string,
  articles: Array<Record<string, unknown>>,
  extra: Record<string, unknown> = {}
): void {
  seedStateJson(configDir, {
    profile: PROFILE,
    briefingSource: 'anthropic',
    anthropicBlogCache: {
      lastFetchedAt: new Date().toISOString(),
      articles,
      loading: false,
      error: null,
      sectionStatus: {},
      ...extra,
    },
  })
}

async function visibleTitles(window: Page): Promise<string[]> {
  const titles = await window.locator(SELECTORS.briefing.anthropicArticleTitle).allTextContents()
  return titles.filter((t) => !t.startsWith("Claude's Constitution"))
}

test.describe('@p1 Anthropic 博客五来源（Task 8 验收）', () => {
  test.describe('五源时间线 + 过滤器状态机', () => {
    test.use({ extraEnv: { E2E_ANTHROPIC_OFFLINE: '1' } })

    test('五源时间线合并按日期倒序 + 六枚 chip + All→多选→回 All 全状态机', async ({
      window,
      testLibraryPath,
      testConfigDir,
    }) => {
      // 五源各 2 篇 + 1 篇 institute 遗留文章（归 research 过滤组）
      const articles = [
        seedSectionArticle(testLibraryPath, 'engineering', 'e2e-eng-a', 'E2E Eng A', '2026-07-01T00:00:00.000Z'),
        seedSectionArticle(testLibraryPath, 'engineering', 'e2e-eng-b', 'E2E Eng B', '2026-06-10T00:00:00.000Z'),
        seedSectionArticle(testLibraryPath, 'research', 'e2e-res-a', 'E2E Res A', '2026-08-01T00:00:00.000Z'),
        seedSectionArticle(testLibraryPath, 'research', 'e2e-res-b', 'E2E Res B', '2026-05-01T00:00:00.000Z'),
        seedSectionArticle(testLibraryPath, 'alignment', 'e2e-algn-a', 'E2E Algn A', '2026-07-20T00:00:00.000Z'),
        seedSectionArticle(testLibraryPath, 'alignment', 'e2e-algn-b', 'E2E Algn B', '2026-04-20T00:00:00.000Z'),
        seedSectionArticle(testLibraryPath, 'interpretability', 'e2e-interp-a', 'E2E Interp A', '2026-08-03T00:00:00.000Z'),
        seedSectionArticle(testLibraryPath, 'interpretability', 'e2e-interp-b', 'E2E Interp B', '2026-03-03T00:00:00.000Z'),
        seedSectionArticle(testLibraryPath, 'product', 'e2e-prod-a', 'E2E Prod A', '2026-06-15T00:00:00.000Z'),
        seedSectionArticle(testLibraryPath, 'product', 'e2e-prod-b', 'E2E Prod B', '2026-02-15T00:00:00.000Z'),
        seedSectionArticle(testLibraryPath, 'institute', 'e2e-ins-a', 'E2E Inst A', '2026-08-05T00:00:00.000Z'),
      ]
      seedCache(testConfigDir, articles)

      const cover = new CoverPage(window)
      await cover.goToBriefing()
      await expect(window.locator(SELECTORS.briefing.anthropicPanel)).toBeVisible()

      // 六枚 chip：All + 五源
      await expect(window.locator(SEL.filterAll)).toHaveCount(1)
      await expect(window.locator(SEL.sectionChip)).toHaveCount(5)

      // 时间线：constitution 自动置顶 + 11 篇 seeded 按 publishedAt 倒序
      const rows = window.locator(SELECTORS.briefing.anthropicArticleRow)
      await expect(rows).toHaveCount(12)
      await expect(rows.first().locator(SELECTORS.briefing.anthropicConstitutionPill)).toBeVisible()
      await expect(await visibleTitles(window)).toEqual([
        'E2E Inst A',
        'E2E Interp A',
        'E2E Res A',
        'E2E Algn A',
        'E2E Eng A',
        'E2E Prod A',
        'E2E Eng B',
        'E2E Res B',
        'E2E Algn B',
        'E2E Interp B',
        'E2E Prod B',
      ])

      // All → 单选 research：constitution 隐藏、institute 可见、engineering 隐藏
      await window.locator(`${SEL.sectionChip}[data-section="research"]`).click()
      await expect(window.locator(SELECTORS.briefing.anthropicConstitutionPill)).toHaveCount(0)
      await expect(
        window.locator(`${SELECTORS.briefing.anthropicArticleRow}:has-text("E2E Eng A")`)
      ).toHaveCount(0)
      await expect(await visibleTitles(window)).toEqual(['E2E Inst A', 'E2E Res A', 'E2E Res B'])

      // + 多选 alignment：research + alignment + institute 可见，engineering 隐藏
      await window.locator(`${SEL.sectionChip}[data-section="alignment"]`).click()
      await expect(await visibleTitles(window)).toEqual(['E2E Inst A', 'E2E Res A', 'E2E Algn A', 'E2E Res B', 'E2E Algn B'])

      // 点灭 alignment → 回单选 research
      await window.locator(`${SEL.sectionChip}[data-section="alignment"]`).click()
      await expect(await visibleTitles(window)).toEqual(['E2E Inst A', 'E2E Res A', 'E2E Res B'])

      // 点灭 research（空选择回退 All）→ 全部恢复 + constitution 回到置顶
      await window.locator(`${SEL.sectionChip}[data-section="research"]`).click()
      await expect(rows).toHaveCount(12)
      await expect(rows.first().locator(SELECTORS.briefing.anthropicConstitutionPill)).toBeVisible()

      // 只选 engineering：constitution 可见、institute 隐藏
      await window.locator(`${SEL.sectionChip}[data-section="engineering"]`).click()
      await expect(window.locator(SELECTORS.briefing.anthropicConstitutionPill)).toHaveCount(1)
      await expect(await visibleTitles(window)).toEqual(['E2E Eng A', 'E2E Eng B'])
      await expect(
        window.locator(`${SELECTORS.briefing.anthropicArticleRow}:has-text("E2E Inst A")`)
      ).toHaveCount(0)
    })

    test('单源失败提示条：Product 栏目失败可重试，其余源文章仍渲染', async ({
      window,
      testLibraryPath,
      testConfigDir,
    }) => {
      const articles = [
        seedSectionArticle(testLibraryPath, 'engineering', 'e2e-err-eng', 'E2E Err Eng', '2026-07-01T00:00:00.000Z'),
        seedSectionArticle(testLibraryPath, 'research', 'e2e-err-res', 'E2E Err Res', '2026-08-01T00:00:00.000Z'),
      ]
      seedCache(testConfigDir, articles, {
        sectionStatus: {
          product: {
            fetchedAt: null,
            error: { code: 'parse-error', message: '解析页面失败，Anthropic 网站结构可能已变更' },
          },
        },
      })

      const cover = new CoverPage(window)
      await cover.goToBriefing()
      await expect(window.locator(SELECTORS.briefing.anthropicPanel)).toBeVisible()

      // Product 栏目失败提示条含 "Product"，且为可点击重试按钮
      const banner = window.locator(`${SEL.sectionError}[data-section="product"]`)
      await expect(banner).toBeVisible()
      await expect(banner).toContainText('Product')

      // 其余源文章仍渲染（单源失败隔离）
      await expect(
        window.locator(`${SELECTORS.briefing.anthropicArticleRow}:has-text("E2E Err Eng")`)
      ).toBeVisible()
      await expect(
        window.locator(`${SELECTORS.briefing.anthropicArticleRow}:has-text("E2E Err Res")`)
      ).toBeVisible()

      // 点重试触发 discover（offline 门控 → 整体错误展示出现，证明 discover 被执行）
      await banner.click()
      await expect(window.locator(SELECTORS.briefing.anthropicErrorMessage)).toBeVisible({ timeout: 10000 })
    })
  })

  test.describe('backfill 事件 + articleMetaCache 持久化', () => {
    test.use({ extraEnv: { E2E_ANTHROPIC_BACKFILL: '1' } })

    test('backfill 事件到达后新行出现、按日期插入正确位置、reload 后 metaCache 持久化', async ({
      window,
      testLibraryPath,
      testConfigDir,
    }) => {
      test.setTimeout(60000)
      // 回填 mock 文章日期 2026-07-20；三篇 seeded 分布在其前后
      const articles = [
        seedSectionArticle(testLibraryPath, 'engineering', 'e2e-bf-eng', 'E2E Bf Eng', '2026-07-10T00:00:00.000Z'),
        seedSectionArticle(testLibraryPath, 'research', 'e2e-bf-res', 'E2E Bf Res', '2026-07-25T00:00:00.000Z'),
        seedSectionArticle(testLibraryPath, 'alignment', 'e2e-bf-algn', 'E2E Bf Algn', '2026-07-15T00:00:00.000Z'),
      ]
      seedCache(testConfigDir, articles, {
        articleMetaCache: {
          'https://www.anthropic.com/engineering/e2e-bf-eng': {
            title: 'E2E Bf Eng',
            publishedAt: '2026-07-10T00:00:00.000Z',
            summary: null,
            imageUrl: null,
          },
        },
      })

      const cover = new CoverPage(window)
      await cover.goToBriefing()
      await expect(window.locator(SELECTORS.briefing.anthropicPanel)).toBeVisible()

      const mockRow = window.locator(`${SELECTORS.briefing.anthropicArticleRow}:has-text("E2E Backfill 回填文章")`)

      // 初始时间线无该文（门控 discover 返回 ok 空主结果 + 异步 backfill 事件）
      await expect(mockRow).toHaveCount(0)

      // 事件到达后新行出现（标题可见、无重复）
      await expect(mockRow).toHaveCount(1, { timeout: 15000 })
      await expect(mockRow).toHaveCount(1)

      // 按日期插入正确位置：constitution 置顶；其余按 publishedAt 倒序
      await expect(await visibleTitles(window)).toEqual([
        'E2E Bf Res',
        'E2E Backfill 回填文章',
        'E2E Bf Algn',
        'E2E Bf Eng',
      ])

      // 回填合并不产生重复：即便「新文章」提示出现，点击合入后行数仍为 1（residual Minor 3）
      const prompt = window.locator(SELECTORS.briefing.anthropicNewArticlesPrompt)
      if (await prompt.isVisible().catch(() => false)) {
        await prompt.click()
        await expect(mockRow).toHaveCount(1)
      }

      // reload → 文章标题/日期仍在 + state.json 断言 articleMetaCache 非空（residual #1）
      // reload 后 profile 已持久化，cover 直接显示「夜航简报」按钮（profile.name 分支），
      // 不能 enterIfNeeded（会点「点亮灯火」导航到 home，briefingButton 便不在 cover 上了）
      await window.reload()
      await cover.goToBriefing()
      await expect(window.locator(SELECTORS.briefing.anthropicPanel)).toBeVisible()
      await expect(mockRow).toHaveCount(1, { timeout: 15000 })

      const state = JSON.parse(fs.readFileSync(path.join(testConfigDir, 'state.json'), 'utf8'))
      const metaCache = state?.anthropicBlogCache?.articleMetaCache
      expect(metaCache).toBeTruthy()
      expect(Object.keys(metaCache).length).toBeGreaterThan(0)
      expect(metaCache['https://www.anthropic.com/engineering/e2e-bf-eng']?.title).toBe('E2E Bf Eng')
    })
  })
})
