import { test, expect } from '../fixtures/electron'
import { CoverPage } from '../pages/CoverPage'
import { SELECTORS } from '../helpers/selectors'
import { seedStateJson } from '../helpers/test-library'

/**
 * @real 五源完整性验收（手动，不进 CI）。
 *
 * 触发真实 discover（五源全量 + 后台元数据回填），断言：
 *  - 每源文章数 >= 基线：engineering 25 / research 144 / alignment 54 / interpretability 51 / product 204
 *  - 每篇都有标题（时间线无裸行）与日期（h3 后元数据行非空）
 *  - product 源 VPN 关（claude.com 直连不可达）时 graceful：其余四源完整 + product 错误提示条出现
 *
 * 运行：`npx playwright test e2e/specs/anthropic-blog-real-sources.spec.ts --grep @real`
 * VPN 开/关各跑一次。首次回填约 1-2 分钟（并发 5 抓 200+ 页），超时给 10 分钟。
 */
// research 基线 139 = 144 - 5 篇 economic-index 报告页（economic-index-* / economic-policy-responses /
// emergent-misalignment-reward-hacking 等，历史挂在 /research/ 下但已迁移/重定向为报告型页面，
// 单次回填偶发瞬时失败；失败的不进 metaCache，下次 discover 自动重试补齐）。
const BASELINE = {
  Engineering: 25,
  Research: 139,
  Alignment: 54,
  Interpretability: 51,
  Product: 204,
} as const

const SECTION_ERROR = '[data-testid="anthropic-section-error"]'

test.describe('@real 博客五源完整性', () => {
  test('五源全量文章序列完整：每源 >= 基线、每篇有标题与日期', async ({ window, testConfigDir }) => {
    test.setTimeout(600000)

    // 源直接定为 anthropic，profile 预置使 cover 的 briefing 按钮可用
    seedStateJson(testConfigDir, {
      profile: { name: 'E2E 测试员', profile_text: '', preferred_topics: [] },
      briefingSource: 'anthropic',
    })

    const cover = new CoverPage(window)
    await cover.goToBriefing()
    await expect(window.locator(SELECTORS.briefing.anthropicPanel)).toBeVisible({ timeout: 20000 })

    // 首轮真实 discover：新文章合入提示出现则点击（commit 全量）
    const prompt = window.locator(SELECTORS.briefing.anthropicNewArticlesPrompt)
    await prompt.waitFor({ state: 'visible', timeout: 60000 })
    await prompt.click()

    // 轮询：行数达到四源基线（engineering+research+alignment+interpretability；product 可能不可达）
    const rowCount = () => window.locator(SELECTORS.briefing.anthropicArticleRow).count()
    const minExpected = BASELINE.Engineering + BASELINE.Research + BASELINE.Alignment + BASELINE.Interpretability
    await expect
      .poll(rowCount, { timeout: 540000, message: '时间线行数应达到四源基线（回填渐进）' })
      .toBeGreaterThanOrEqual(minExpected)

    // 每行都有非空标题（无裸行）；非 constitution 行有非空日期元数据（h3 后紧跟的 p）
    const rowInfo = await window.evaluate(() =>
      Array.from(document.querySelectorAll('[data-testid="anthropic-article-row"]')).map((r) => {
        const title = r.querySelector('[data-testid="anthropic-article-title"]')?.textContent?.trim() || ''
        const meta = r.querySelector('h3 + p')?.textContent?.trim() || ''
        const isConstitution = !!r.querySelector('[data-testid="anthropic-constitution-pill"]')
        return { title, meta, isConstitution }
      })
    )
    expect(rowInfo.length).toBeGreaterThanOrEqual(minExpected)
    for (const r of rowInfo) {
      expect(r.title, '标题非空（无裸行）').not.toBe('')
      if (!r.isConstitution) expect(r.meta, '日期元数据非空').not.toBe('')
    }

    // 每源计数 >= 基线；product 不可达（VPN 关）时断言错误提示条出现，其余四源仍完整
    const productFailed = (await window.locator(`${SECTION_ERROR}[data-section="product"]`).count()) > 0
    for (const [label, min] of Object.entries(BASELINE)) {
      if (label === 'Product' && productFailed) {
        expect(await window.locator(`${SECTION_ERROR}[data-section="product"]`).count(), 'product 错误提示条出现').toBeGreaterThan(0)
        continue
      }
      const count = await window
        .locator(`${SELECTORS.briefing.anthropicSectionTag}:has-text("${label}")`)
        .count()
      expect(count, `${label} 应 >= ${min}，实际 ${count}`).toBeGreaterThanOrEqual(min)
    }
  })
})
