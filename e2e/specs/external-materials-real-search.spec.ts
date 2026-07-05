import { test, expect } from '@playwright/test'
import { startAppWithEnv, stopApp } from '../helpers/network-app-lifecycle'
import { createTestLibrary, cleanupTestLibrary, createTestConfigDir, cleanupTestConfigDir, seedStateJson } from '../helpers/test-library'
import { createMockServer, jsonResponse } from '../helpers/mock-server'
import { SELECTORS } from '../helpers/selectors'
import { CoverPage } from '../pages/CoverPage'
import { HomePage } from '../pages/HomePage'
import { PreStudyPage } from '../pages/PreStudyPage'
import { StudyPage } from '../pages/StudyPage'

function makeChatCompletion(content: string) {
  return {
    id: 'chatcmpl-test',
    object: 'chat.completion',
    created: Date.now(),
    model: 'kimi-k2.6',
    choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
  }
}

test.describe('@p1 external materials real search chain', () => {
  test('collects external materials through query + search + brief chain', async () => {
    const testLibraryPath = createTestLibrary()
    const testConfigDir = createTestConfigDir()
    seedStateJson(testConfigDir, { profile: { name: '搜索链路测试员', profile_text: '', preferred_topics: [] } })

    const server = await createMockServer([
      { method: 'GET', path: '/v1/models', handler: (_req, res) => jsonResponse(res, 200, { object: 'list', data: [{ id: 'kimi-k2.6', object: 'model' }] }) },
      {
        method: 'POST',
        path: '/search',
        handler: (_req, res) => jsonResponse(res, 200, {
          results: [
            { title: 'Socratic Method Guide', url: 'https://example.com/socratic', content: 'The Socratic method is a form of cooperative argumentative dialogue.' },
            { title: 'Bloom Taxonomy', url: 'https://example.com/bloom', content: 'Bloom taxonomy classifies educational learning objectives.' },
          ],
        }),
      },
      {
        method: 'POST',
        path: '/v1/chat/completions',
        handler: (_req, res, body) => {
          const parsed = JSON.parse(body || '{}')
          const lastMsg = parsed.messages?.[parsed.messages.length - 1]?.content ?? ''
          if (lastMsg.includes('搜索查询词')) {
            jsonResponse(res, 200, makeChatCompletion('["苏格拉底式教学法", "Bloom 掌握学习", "苏格拉底对话案例"]'))
          } else {
            jsonResponse(res, 200, makeChatCompletion('核心概念：苏格拉底式教学通过提问引导学生自己发现答案。常见误解：导师只问不答。应用场景：一对一辅导和掌握学习。'))
          }
        },
      },
    ])

    let electronApp: Awaited<ReturnType<typeof startAppWithEnv>>['electronApp']
    let window: Awaited<ReturnType<typeof startAppWithEnv>>['window']

    try {
      const result = await startAppWithEnv({
        testLibraryPath,
        testConfigDir,
        extraEnv: {
          TAVILY_API_KEY: 'tvly-test-key',
          TAVILY_API_URL: `${server.url}/search`,
          KIMI_BASE_URL: server.url,
        },
      })
      electronApp = result.electronApp
      window = result.window

      const cover = new CoverPage(window)
      await cover.enterIfNeeded('搜索链路测试员')

      const home = new HomePage(window)
      await home.waitForLoaded()
      await home.startNewTopic()

      const preStudy = new PreStudyPage(window)
      await preStudy.waitForVisible()
      await preStudy.fillTopic('苏格拉底式教学法')
      await preStudy.toggleExternalMaterials()
      await preStudy.clickStart()

      const study = new StudyPage(window)
      await study.waitForLoaded()

      // External materials card should appear and eventually show sources.
      await expect(study.externalMaterialsCard).toBeVisible({ timeout: 30000 })
      await expect(study.externalMaterialsCard).toContainText('6 个来源', { timeout: 30000 })
      await study.externalMaterialsCard.click()
      await expect(study.externalMaterialsCard.getByText('Socratic Method Guide').first()).toBeVisible()
      await expect(study.externalMaterialsCard.getByText('Bloom Taxonomy').first()).toBeVisible()
    } finally {
      await stopApp(electronApp)
      await cleanupTestLibrary(testLibraryPath, test.info().status !== 'passed')
      await cleanupTestConfigDir(testConfigDir, test.info().status !== 'passed')
      await server.close()
    }
  })
})
