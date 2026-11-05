import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { startAppWithEnv, stopApp } from '../helpers/network-app-lifecycle'
import { createTestLibrary, cleanupTestLibrary, createTestConfigDir, cleanupTestConfigDir, seedBlogArticleWithCache } from '../helpers/test-library'
import { createMockServer, jsonResponse } from '../helpers/mock-server'
import { CoverPage } from '../pages/CoverPage'

const NOTE_PATH = 'notes/a.md'
const OTHER_NOTE_PATH = 'notes/other.md'
const ORIGINAL_CONTENT = '\n我的关注点：概念边界。  \n\n保留这一行。\n'
const AI_BODY = `## 核心蒸馏\n\n${'蒸馏核心思想'.repeat(160)}\n\n## 思想坐标\n\n原笔迹关注的边界由此得到修正。[W1-1][W2-1]\n\n### 来源\n- [W1-1] Origin\n- [W2-1] Critique`

function makeChatCompletion(content: string) {
  return {
    id: 'chatcmpl-test', object: 'chat.completion', created: Date.now(), model: 'kimi-k2.6',
    choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
  }
}

function writeNote(libraryPath: string, relativePath: string, title: string, url: string, body: string): void {
  const absolutePath = path.join(libraryPath, relativePath)
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true })
  const raw = `---\ntitle: ${title}\nurl: ${url}\nsource: web\nrating: 0\nsummary: ''\nhighlight: ''\ncollected_at: '2026-11-05T00:00:00.000Z'\n---\n${body}`
  fs.writeFileSync(absolutePath, raw, 'utf8')
}

let testLibraryPath: string
let testConfigDir: string
let noteAbsolutePath: string
let articleUrl: string
let articlePath: string
let window: Page
let electronApp: Awaited<ReturnType<typeof startAppWithEnv>>['electronApp'] | undefined
let server: Awaited<ReturnType<typeof createMockServer>>
let chatRequests: number
let searchRequests: number
let failSearches: boolean

