import { test, expect } from '../fixtures/electron'
import { CoverPage } from '../pages/CoverPage'
import { SELECTORS } from '../helpers/selectors'
import { seedAnthropicArticle, seedStateJson } from '../helpers/test-library'
import * as fs from 'node:fs'
import * as path from 'node:path'

const PROFILE = { name: 'E2E 测试员', profile_text: '', preferred_topics: [] }
const WALL_A_TITLE = 'Wall A — A deliberately long title designed to extend beyond three lines when rendered inside a compact album card'

function seedArticles(testLibraryPath: string, testConfigDir: string) {
  const aUrl = 'https://www.anthropic.com/engineering/wall-a'
  const bUrl = 'https://www.anthropic.com/research/wall-b'
  const aPath = seedAnthropicArticle(testLibraryPath, 'wall-a', WALL_A_TITLE, '正文 A', { source_url: aUrl, section: 'engineering' })
  const bPath = seedAnthropicArticle(testLibraryPath, 'wall-b', 'Wall B', '正文 B', { source_url: bUrl, section: 'research' })
  seedStateJson(testConfigDir, {
    profile: PROFILE,
    briefingSource: 'anthropic',
    anthropicBlogCache: {
      lastFetchedAt: new Date().toISOString(),
      articles: [
        { url: aUrl, title: WALL_A_TITLE, summary: null, publishedAt: '2026-10-01T00:00:00.000Z', imageUrl: null, isSaved: true, filePath: aPath, section: 'engineering' },
        { url: bUrl, title: 'Wall B', summary: null, publishedAt: '2026-09-01T00:00:00.000Z', imageUrl: null, isSaved: true, filePath: bPath, section: 'research' },
      ],
      loading: false,
      error: null,
      sectionStatus: {},
    },
  })
  return { aUrl, aPath, aTitle: WALL_A_TITLE }
}

async function gotoBlog(window: any) {
  const cover = new CoverPage(window)
  await cover.goToBriefing()
  await expect(window.locator(SELECTORS.briefing.anthropicPanel)).toBeVisible()
}

test.describe('博客专辑墙与对应笔记', () => {
  test.use({ extraEnv: { E2E_ANTHROPIC_OFFLINE: '1' } })

  test('筛选排序 → 打开文章 → 返回墙并遗忘恢复选中态', async ({ window, testLibraryPath, testConfigDir }) => {
    const { aUrl } = seedArticles(testLibraryPath, testConfigDir)
    await gotoBlog(window)

    await expect(window.locator('[data-testid="blog-wall"]')).toBeVisible()
    await expect(window.locator('[data-testid="blog-wall-sort-select"]')).toHaveValue('newest')
    await window.locator('[data-testid="blog-wall-sort-select"]').selectOption('oldest')
    await window.locator('[data-testid="blog-wall-filter-select"]').selectOption('research')
    await expect(window.locator(`[data-testid="blog-wall-card-${aUrl}"]`)).toHaveCount(0)
    await window.locator('[data-testid="blog-wall-filter-select"]').selectOption('all')

    await window.locator(`[data-testid="blog-wall-card-${aUrl}"]`).click()
    await expect(window.locator(SELECTORS.briefing.anthropicArticleReader)).toBeVisible()
    await window.locator('[data-testid="blog-back-to-wall"]').click()
    await expect(window.locator('[data-testid="blog-wall"]')).toBeVisible()
    await expect.poll(() => JSON.parse(fs.readFileSync(path.join(testConfigDir, 'state.json'), 'utf8')).lastAnthropicReaderFile).toBeNull()

    await window.locator('[data-testid="briefing-source-writing"]').click()
    await window.locator(SELECTORS.briefing.sourceAnthropicButton).click()
    await expect(window.locator('[data-testid="blog-wall"]')).toBeVisible()
    await expect(window.locator(SELECTORS.briefing.anthropicArticleReader)).toHaveCount(0)
  })

  test('当前博客一键创建对应笔记，再次执行复用同一文件', async ({ window, testLibraryPath, testConfigDir }) => {
    const { aUrl } = seedArticles(testLibraryPath, testConfigDir)
    await gotoBlog(window)
    await window.locator(`[data-testid="blog-wall-card-${aUrl}"]`).click()
    await expect(window.locator(SELECTORS.briefing.anthropicArticleReader)).toBeVisible()

    await window.locator('[data-testid="article-note-create"]').click()
    await expect(window.locator('[data-testid="note-board"]')).toBeVisible()
    const notesDir = path.join(testLibraryPath, 'notes')
    await expect.poll(() => fs.readdirSync(notesDir).filter(name => name.endsWith('.md')).length).toBe(1)

    await window.locator(SELECTORS.briefing.sourceAnthropicButton).click()
    await expect(window.locator(SELECTORS.briefing.anthropicArticleReader)).toBeVisible()
    await window.locator('[data-testid="article-note-create"]').click()
    await expect(window.locator('[data-testid="note-board"]')).toBeVisible()
    expect(fs.readdirSync(notesDir).filter(name => name.endsWith('.md'))).toHaveLength(1)
  })

  test('长标题仅悬停时展开，离开后恢复三行', async ({ window, testLibraryPath, testConfigDir }) => {
    const { aUrl, aTitle } = seedArticles(testLibraryPath, testConfigDir)
    await gotoBlog(window)
    const card = window.locator(`[data-testid="blog-wall-card-${aUrl}"]`)
    const title = card.getByText(aTitle, { exact: true })
    await expect(title).toHaveCSS('-webkit-line-clamp', '3')
    const clippedHeight = await title.evaluate(element => element.getBoundingClientRect().height)

    await card.hover()
    await expect(title).toHaveCSS('display', 'block')
    await expect(title).toHaveCSS('overflow', 'visible')
    await expect.poll(() => title.evaluate(element => element.getBoundingClientRect().height)).toBeGreaterThan(clippedHeight)

    await window.mouse.move(0, 0)
    await expect(title).toHaveCSS('-webkit-line-clamp', '3')
    await expect(title).toHaveCSS('display', '-webkit-box')
  })

  test('筛选下拉框在学术版和报纸版使用对应底色与文字色', async ({ window, testLibraryPath, testConfigDir }) => {
    seedArticles(testLibraryPath, testConfigDir)
    await gotoBlog(window)
    const select = window.locator('[data-testid="blog-wall-filter-select"]')
    const option = select.locator('option[value="all"]')
    await expect(select).toHaveCSS('background-color', 'rgb(42, 31, 26)')
    await expect(select).toHaveCSS('color', 'rgb(232, 213, 183)')
    await expect(option).toHaveCSS('background-color', 'rgb(42, 31, 26)')

    await window.locator('[data-testid="briefing-theme-toggle"]').click()
    await expect(select).toHaveCSS('background-color', 'rgb(245, 242, 237)')
    await expect(select).toHaveCSS('color', 'rgb(42, 31, 26)')
    await expect(option).toHaveCSS('background-color', 'rgb(245, 242, 237)')
  })
})
