import { test, expect } from '../fixtures/electron'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { CoverPage } from '../pages/CoverPage'
import { ArticleAssistantPage } from '../pages/ArticleAssistantPage'
import { SELECTORS } from '../helpers/selectors'
import { seedBriefing } from '../helpers/test-library'
import type { Page } from '@playwright/test'

function localToday(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

async function openDigestArticle(window: Page, libPath: string): Promise<ArticleAssistantPage> {
  const today = localToday()
  seedBriefing(libPath, today)

  const cover = new CoverPage(window)
  await cover.enterIfNeeded('E2E 测试员')
  await cover.goToBriefing()

  await window.locator(SELECTORS.briefing.receiveDigestButton).click()
  await expect(window.locator(SELECTORS.briefing.academicLayout)).toBeVisible({ timeout: 15000 })

  const assistant = new ArticleAssistantPage(window)
  await assistant.waitForMounted()
  return assistant
}

function readLastRequest(configDir: string): any {
  const p = path.join(configDir, 'last-assistant-request.json')
  return JSON.parse(fs.readFileSync(p, 'utf8'))
}

async function sendAndWait(assistant: ArticleAssistantPage, q: string) {
  await assistant.typeQuestion(q)
  await assistant.send()
  await assistant.waitForAssistantReply()
}

test.describe('@p1 article assistant history', () => {
  test('二次打开文章时显示之前的旁注对话', async ({ window, testLibraryPath }) => {
    const assistant = await openDigestArticle(window, testLibraryPath)
    await assistant.openChat()
    await assistant.typeQuestion('What is Constitutional AI?')
    await assistant.send()
    await assistant.waitForAssistantReply()
    await expect(assistant.chatWindow).toContainText('E2E 测试的')

    // 重新加载渲染进程（state/session 走磁盘），重新进入文章
    await window.reload()
    const assistant2 = await openDigestArticle(window, testLibraryPath)
    await assistant2.openChat()

    // 历史消息应从磁盘恢复；使用宽松超时等待异步 loadAssistantSession 完成
    await expect(assistant2.chatWindow).toContainText('What is Constitutional AI?', { timeout: 15000 })
    await expect(assistant2.chatWindow).toContainText('E2E 测试的')
  })
})

test.describe('@p1 article assistant request contract', () => {
  test('默认：system 含苏格拉底提示词，thinking disabled 且无 reasoning_effort', async ({ window, testLibraryPath, testConfigDir }) => {
    const assistant = await openDigestArticle(window, testLibraryPath)
    await assistant.openChat()
    await sendAndWait(assistant, 'Q1')
    const req = readLastRequest(testConfigDir)
    expect(req.messages[0].role).toBe('system')
    expect(req.messages[0].content).toContain('苏格拉底')
    expect(req.thinking).toEqual({ type: 'disabled' })
    expect(req.reasoning_effort).toBeUndefined()
  })

  test('苏格拉底关：system 不含质询措辞、含直接回答', async ({ window, testLibraryPath, testConfigDir }) => {
    const assistant = await openDigestArticle(window, testLibraryPath)
    await assistant.openChat()
    await assistant.clickSocratic()
    await sendAndWait(assistant, 'Q1')
    const req = readLastRequest(testConfigDir)
    expect(req.messages[0].content).not.toContain('苏格拉底')
    expect(req.messages[0].content).toContain('直接')
  })

  test('深度思考 high/max 传对应 reasoning_effort', async ({ window, testLibraryPath, testConfigDir }) => {
    const assistant = await openDigestArticle(window, testLibraryPath)
    await assistant.openChat()
    await assistant.setThinkingEffort('high')
    await sendAndWait(assistant, 'Q1')
    let req = readLastRequest(testConfigDir)
    expect(req.thinking).toEqual({ type: 'enabled' })
    expect(req.reasoning_effort).toBe('high')

    await assistant.clickThinking() // high → max
    await sendAndWait(assistant, 'Q2')
    req = readLastRequest(testConfigDir)
    expect(req.reasoning_effort).toBe('max')
  })

  test('第二轮请求的历史对话段包含第一轮内容', async ({ window, testLibraryPath, testConfigDir }) => {
    const assistant = await openDigestArticle(window, testLibraryPath)
    await assistant.openChat()
    await sendAndWait(assistant, '第一问标记')
    await sendAndWait(assistant, '第二问')
    const req = readLastRequest(testConfigDir)
    expect(req.messages[1].content).toContain('历史对话')
    expect(req.messages[1].content).toContain('第一问标记')
  })

  test('搜索开：user prompt 含网络搜索结果段', async ({ window, testLibraryPath, testConfigDir }) => {
    const assistant = await openDigestArticle(window, testLibraryPath)
    await assistant.openChat()
    await assistant.clickSearch()
    await sendAndWait(assistant, 'Q1')
    const req = readLastRequest(testConfigDir)
    expect(req.messages[1].content).toContain('网络搜索结果')
    expect(req.messages[1].content).toContain('Constitutional AI（测试来源）')
  })

  test('preload 暴露 reasoningChunk 监听（IPC 契约探测）', async ({ window, testLibraryPath }) => {
    await openDigestArticle(window, testLibraryPath)
    const t = await window.evaluate(() => typeof (window as any).api?.onArticleAssistantReasoningChunk)
    expect(t).toBe('function')
  })
})

test.describe('@p1 article assistant controls UI', () => {
  test('三开关状态持久化：写入 state.json 且 reload 后保持', async ({ window, testLibraryPath, testConfigDir }) => {
    const assistant = await openDigestArticle(window, testLibraryPath)
    await assistant.openChat()
    await assistant.clickSearch()
    await assistant.clickSocratic() // 关
    await assistant.setThinkingEffort('max')

    await expect.poll(() => {
      const s = JSON.parse(fs.readFileSync(path.join(testConfigDir, 'state.json'), 'utf8'))
      return [s.assistantSearchEnabled, s.assistantSocraticMode, s.assistantThinkingEffort]
    }).toEqual([true, false, 'max'])

    await window.reload()
    const assistant2 = await openDigestArticle(window, testLibraryPath)
    await assistant2.openChat()
    await expect(assistant2.searchBtn).toHaveAttribute('aria-pressed', 'true')
    await expect(assistant2.socraticBtn).toHaveAttribute('aria-pressed', 'false')
    await expect(assistant2.thinkingBtn).toHaveCSS('color', 'rgb(56, 189, 248)')
  })

  test('取消选中按钮清除 pending selection', async ({ window, testLibraryPath }) => {
    const assistant = await openDigestArticle(window, testLibraryPath)
    await assistant.dragSelectFirstParagraph()
    await assistant.openChat()
    await expect(assistant.pendingSelection).toBeVisible()
    await assistant.cancelSelection()
    await expect(assistant.pendingSelection).toHaveCount(0)
  })

  test('选中块位于消息列表下方、输入框上方', async ({ window, testLibraryPath }) => {
    const assistant = await openDigestArticle(window, testLibraryPath)
    await assistant.openChat()
    await sendAndWait(assistant, 'Q1')
    await assistant.dragSelectFirstParagraph()
    await expect(assistant.pendingSelection).toBeVisible()
    const selBox = await assistant.pendingSelection.boundingBox()
    const msgBox = await assistant.chatMessages.last().boundingBox()
    const inputBox = await assistant.input.boundingBox()
    expect(selBox!.y).toBeGreaterThan(msgBox!.y)
    expect(selBox!.y).toBeLessThan(inputBox!.y)
  })

  test('开深度思考后显示可折叠思考区块', async ({ window, testLibraryPath }) => {
    const assistant = await openDigestArticle(window, testLibraryPath)
    await assistant.openChat()
    await assistant.setThinkingEffort('high')
    await sendAndWait(assistant, 'Q1')
    await expect(assistant.reasoningBlock).toBeVisible()
    await expect(assistant.reasoningBlock).toContainText('先梳理')
    // 流式完成后 details 默认折叠（open 属性移除）
    await expect(assistant.reasoningBlock).not.toHaveAttribute('open', '')
  })

  test('用户消息靠右、AI 消息靠左', async ({ window, testLibraryPath }) => {
    const assistant = await openDigestArticle(window, testLibraryPath)
    await assistant.openChat()
    await sendAndWait(assistant, 'Q1')
    const user = assistant.chatMessages.filter({ hasText: 'Q1' }).first()
    const ai = assistant.chatMessages.filter({ hasText: 'E2E 测试的' }).first()
    await expect(user).toHaveClass(/justify-end/)
    await expect(ai).toHaveClass(/justify-start/)
  })

  test('历史选段与当前选中颜色不同', async ({ window, testLibraryPath }) => {
    const assistant = await openDigestArticle(window, testLibraryPath)
    await assistant.openChat()
    await assistant.dragSelectFirstParagraph()
    await sendAndWait(assistant, 'Q1')

    // 历史选段（米灰）已随消息渲染
    const historical = window.locator(SELECTORS.articleAssistant.chatMessageSelection).first()
    await expect(historical).toBeVisible()
    const historicalColor = await historical.evaluate((el) => getComputedStyle(el).borderLeftColor)

    // 当前选中（橙）
    await assistant.dragSelectFirstParagraph()
    await expect(assistant.pendingSelection).toBeVisible()
    const pendingColor = await assistant.pendingSelection.evaluate((el) => getComputedStyle(el).borderLeftColor)

    expect(pendingColor).not.toBe(historicalColor)
    expect(pendingColor).toBe('rgb(217, 119, 87)') // ember #d97757
  })
})

test.describe('@p1 annotation context injection', () => {
	test('标注注入上下文：创建标注后聊天请求含标注内容', async ({ window, testLibraryPath, testConfigDir }) => {
		const today = localToday()
		const assistant = await openDigestArticle(window, testLibraryPath)

		// Write annotation file directly to disk
		const briefingDir = path.join(testLibraryPath, '夜航简报')
		const annoPath = path.join(briefingDir, `夜航简报-${today}.annotations.md`)
		const annoContent = `---
title: Article Annotations
type: article-assistant
parent_path: 夜航简报/夜航简报-${today}.md
---

## a1

**选中文字：** 测试选段文字
**备注：** E2E测试标注内容-唯一标识
**段落：** §1
**创建：** 2026-07-22
**更新：** 2026-07-22

---
`
		fs.mkdirSync(briefingDir, { recursive: true })
		fs.writeFileSync(annoPath, annoContent, 'utf8')

		await assistant.openChat()
		await sendAndWait(assistant, '讨论标注')

		const requestPath = path.join(testConfigDir, 'last-assistant-request.json')
		expect(fs.existsSync(requestPath)).toBe(true)
		const req = JSON.parse(fs.readFileSync(requestPath, 'utf8'))
		const userContent = req.messages[1]?.content ?? ''
		expect(userContent).toContain('用户对文章的标注')
		expect(userContent).toContain('E2E测试标注内容-唯一标识')
	})
})

test.describe('@p1 selection lifecycle', () => {
  test('选段 chip 发送后清除，第二条消息不再携带旧选段', async ({ window, testLibraryPath, testConfigDir }) => {
    const assistant = await openDigestArticle(window, testLibraryPath)
    await assistant.openChat()
    // E2E only：store 后门注入选段（真实鼠标选段路径由「取消选段」用例覆盖）
    await window.evaluate(() => {
      ;(window as any).useStore.getState().setAssistantSelection('E2E选段标记-唯一')
    })
    await expect(assistant.pendingSelection).toBeVisible()
    await sendAndWait(assistant, 'Q1')
    await expect(assistant.pendingSelection).toHaveCount(0)
    let req = readLastRequest(testConfigDir)
    expect(req.messages[1].content).toContain('E2E选段标记-唯一')

    await sendAndWait(assistant, 'Q2')
    req = readLastRequest(testConfigDir)
    expect(req.messages[1].content).not.toContain('E2E选段标记-唯一')
  })

  test('聊天窗内选中文字不产生文章选段 chip', async ({ window, testLibraryPath }) => {
    const assistant = await openDigestArticle(window, testLibraryPath)
    await assistant.openChat()
    await sendAndWait(assistant, '先产生一条回复')

    // 在聊天窗消息文本上拖选
    const msg = assistant.chatMessages.first()
    const box = await msg.boundingBox()
    if (!box) throw new Error('no chat message to select')
    await window.mouse.move(box.x + 5, box.y + box.height / 2)
    await window.mouse.down()
    await window.mouse.move(box.x + Math.min(120, box.width - 10), box.y + box.height / 2, { steps: 8 })
    await window.mouse.up()
    await window.waitForTimeout(300)

    await expect(assistant.pendingSelection).toHaveCount(0)
  })
})

test.describe('@p1 search error visibility', () => {
  test('搜索失败提示条可见且可关闭', async ({ window, testLibraryPath }) => {
    const assistant = await openDigestArticle(window, testLibraryPath)
    await assistant.openChat()
    await sendAndWait(assistant, 'Q1')
    await window.evaluate(() => {
      const store = (window as any).useStore; const s = store.getState().assistantSession
      store.setState({ assistantSession: { ...s, searchError: 'SEARCH_ERROR' } })
    })
    const banner = window.locator(SELECTORS.articleAssistant.searchErrorBanner)
    await expect(banner).toBeVisible()
    await expect(banner).toContainText('未联网')
    await window.locator('[data-testid="assistant-search-error-dismiss"]').click()
    await expect(banner).toHaveCount(0)
  })
})
