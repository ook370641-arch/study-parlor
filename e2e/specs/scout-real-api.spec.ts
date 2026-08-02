import { test, expect } from '../fixtures/electron'
import { CoverPage } from '../pages/CoverPage'
import { SELECTORS } from '../helpers/selectors'
import { seedStateJson } from '../helpers/test-library'

test.describe('@real 拾贝 — real agent + search + fetch chain', () => {
  // Disable the E2E mock so scout exercises real Kimi agent + Tavily search + article fetch.
  test.use({ extraEnv: { E2E_SCOUT_DISABLE_MOCK: '1' } })
  test.setTimeout(120000)

  test.beforeEach(async ({ testConfigDir }) => {
    seedStateJson(testConfigDir, {
      profile: { name: 'E2E 测试员', profile_text: '', preferred_topics: [] },
      briefingSource: 'scout',
    })
  })

  test('@real 搜索-抓取链路可走通', async ({ window }) => {
    const cover = new CoverPage(window)
    await cover.goToBriefing()

    // Pre-seeded 'scout' source shows ScoutPanel directly.
    await expect(window.locator(SELECTORS.scout.panel)).toBeVisible()
    await expect(window.locator(SELECTORS.scout.chatEmpty)).toBeVisible()

    // Create a new conversation.
    await window.locator(SELECTORS.scout.newConversation).click()
    await expect(window.locator(SELECTORS.scout.chatView)).toBeVisible()

    // Send a message — real agent pipeline searches + fetches.
    await window.locator(SELECTORS.scout.chatInput).fill('找一篇关于 AI agent 的文章')
    await window.locator(SELECTORS.scout.chatSend).click()

    // Wait for either candidate cards (search results) or an assistant text
    // reply — both mean the real pipeline completed a turn.
    const result = await Promise.race([
      window.locator(SELECTORS.scout.candidateCards).waitFor({ timeout: 90000 }).then(() => 'candidates'),
      window.locator(SELECTORS.scout.message('assistant')).last().waitFor({ timeout: 90000 }).then(() => 'message'),
    ])
    expect(result).toBeDefined()
  })
})
