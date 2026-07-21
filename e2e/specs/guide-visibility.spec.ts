import { test, expect } from '../fixtures/electron'
import { CoverPage } from '../pages/CoverPage'
import { ArticleAssistantPage } from '../pages/ArticleAssistantPage'
import { SELECTORS } from '../helpers/selectors'
import { seedBriefing } from '../helpers/test-library'
import type { Page } from '@playwright/test'

function localToday(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const DIGEST_CONTENT = `## AI Safety

### Box CEO Aaron Levie
Aaron Levie 讨论了 AI 安全与对齐在企业工作流中的落地。

## 原始来源
### Aaron Levie
- [tweet](https://x.com/levie/status/1)`

async function openDigestWithGuide(window: Page, libPath: string): Promise<ArticleAssistantPage> {
  seedBriefing(libPath, localToday(), DIGEST_CONTENT)
  const cover = new CoverPage(window)
  await cover.enterName('E2E 测试员')
  await cover.goToBriefing()
  await window.locator(SELECTORS.briefing.receiveDigestButton).click()
  await expect(window.locator(SELECTORS.briefing.academicLayout)).toBeVisible({ timeout: 15000 })
  const assistant = new ArticleAssistantPage(window)
  await assistant.waitForMounted()
  return assistant
}

test.describe('@p2 导读可见性', () => {
  test('academic 主题导读面板 z-index 站上压暗遮罩', async ({ window, testLibraryPath }) => {
    const assistant = await openDigestWithGuide(window, testLibraryPath)
    await assistant.waitForGuideLoaded()

    const panel = window.locator('[data-testid="article-assistant-panel"]')
    await expect(panel).toHaveCSS('z-index', '5')
  })

  test('newspaper 主题导读卡片为亮色', async ({ window, testLibraryPath }) => {
    const assistant = await openDigestWithGuide(window, testLibraryPath)
    await assistant.waitForGuideLoaded()

    await window.locator(SELECTORS.briefing.themeToggle).click()
    await expect(window.locator(SELECTORS.briefing.newspaperLayout)).toBeVisible({ timeout: 10000 })

    const chunk = window.locator(SELECTORS.articleAssistant.guideChunk).first()
    await expect(chunk).toHaveCSS('background-color', 'rgb(255, 255, 255)')
  })
})
