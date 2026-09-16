import { test, expect } from '../fixtures/electron'
import { CoverPage } from '../pages/CoverPage'
import { SELECTORS } from '../helpers/selectors'
import { seedAnthropicArticleWithImage, seedStateJson } from '../helpers/test-library'

const PROFILE = { name: 'E2E 测试员', profile_text: '', preferred_topics: [] }

const ARTICLE_BODY = `## Introduction

Good evaluations help teams ship AI agents more confidently. See [Building effective agents](https://www.anthropic.com/engineering/building-effective-agents) for context.

![diagram](./.assets/image.png)

Components of evaluations for agents.

### Types of graders

*   A **task** is a single test with defined inputs.
*   A **trial** is one attempt at a task.

\`\`\`yaml
task:
  id: "fix-auth-bypass_1"
\`\`\`
`

test.describe('博客排版对标官网', () => {
  // 离线：发现接口直接抛 NETWORK_ERROR， seeded cache 原样保留（模式照抄 multi-source spec）
  test.use({ extraEnv: { E2E_ANTHROPIC_OFFLINE: '1' } })

  test('图注 figure 化 + 代码块复制 + 标题/链接/术语 computed style', async ({
    window,
    testLibraryPath,
    testConfigDir,
  }) => {
    const slug = 'e2e-typography'
    const url = `https://www.anthropic.com/engineering/${slug}`
    const { filePath } = seedAnthropicArticleWithImage(
      testLibraryPath,
      slug,
      'Typography Fixture',
      ARTICLE_BODY,
      { published_at: '2026-01-08T16:00:00.000Z' },
    )
    seedStateJson(testConfigDir, {
      profile: PROFILE,
      briefingSource: 'anthropic',
      anthropicBlogCache: {
        lastFetchedAt: new Date().toISOString(),
        articles: [{
          url, title: 'Typography Fixture', summary: null,
          publishedAt: '2026-01-08T16:00:00.000Z', imageUrl: null,
          isSaved: true, filePath, section: 'engineering',
        }],
        loading: false, error: null, sectionStatus: {},
      },
    })

    const cover = new CoverPage(window)
    // profile 已 seed：封面无名字输入框，直接进简报（模式照抄 multi-source spec）
    await cover.goToBriefing()
    await expect(window.locator(SELECTORS.briefing.page)).toBeVisible()
    await window.locator(SELECTORS.briefing.sourceAnthropicButton).click()

    // 点击 fixture 文章行进阅读器（排除宪法置顶行）
    const row = window.locator(SELECTORS.briefing.anthropicArticleRow)
      .filter({ hasText: 'Typography Fixture' })
    await row.click()
    const article = window.locator('[data-testid="anthropic-reader-article"]')
    await expect(article).toBeVisible({ timeout: 15000 })

    // B3 图注：figure > img + figcaption
    const figure = article.locator('figure.md-figure')
    await expect(figure).toHaveCount(1)
    await expect(figure.locator('figcaption')).toHaveText('Components of evaluations for agents.')

    // B4 代码块：顶栏 + 语言标签 + 复制按钮，点击后文案翻转
    await expect(article.locator('.md-codeblock-lang')).toHaveText('yaml')
    const copyBtn = article.locator('[data-testid="md-codeblock-copy"]')
    await copyBtn.click()
    await expect(copyBtn).toHaveText('已复制 ✓')

    // B1 标题阶梯：h3 17px / 上间距 32px
    await expect(article.locator('h3').first()).toHaveCSS('font-size', '17px')
    await expect(article.locator('h3').first()).toHaveCSS('margin-top', '32px')

    // B5 链接加粗
    await expect(article.locator('p a').first()).toHaveCSS('font-weight', '600')

    // B6 术语琥珀：li > strong:first-child 颜色 #d97757
    await expect(article.locator('li > strong').first()).toHaveCSS('color', 'rgb(217, 119, 87)')

    // B2 列表间距 10px
    await expect(article.locator('li').first()).toHaveCSS('margin-top', '10px')
  })
})
