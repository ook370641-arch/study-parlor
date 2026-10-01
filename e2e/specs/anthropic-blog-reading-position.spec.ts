import { test, expect } from '../fixtures/electron'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { CoverPage } from '../pages/CoverPage'
import { SELECTORS } from '../helpers/selectors'
import { seedAnthropicArticle, seedStateJson } from '../helpers/test-library'

// 阅读位置记忆(退出时落盘)+ 对照槽重启恢复 + 对照分隔线按钮
// —— docs/superpowers/specs/2026-09-29-reading-position-companion-and-hr-design.md
const PROFILE = { name: 'E2E 测试员', profile_text: '', preferred_topics: [] }
const SCROLLER = '[data-testid="anthropic-reader-scroll"]'
const COMPANION_SCROLLER = '[data-testid="article-companion-editor-scroll"]'

const longBody = (label: string) =>
  Array.from({ length: 40 }, (_, i) => `## ${label}节${i}\n\n${label} 第 ${i} 段内容,用于撑高文档。重复文本。重复文本。`).join('\n\n')

function seedBlogArticle(testLibraryPath: string, slug: string, title: string) {
  const url = `https://www.anthropic.com/engineering/${slug}`
  const filePath = seedAnthropicArticle(testLibraryPath, slug, title, longBody(title), {
    source_url: url,
    section: 'engineering',
    published_at: '2026-08-01T00:00:00.000Z',
  })
  return { url, title, summary: null, publishedAt: '2026-08-01T00:00:00.000Z', imageUrl: null, isSaved: true, filePath, section: 'engineering' }
}

function readState(testConfigDir: string) {
  return JSON.parse(fs.readFileSync(path.join(testConfigDir, 'state.json'), 'utf8'))
}

async function gotoBlog(window: any) {
  const cover = new CoverPage(window)
  await cover.goToBriefing()
  await expect(window.locator(SELECTORS.briefing.anthropicPanel)).toBeVisible({ timeout: 10000 })
}

