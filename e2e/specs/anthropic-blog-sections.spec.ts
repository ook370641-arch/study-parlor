import { test, expect } from '../fixtures/electron'
import { CoverPage } from '../pages/CoverPage'
import { SELECTORS } from '../helpers/selectors'
import { seedAnthropicArticle, seedStateJson } from '../helpers/test-library'

const SEL = {
  sectionChip: '[data-testid="anthropic-section-chip"]',
  sectionTag: '[data-testid="anthropic-section-tag"]',
  sectionError: '[data-testid="anthropic-section-error"]',
  // SELECTORS.briefing 无 guideChunk 常量（仅 articleAssistant 有），按 brief 约束内联
  guideChunk: '[data-testid="guide-chunk"]',
}

const PROFILE = { name: 'E2E 测试员', profile_text: '', preferred_topics: [] }

function seedSectionArticle(
  testLibraryPath: string,
  section: 'engineering' | 'institute' | 'research',
  slug: string,
  title: string,
  publishedAt: string,
  body: string
) {
  const url = `https://www.anthropic.com/${section}/${slug}`
  const filePath = seedAnthropicArticle(testLibraryPath, slug, title, body, {
    source_url: url,
    section,
    published_at: publishedAt,
    tags: ['anthropic', section],
  })
  return { url, title, summary: null, publishedAt, imageUrl: null, isSaved: true, filePath, section }
}

test.describe('Anthropic 多栏目 @p1', () => {
  test('E2E-SEC-1: 合并时间线 + 色签过滤 + 栏目失败提示', async ({
    window,
    testLibraryPath,
    testConfigDir,
  }) => {
    const articles = [
      seedSectionArticle(testLibraryPath, 'engineering', 'e2e-eng-old', 'E2E Eng Old', '2026-07-01T00:00:00.000Z', '## 一\n\n工程旧文。'),
      seedSectionArticle(testLibraryPath, 'institute', 'e2e-ins-new', 'E2E Inst New', '2026-08-05T00:00:00.000Z', '## 甲\n\n机构新文。\n\n## 乙\n\n第二节。'),
      seedSectionArticle(testLibraryPath, 'research', 'e2e-res-mid', 'E2E Res Mid', '2026-08-01T00:00:00.000Z', '## 研究\n\n研究中文。'),
    ]
    seedStateJson(testConfigDir, {
      profile: PROFILE,
      briefingSource: 'anthropic',
      anthropicBlogCache: {
        lastFetchedAt: new Date().toISOString(),
        articles,
        loading: false,
        error: null,
        sectionStatus: {
          research: { fetchedAt: null, error: { code: 'parse-error', message: '解析页面失败，Anthropic 网站结构可能已变更' } },
        },
      },
    })

    const cover = new CoverPage(window)
    await cover.goToBriefing()
    await expect(window.locator(SELECTORS.briefing.anthropicPanel)).toBeVisible()

    // 栏目色签行：五个 chip（Task 1 五源：engineering/research/alignment/interpretability/product）
    await expect(window.locator(SEL.sectionChip)).toHaveCount(5)

    // 合并时间线：seeded 三篇按 publishedAt 倒序（宪法条目在 E2E 无报告产物不出现）
    const titles = await window.locator(SELECTORS.briefing.anthropicArticleTitle).allTextContents()
    expect(titles.filter((t) => t.startsWith('E2E'))).toEqual(['E2E Inst New', 'E2E Res Mid', 'E2E Eng Old'])

    // 行内色签可见
    await expect(window.locator(SEL.sectionTag).first()).toBeVisible()

    // 色签过滤（Task 6 状态机已提交）：All 态点 research → 单选 research
    // （institute 经 filterGroupOf 归 research → Inst New 仍可见；Eng Old 隐藏）
    await window.locator(`${SEL.sectionChip}[data-section="research"]`).click()
    await expect(
      window.locator(SELECTORS.briefing.anthropicArticleTitle).filter({ hasText: 'E2E Eng Old' })
    ).toHaveCount(0)
    await expect(
      window.locator(SELECTORS.briefing.anthropicArticleTitle).filter({ hasText: 'E2E Res Mid' })
    ).toHaveCount(1)
    await expect(
      window.locator(SELECTORS.briefing.anthropicArticleTitle).filter({ hasText: 'E2E Inst New' })
    ).toHaveCount(1)
    // 点灭 research（空选择回退 All）→ 全部恢复
    await window.locator(`${SEL.sectionChip}[data-section="research"]`).click()
    await expect(
      window.locator(SELECTORS.briefing.anthropicArticleTitle).filter({ hasText: 'E2E Eng Old' })
    ).toHaveCount(1)

    // 栏目失败提示（research，真实五源之一）
    const banner = window.locator(`${SEL.sectionError}[data-section="research"]`)
    await expect(banner).toBeVisible()
    await expect(banner).toContainText('Research')
  })

  test('E2E-SEC-2: 打开 institute 文章自动生成博客导读 v2', async ({
    window,
    testLibraryPath,
    testConfigDir,
  }) => {
    const article = seedSectionArticle(
      testLibraryPath,
      'institute',
      'e2e-ins-guide',
      'E2E Inst Guide',
      '2026-08-05T00:00:00.000Z',
      '## 甲\n\n第一节。\n\n## 乙\n\n第二节。'
    )
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
    // 合并时间线里宪法报告（local 置顶）恒为第一行，必须按标题锁定 seeded 文章行
    await window
      .locator(`${SELECTORS.briefing.anthropicArticleRow}:has-text("E2E Inst Guide")`)
      .click()
    await expect(window.locator(SELECTORS.briefing.anthropicArticleReader)).toBeVisible()

    // E2E mock（Task 7）为 anthropic-article 合成三阶段进度并返回 summary 形状导读（2 个 chunk）
    const chunks = window.locator(SEL.guideChunk)
    await expect(chunks).toHaveCount(2, { timeout: 30000 })
    await expect(chunks.first()).toContainText('AI Safety')
  })
})
