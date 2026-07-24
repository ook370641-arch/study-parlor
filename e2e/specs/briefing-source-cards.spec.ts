import { test, expect } from '../fixtures/electron'
import { CoverPage } from '../pages/CoverPage'
import { ArticleAssistantPage } from '../pages/ArticleAssistantPage'
import { seedBriefing } from '../helpers/test-library'
import { SELECTORS } from '../helpers/selectors'

function localToday(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const DIGEST_WITH_SOURCES = `## AI Safety

### Box CEO Aaron Levie
Aaron Levie 讨论了 LLM 在企业工作流中的落地。

## 原始来源
### X / Twitter
- [Box CEO Aaron Levie](https://x.com/levie/status/1)`

test.describe('@p2 briefing source cards and plaque', () => {
  test('renders grouped source cards with restored titles', async ({ window, testLibraryPath }) => {
    seedBriefing(testLibraryPath, localToday(), DIGEST_WITH_SOURCES)
    const cover = new CoverPage(window)
    await cover.enterName('E2E 测试员')
    await cover.goToBriefing()
    await window.locator(SELECTORS.briefing.receiveDigestButton).click()
    await expect(window.locator(SELECTORS.briefing.academicLayout)).toBeVisible({ timeout: 15000 })

    await window.locator(SELECTORS.briefing.sourceExpandToggle).click()

    const group = window.locator(SELECTORS.briefing.sourceGroup).first()
    await expect(group).toBeVisible()
    await expect(group).toContainText('X / Twitter')

    const link = window.locator(SELECTORS.briefing.sourceCardLink).first()
    await expect(link).toBeVisible()
    await expect(link).toHaveAttribute('href', 'https://x.com/levie/status/1')
    await expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })

  test('chunk headings render as ❧ plaque without § symbol', async ({ window, testLibraryPath }) => {
    seedBriefing(testLibraryPath, localToday(), DIGEST_WITH_SOURCES)
    const cover = new CoverPage(window)
    await cover.enterName('E2E 测试员')
    await cover.goToBriefing()
    await window.locator(SELECTORS.briefing.receiveDigestButton).click()
    await expect(window.locator(SELECTORS.briefing.academicLayout)).toBeVisible({ timeout: 15000 })

    const assistant = new ArticleAssistantPage(window)
    await assistant.waitForMounted()
    await assistant.waitForGuideLoaded()

    const plaque = window.locator(SELECTORS.articleAssistant.bodyChunkPlaque).first()
    await expect(plaque).toBeVisible()
    await expect(plaque).toContainText('❧')
    await expect(plaque).not.toContainText('§')
  })
})
