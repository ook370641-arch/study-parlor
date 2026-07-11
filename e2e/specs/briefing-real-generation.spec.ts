import { test, expect } from '@playwright/test'
import { startAppWithEnv, stopApp } from '../helpers/network-app-lifecycle'
import { createTestLibrary, cleanupTestLibrary, createTestConfigDir, cleanupTestConfigDir, seedStateJson } from '../helpers/test-library'
import { createMockServer, jsonResponse } from '../helpers/mock-server'
import { SELECTORS } from '../helpers/selectors'
import { CoverPage } from '../pages/CoverPage'
import fs from 'node:fs'
import path from 'node:path'

function localToday(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function makeFeedX() {
  return {
    x: [
      {
        name: 'Aaron Levie',
        handle: '@levie',
        role: 'CEO',
        tweets: [
          { text: 'LLMs are reshaping enterprise workflows.', url: 'https://x.com/levie/status/1', createdAt: '2026-07-05T08:00:00Z' },
        ],
      },
    ],
  }
}

function makeFeedPodcasts() {
  return {
    podcasts: [
      { name: 'Latent Space', title: 'Anthropic researcher interview', url: 'https://youtube.com/watch?v=1', publishedAt: '2026-07-05' },
    ],
  }
}

function makeFeedBlogs() {
  return {
    blogs: [
      { name: 'Anthropic Engineering', title: 'Claude long context reliability', url: 'https://anthropic.com/engineering/1', publishedAt: '2026-07-05' },
    ],
  }
}

function makeExtractionJson() {
  return {
    builders: [
      { name: 'Aaron Levie', role: 'CEO', handle: '@levie', summary: 'Enterprise LLMs', key_url: 'https://x.com/levie/status/1' },
    ],
    podcasts: [
      { show: 'Latent Space', episode: 'Anthropic researcher interview', url: 'https://youtube.com/watch?v=1', takeaway: 'Research insights', summary: 'Interview summary', quote: 'Quote' },
    ],
    blogs: [
      { blog: 'Anthropic Engineering', title: 'Claude long context reliability', url: 'https://anthropic.com/engineering/1', summary: 'Summary', quote: 'Quote' },
    ],
  }
}

function makeChatCompletion(content: string) {
  return {
    id: 'chatcmpl-test',
    object: 'chat.completion',
    created: Date.now(),
    model: 'kimi-k2.6',
    choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
  }
}

test.describe('@p1 briefing real generation chain', () => {
  test('generates briefing through full fetch + LLM chain', async () => {
    const testLibraryPath = createTestLibrary()
    const testConfigDir = createTestConfigDir()
    seedStateJson(testConfigDir, { profile: { name: '简报链路测试员', profile_text: '', preferred_topics: [] } })

    const today = localToday()
    const server = await createMockServer([
      { path: '/feed-x.json', handler: (_req, res) => jsonResponse(res, 200, makeFeedX()) },
      { path: '/feed-podcasts.json', handler: (_req, res) => jsonResponse(res, 200, makeFeedPodcasts()) },
      { path: '/feed-blogs.json', handler: (_req, res) => jsonResponse(res, 200, makeFeedBlogs()) },
      { method: 'GET', path: '/v1/models', handler: (_req, res) => jsonResponse(res, 200, { object: 'list', data: [{ id: 'kimi-k2.6', object: 'model' }] }) },
      {
        method: 'POST',
        path: '/v1/chat/completions',
        handler: (_req, res, body) => {
          const parsed = JSON.parse(body || '{}')
          const lastMsg = parsed.messages?.[parsed.messages.length - 1]?.content ?? ''
          if (lastMsg.includes('Structured Extraction')) {
            jsonResponse(res, 200, makeChatCompletion('```json\n' + JSON.stringify(makeExtractionJson()) + '\n```'))
          } else {
            jsonResponse(res, 200, makeChatCompletion('## X / Twitter\n\n### Aaron Levie\nEnterprise LLM summary.\n\n## Podcasts\n\n### Latent Space\nInterview summary.\n\n## Blogs\n\n### Anthropic Engineering\nLong context reliability.\n\n## 中文摘要\n\n中文总结。'))
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
          E2E_BRIEFING_DISABLE_MOCK: '1',
          KIMI_BASE_URL: server.url,
          BRIEFING_FEED_X_URL: `${server.url}/feed-x.json`,
          BRIEFING_FEED_PODCASTS_URL: `${server.url}/feed-podcasts.json`,
          BRIEFING_FEED_BLOGS_URL: `${server.url}/feed-blogs.json`,
        },
      })
      electronApp = result.electronApp
      window = result.window

      const cover = new CoverPage(window)
      await cover.goToBriefing()
      // Current code no longer auto-generates on mount; explicitly trigger generation.
      await window.locator(SELECTORS.briefing.receiveDigestButton).click()

      await expect(window.locator(SELECTORS.briefing.academicLayout)).toBeVisible({ timeout: 30000 })
      await expect(window.locator(SELECTORS.briefing.academicLayout)).toContainText('Enterprise LLM summary')

      // Verify the generated briefing was cached to disk with sources.
      const cachedFile = path.join(testLibraryPath, '夜航简报', `夜航简报-${today}.md`)
      expect(fs.existsSync(cachedFile)).toBe(true)
      const cachedContent = fs.readFileSync(cachedFile, 'utf8')
      expect(cachedContent).toContain('中文总结')
      expect(cachedContent).toContain('briefing_sources')
    } finally {
      await stopApp(electronApp)
      await cleanupTestLibrary(testLibraryPath, test.info().status !== 'passed')
      await cleanupTestConfigDir(testConfigDir, test.info().status !== 'passed')
      await server.close()
    }
  })
})