test.describe('@p1 AI 笔记两轮生成', () => {
  test.beforeEach(async () => {
    testLibraryPath = createTestLibrary()
    testConfigDir = createTestConfigDir()
    const seeded = seedBlogArticleWithCache(testLibraryPath, testConfigDir, { slug: 'a', title: 'E2E AI Note', body: '全文核心事实与论证。' })
    articleUrl = seeded.url
    articlePath = seeded.filePath
    writeNote(testLibraryPath, NOTE_PATH, 'A', articleUrl, ORIGINAL_CONTENT)
    writeNote(testLibraryPath, OTHER_NOTE_PATH, 'Other', 'https://example.com/other', '其他文章笔记')
    noteAbsolutePath = path.join(testLibraryPath, NOTE_PATH)
    const guidePath = articlePath.replace(/\.md$/, '.guide.md')
    fs.writeFileSync(guidePath, '---\ntype: article-assistant\n---\n导读提供结构。', 'utf8')
    chatRequests = 0
    searchRequests = 0
    failSearches = false

    server = await createMockServer([
      { method: 'GET', path: '/v1/models', handler: (_request, response) => jsonResponse(response, 200, { object: 'list', data: [{ id: 'kimi-k2.6', object: 'model' }] }) },
      {
        method: 'POST', path: '/search', handler: (_request, response, body) => {
          searchRequests++
          if (failSearches) return jsonResponse(response, 500, { error: 'forced search failure' })
          const query = JSON.parse(body || '{}').query as string
          return jsonResponse(response, 200, { results: [{ title: `${query} source`, url: `https://example.com/${encodeURIComponent(query)}`, content: `${query} theoretical context` }] })
        },
      },
      {
        method: 'POST', path: '/v1/chat/completions', handler: (_request, response, body) => {
          chatRequests++
          const parsed = JSON.parse(body || '{}')
          const prompt = parsed.messages?.[parsed.messages.length - 1]?.content ?? ''
          if (prompt.includes('第一轮：思想宽域定位')) return jsonResponse(response, 200, makeChatCompletion('["theory origins", "adjacent critique"]'))
          if (prompt.includes('第二轮：思想脉络深钻')) return jsonResponse(response, 200, makeChatCompletion('["lineage deep dive", "framework boundaries"]'))
          if (prompt.includes('资料策展')) {
            return jsonResponse(response, 200, makeChatCompletion(JSON.stringify([
              { relation: '源流', claim: '理论源流', contribution: '定位原文', sourceIds: ['W1-1'] },
              { relation: '批评', claim: '主要批评', contribution: '修正原笔迹边界', sourceIds: ['W2-1'] },
              { relation: '相邻', claim: '相邻框架', contribution: '提供对照', sourceIds: ['W1-2'] },
            ])))
          }
          if (prompt.includes('笔记写作')) return jsonResponse(response, 200, makeChatCompletion(AI_BODY))
          return jsonResponse(response, 500, { error: 'unexpected prompt' })
        },
      },
    ])
    const started = await startAppWithEnv({
      testLibraryPath, testConfigDir,
      extraEnv: { TAVILY_API_KEY: 'tvly-test-key', TAVILY_API_URL: `${server.url}/search`, KIMI_BASE_URL: server.url },
    })
    electronApp = started.electronApp
    window = started.window
  })

  test.afterEach(async () => {
    await stopApp(electronApp)
    await cleanupTestLibrary(testLibraryPath, test.info().status !== 'passed')
    await cleanupTestConfigDir(testConfigDir, test.info().status !== 'passed')
    await server.close()
  })

  async function openMainNote(): Promise<void> {
    const cover = new CoverPage(window)
    await cover.enterIfNeeded('E2E 测试员')
    await cover.goToBriefing()
    await window.locator('[data-testid="writing-list-tab-notes"]').click()
    await window.locator('[data-testid="note-card-a"]').click()
    await expect(window.locator('[data-testid="note-board"]')).toBeVisible()
  }

  test('主笔记预览确认后保留原笔迹，重复 IPC 与重载都不会再生成', async () => {
    await openMainNote()
    const rawBefore = fs.readFileSync(noteAbsolutePath, 'utf8')
    await window.locator('[data-testid="note-ai-generate"]').click()
    await expect(window.locator('[data-testid="note-ai-preview"]')).toBeVisible()
    await expect(window.locator('[data-testid="note-ai-preview"]')).toContainText('核心蒸馏')
    expect(fs.readFileSync(noteAbsolutePath, 'utf8')).toBe(rawBefore)
    expect(chatRequests).toBe(4)
    expect(searchRequests).toBe(4)

    await window.locator('[data-testid="note-ai-apply"]').click()
    await expect(window.locator('[data-testid="note-ai-preview"]')).toHaveCount(0)
    await expect(window.locator('[data-testid="note-ai-generate"]')).toHaveCount(0)
    await expect(window.locator('[data-testid="note-board"] .ProseMirror')).toContainText('我的关注点：概念边界。')
    const written = fs.readFileSync(noteAbsolutePath, 'utf8')
    expect(written).toContain('核心蒸馏')
    expect(written).toContain('ai_generated_at:')
    expect(written.endsWith(ORIGINAL_CONTENT)).toBe(true)
    expect(fs.readdirSync(path.dirname(noteAbsolutePath)).filter(name => name.endsWith('.md'))).toHaveLength(2)

    const duplicateError = await window.evaluate(async targetPath => {
      try {
        await (window as any).api.notesGenerateAi({ path: targetPath })
        return ''
      } catch (error) {
        return String(error)
      }
    }, NOTE_PATH)
    expect(duplicateError).toContain('ALREADY_GENERATED')
    expect(chatRequests).toBe(4)

    await window.reload()
    await openMainNote()
    await expect(window.locator('[data-testid="note-ai-generate"]')).toHaveCount(0)
    expect(fs.readdirSync(path.dirname(noteAbsolutePath)).filter(name => name.endsWith('.md'))).toHaveLength(2)
  })

  test('对照页只允许当前文章来源笔记，写回不跳页', async () => {
    const cover = new CoverPage(window)
    await cover.enterIfNeeded('E2E 测试员')
    await cover.goToBriefing()
    await window.locator('[data-testid="anthropic-article-row"]').filter({ hasText: 'E2E AI Note' }).click()
    await window.locator('[data-testid="article-panel-tab-companion-anthropic"]').click()
    await window.evaluate(async mainKey => {
      const store = (window as any).useStore
      await store.getState().loadNotes()
      await store.getState().selectArticleCompanion('anthropic', mainKey, 'notes/other.md')
    }, articlePath)
    await expect(window.locator('[data-testid="article-companion-board"]')).toBeVisible()
    await expect(window.locator('[data-testid="note-ai-generate"]')).toHaveCount(0)

    await window.evaluate(async mainKey => {
      await (window as any).useStore.getState().selectArticleCompanion('anthropic', mainKey, 'notes/a.md')
    }, articlePath)
    await expect(window.locator('[data-testid="note-ai-generate"]')).toBeVisible()
    await window.locator('[data-testid="note-ai-generate"]').click()
    await expect(window.locator('[data-testid="note-ai-preview"]')).toBeVisible()
    await window.locator('[data-testid="note-ai-apply"]').click()
    await expect(window.locator('[data-testid="note-ai-preview"]')).toHaveCount(0)
    await expect(window.locator('[data-testid="anthropic-reader-title"]')).toHaveText('E2E AI Note')
    await expect(window.locator('[data-testid="article-companion-board"] .ProseMirror')).toContainText('我的关注点：概念边界。')
    await expect(window.locator('[data-testid="note-ai-generate"]')).toHaveCount(0)
    expect(fs.readFileSync(noteAbsolutePath, 'utf8').endsWith(ORIGINAL_CONTENT)).toBe(true)
  })

  test('整轮搜索失败与预览期间编辑都不会损坏原笔记', async () => {
    await openMainNote()
    const rawBefore = fs.readFileSync(noteAbsolutePath, 'utf8')
    failSearches = true
    await window.locator('[data-testid="note-ai-generate"]').click()
    await expect(window.locator('[data-testid="note-ai-generate"]')).toBeEnabled()
    expect(fs.readFileSync(noteAbsolutePath, 'utf8')).toBe(rawBefore)

    failSearches = false
    await window.locator('[data-testid="note-ai-generate"]').click()
    await expect(window.locator('[data-testid="note-ai-preview"]')).toBeVisible()
    fs.writeFileSync(noteAbsolutePath, `${rawBefore}\n预览期间的新编辑\n`, 'utf8')
    await window.locator('[data-testid="note-ai-apply"]').click()
    await expect(window.locator('[data-testid="note-ai-preview"]')).toHaveCount(0)
    expect(fs.readFileSync(noteAbsolutePath, 'utf8')).toBe(`${rawBefore}\n预览期间的新编辑\n`)
    await expect(window.locator('[data-testid="note-ai-generate"]')).toBeVisible()
  })
})