test.describe('@p1 anthropic-blog-reading-position', () => {
  test('seed 恢复 → 滚动不连续写盘 → 切文章退出点落盘 → 切回恢复', async ({ window, testLibraryPath, testConfigDir }) => {
    const a = seedBlogArticle(testLibraryPath, 'e2e-pos-a', 'E2E Pos A')
    const b = seedBlogArticle(testLibraryPath, 'e2e-pos-b', 'E2E Pos B')
    seedStateJson(testConfigDir, {
      profile: PROFILE,
      briefingSource: 'anthropic',
      anthropicBlogCache: { lastFetchedAt: new Date().toISOString(), articles: [a, b], loading: false, error: null, sectionStatus: {} },
      lastAnthropicReaderFile: a.filePath,
      anthropicScrollPositions: { [a.filePath]: 6 },
    })
    await gotoBlog(window)

    // 重启恢复:文章自动打开且滚动位置 > 0(原 bug:块容器取错层,恒存 0 回顶部)
    await expect(window.locator(SELECTORS.briefing.anthropicReader)).toBeVisible({ timeout: 10000 })
    const scroller = window.locator(SCROLLER)
    await expect.poll(() => scroller.evaluate((el: HTMLElement) => el.scrollTop), { timeout: 8000 }).toBeGreaterThan(0)

    // 滚动到新位置 → 400ms 防抖过后 state.json 仍是旧值(不连续写盘,2026-09-29 用户要求)
    await scroller.evaluate((el: HTMLElement) => { el.scrollTop = el.scrollHeight; el.dispatchEvent(new Event('scroll')) })
    await window.waitForTimeout(700)
    expect(readState(testConfigDir).anthropicScrollPositions?.[a.filePath]).toBe(6)

    // 切到 B(退出点:切文档落盘)→ state.json 里 A 的索引更新(>6)
    await window.locator(SELECTORS.briefing.anthropicArticleTitle).filter({ hasText: 'E2E Pos B' }).click()
    await expect(window.locator(SELECTORS.briefing.anthropicReaderTitle)).toHaveText('E2E Pos B', { timeout: 8000 })
    await expect.poll(() => readState(testConfigDir).anthropicScrollPositions?.[a.filePath]).toBeGreaterThan(6)

    // 切回 A → 位置恢复到刚才滚到的底部附近(scrollTop 明显 > 0)
    await window.locator(SELECTORS.briefing.anthropicArticleTitle).filter({ hasText: 'E2E Pos A' }).click()
    await expect(window.locator(SELECTORS.briefing.anthropicReaderTitle)).toHaveText('E2E Pos A', { timeout: 8000 })
    await expect.poll(() => scroller.evaluate((el: HTMLElement) => el.scrollTop), { timeout: 8000 }).toBeGreaterThan(0)
  })

  test('reload(beforeunload)落盘:滚动 → 刷新 → state.json 更新 → 重开后恢复', async ({ window, testLibraryPath, testConfigDir }) => {
    const a = seedBlogArticle(testLibraryPath, 'e2e-pos-c', 'E2E Pos C')
    seedStateJson(testConfigDir, {
      profile: PROFILE,
      briefingSource: 'anthropic',
      anthropicBlogCache: { lastFetchedAt: new Date().toISOString(), articles: [a], loading: false, error: null, sectionStatus: {} },
      lastAnthropicReaderFile: a.filePath,
    })
    await gotoBlog(window)
    await expect(window.locator(SELECTORS.briefing.anthropicReader)).toBeVisible({ timeout: 10000 })
    const scroller = window.locator(SCROLLER)

    await scroller.evaluate((el: HTMLElement) => { el.scrollTop = el.scrollHeight; el.dispatchEvent(new Event('scroll')) })
    await window.waitForTimeout(700) // 防抖窗过,值在 ref
    await window.reload()
    await window.waitForLoadState('domcontentloaded')

    // beforeunload 已把 ref 落盘
    await expect.poll(() => readState(testConfigDir).anthropicScrollPositions?.[a.filePath] ?? 0).toBeGreaterThan(0)

    // 重开后文章自动打开且位置恢复
    await gotoBlog(window)
    await expect(window.locator(SELECTORS.briefing.anthropicReader)).toBeVisible({ timeout: 10000 })
    await expect.poll(() => window.locator(SCROLLER).evaluate((el: HTMLElement) => el.scrollTop), { timeout: 8000 }).toBeGreaterThan(0)
  })

  test('对照槽:重启恢复对照文 + 对照滚动位置 + 对照分隔线按钮', async ({ window, testLibraryPath, testConfigDir }) => {
    const main = seedBlogArticle(testLibraryPath, 'e2e-pos-main', 'E2E Pos Main')
    const comp = seedBlogArticle(testLibraryPath, 'e2e-pos-comp', 'E2E Pos Comp')
    seedStateJson(testConfigDir, {
      profile: PROFILE,
      briefingSource: 'anthropic',
      anthropicBlogCache: { lastFetchedAt: new Date().toISOString(), articles: [main, comp], loading: false, error: null, sectionStatus: {} },
      lastAnthropicReaderFile: main.filePath,
      articlePanelMode: { anthropic: 'companion', scout: 'guide', job: 'guide' },
      lastArticleCompanion: { mainKey: main.filePath, filePath: comp.filePath },
      articleCompanionScrollPositions: { [comp.filePath]: 5 },
    })
    await gotoBlog(window)

    // 主文 + 对照文都自动恢复
    await expect(window.locator(SELECTORS.briefing.anthropicReader)).toBeVisible({ timeout: 10000 })
    await expect(window.locator('[data-testid="article-companion-board"]')).toBeVisible({ timeout: 10000 })
    await expect(window.locator('[data-testid="article-companion-board"]')).toContainText('e2e-pos-comp')

    // 对照滚动位置恢复(ProseMirror 建块后轮询滚动)
    const compScroller = window.locator(COMPANION_SCROLLER)
    await expect(compScroller).toBeVisible({ timeout: 8000 })
    await expect.poll(() => compScroller.evaluate((el: HTMLElement) => el.scrollTop), { timeout: 8000 }).toBeGreaterThan(0)

    // 对照分隔线按钮:点击后对照文档插入 hr(md 序列化为 *** 或 ---)
    await window.locator('[data-testid="article-companion-insert-hr"]').click()
    await window.waitForFunction(() => /(\*\*\*|---)/.test((window as any).useStore.getState().articleCompanion?.body ?? ''))
  })
})
