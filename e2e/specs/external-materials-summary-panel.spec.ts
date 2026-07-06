import { test, expect } from '../fixtures/electron'
import { CoverPage } from '../pages/CoverPage'
import { HomePage } from '../pages/HomePage'
import { PreStudyPage } from '../pages/PreStudyPage'
import { StudyPage } from '../pages/StudyPage'
import { seedStateJson } from '../helpers/test-library'

test.describe('@p1 external materials summary panel', () => {
  test.beforeEach(async ({ testConfigDir }) => {
    seedStateJson(testConfigDir, {
      profile: { name: '摘要面板测试', profile_text: '', preferred_topics: [] },
    })
  })

  test('panel is closed by default and toggle is visible', async ({ window }) => {
    const cover = new CoverPage(window)
    await cover.enterIfNeeded('摘要面板测试')

    const home = new HomePage(window)
    await home.waitForLoaded()
    await home.startNewTopic()

    const preStudy = new PreStudyPage(window)
    await preStudy.waitForVisible()
    await preStudy.fillTopic('量子纠缠')
    await preStudy.clickStart()

    const study = new StudyPage(window)
    await study.waitForLoaded()

    await study.setMockExternalMaterials(
      '核心概念：量子纠缠是两个粒子的关联状态。\n关键区分点：纠缠不等于超距作用[1]。',
      [
        { title: 'Wikipedia: Quantum entanglement', url: 'https://example.com/1', snippet: 'Wikipedia' },
        { title: 'Nature: Bell tests', url: 'https://example.com/2', snippet: 'Nature' },
      ]
    )

    await expect(study.externalMaterialsCard).toBeVisible()
    await expect(study.externalSummaryOpen).toBeVisible()
    await expect(study.externalSummaryPanel).toBeHidden()
  })

  test('opens and closes summary panel', async ({ window }) => {
    const cover = new CoverPage(window)
    await cover.enterIfNeeded('摘要面板测试')

    const home = new HomePage(window)
    await home.waitForLoaded()
    await home.startNewTopic()

    const preStudy = new PreStudyPage(window)
    await preStudy.waitForVisible()
    await preStudy.fillTopic('量子纠缠')
    await preStudy.clickStart()

    const study = new StudyPage(window)
    await study.waitForLoaded()
    await study.setMockExternalMaterials(
      '常见误解：纠缠不能用于超光速通信[1]。',
      [{ title: 'Source 1', url: 'https://example.com/1' }]
    )

    await study.openExternalSummary()
    await expect(study.externalSummaryPanel).toContainText('外部资料摘要')
    await expect(study.externalSummaryPanel).toContainText('常见误解')

    await study.closeExternalSummary()
    await expect(study.externalSummaryPanel).toBeHidden()

    await study.openExternalSummary()
    await study.closeExternalSummaryByEsc()
    await expect(study.externalSummaryPanel).toBeHidden()
  })

  test('source citations are clickable and scroll to source list', async ({ window }) => {
    const cover = new CoverPage(window)
    await cover.enterIfNeeded('摘要面板测试')

    const home = new HomePage(window)
    await home.waitForLoaded()
    await home.startNewTopic()

    const preStudy = new PreStudyPage(window)
    await preStudy.waitForVisible()
    await preStudy.fillTopic('量子纠缠')
    await preStudy.clickStart()

    const study = new StudyPage(window)
    await study.waitForLoaded()
    await study.setMockExternalMaterials(
      '核心概念：纠缠描述两个粒子的关联[1][2]。',
      [
        { title: 'Wikipedia: Quantum entanglement', url: 'https://example.com/1' },
        { title: 'Nature: Bell tests', url: 'https://example.com/2' },
      ]
    )

    await study.openExternalSummary()
    await expect(study.externalSummaryPanel).toContainText('[1]')

    // Click citation [2].
    await study.externalSummaryPanel.locator('text=[2]').first().click()
    const source2 = study.externalSummarySource(2)
    await expect(source2).toBeVisible()

    await study.closeExternalSummary()
  })

  test('panel does not cover chat bubbles when open', async ({ window }) => {
    const cover = new CoverPage(window)
    await cover.enterIfNeeded('摘要面板测试')

    const home = new HomePage(window)
    await home.waitForLoaded()
    await home.startNewTopic()

    const preStudy = new PreStudyPage(window)
    await preStudy.waitForVisible()
    await preStudy.fillTopic('量子纠缠')
    await preStudy.clickStart()

    const study = new StudyPage(window)
    await study.waitForLoaded()
    await study.setMockExternalMaterials(
      '核心概念：纠缠描述两个粒子的关联[1]。',
      [{ title: 'Source 1', url: 'https://example.com/1' }]
    )

    // Inject a mock assistant message so the test does not depend on real LLM streaming.
    await window.evaluate(() => {
      const store = (window as any).useStore
      const session = store.getState().session
      if (session) {
        store.setState({
          session: {
            ...session,
            history: [
              ...session.history,
              { role: 'assistant', content: '这是一条比较长的测试回复，用于验证当右侧摘要面板展开时，聊天消息气泡不会被面板遮挡。' }
            ]
          }
        })
      }
    })

    await study.openExternalSummary()

    // Assert the actual assistant message bubble (not the full-width wrapper) stays left of the panel.
    const bubble = window.locator('[data-testid="assistant-message"] >> div').last()
    await bubble.waitFor({ state: 'visible' })
    const bubbleBox = await bubble.boundingBox()
    const panelBox = await study.externalSummaryPanel.boundingBox()
    expect(bubbleBox).not.toBeNull()
    expect(panelBox).not.toBeNull()
    expect(bubbleBox!.x + bubbleBox!.width).toBeLessThanOrEqual(panelBox!.x + 2)

    await study.closeExternalSummary()
  })
})
