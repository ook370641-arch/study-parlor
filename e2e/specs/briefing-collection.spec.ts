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
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// 自定义 seed：两个 heading 与 E2E mock guide 的两个 chunk 对齐
const SEED_CONTENT = `## AI Safety
宪法式 AI 用书面原则约束模型行为，减少人工标注。

## Training Data
训练数据的去重与过滤决定模型质量。

## 原始来源
### Anthropic
- [post](https://anthropic.com/engineering/1)`

async function openDigest(window: Page, libPath: string): Promise<ArticleAssistantPage> {
  seedBriefing(libPath, localToday(), SEED_CONTENT)
  const cover = new CoverPage(window)
  await cover.enterName('E2E 测试员')
  await cover.goToBriefing()
  await window.locator(SELECTORS.briefing.receiveDigestButton).click()
  await expect(window.locator(SELECTORS.briefing.academicLayout)).toBeVisible({ timeout: 15000 })
  const assistant = new ArticleAssistantPage(window)
  await assistant.waitForMounted()
  return assistant
}

/** E2E only（e2e §8）：store 后门注入选段。真实路径由 article-annotations.spec.ts 的 ghost pen UI 选字用例覆盖。 */
async function injectSelection(window: Page, text: string): Promise<void> {
  await window.evaluate((t) => {
    ;(window as unknown as { useStore: { getState: () => { setAssistantSelection: (s: string) => void } } })
      .useStore.getState().setAssistantSelection(t)
  }, text)
}

async function askAndWait(assistant: ArticleAssistantPage, question: string): Promise<void> {
  await assistant.typeQuestion(question)
  await assistant.send()
  await assistant.waitForAssistantReply()
}

test.describe('@p1 briefing collection', () => {
  test('完整生命周期：收藏 → 追加 → 归属切换 → abort 不追加 → 移除 → 重启持久化 → 源删除保留', async ({ window, testLibraryPath }) => {
    const assistant = await openDigest(window, testLibraryPath)

    // 1. 日期列有精选集置顶入口（UI 出口断言，feature-development §12）
    await expect(window.getByTestId('briefing-collection-entry')).toBeVisible()
    await expect(window.getByTestId('briefing-font-size-increase')).toBeVisible()

    // 2. 导读生成后铭牌按钮出现（等 mock guide 到达）
    await expect(window.getByTestId('chunk-collect-button-0')).toBeVisible({ timeout: 15000 })

    // 3. 拖拽选段提问（chunk 0）
    await assistant.openChat()
    await injectSelection(window, '宪法式 AI')
    await askAndWait(assistant, '这是什么')

    // 4. 收藏 chunk 0 → 按钮变已收藏禁用
    await window.getByTestId('chunk-collect-button-0').click()
    await expect(window.getByTestId('chunk-collect-button-0')).toHaveText('★ 已收藏')
    await expect(window.getByTestId('chunk-collect-button-0')).toBeDisabled()

    // 5. 打开精选集 → 条目三段齐全
    await window.getByTestId('briefing-collection-entry').click()
    await expect(window.getByTestId('collection-view')).toBeVisible()
    const entryCard = window.locator('[data-testid^="collection-entry-"]').first()
    await expect(entryCard).toContainText('宪法式 AI 用书面原则约束模型行为')
    await expect(entryCard).toContainText('本段介绍 Constitutional AI')
    await expect(entryCard).toContainText('这是什么')

    // 6. 回简报追问（无新选段）→ 完整回答后追加进原条目（向前填充）
    await window.getByTestId(`briefing-date-item-${localToday()}`).click()
    await expect(window.locator(SELECTORS.briefing.academicLayout)).toBeVisible()
    await assistant.openChat()
    await askAndWait(assistant, '追问不带选段')
    await window.getByTestId('briefing-collection-entry').click()
    await expect(entryCard).toContainText('追问不带选段')

    // 7. 带新选段聊 chunk 1 → 收藏 chunk 1 → 归属切换
    await window.getByTestId(`briefing-date-item-${localToday()}`).click()
    await assistant.openChat()
    await injectSelection(window, '去重与过滤')
    await askAndWait(assistant, '这句什么意思')
    await window.getByTestId('chunk-collect-button-1').click()
    await window.getByTestId('briefing-collection-entry').click()
    const cards = window.locator('[data-testid^="collection-entry-"]')
    await expect(cards).toHaveCount(2)
    await expect(cards.nth(0)).toContainText('Training Data') // 新收藏在前
    await expect(cards.nth(0)).toContainText('这句什么意思')
    await expect(cards.nth(1)).not.toContainText('这句什么意思')

    // 8. abort 半截回答 → 不追加
    await window.getByTestId(`briefing-date-item-${localToday()}`).click()
    await assistant.openChat()
    await assistant.typeQuestion('会被打断的问题')
    await assistant.send()
    await assistant.abort() // POM 新增方法：点击 ChatWindow 已有的 `article-assistant-stop-btn`（ChatWindow.tsx:253，streaming 时替换发送按钮）
    await window.getByTestId('briefing-collection-entry').click()
    await expect(cards.nth(0)).not.toContainText('会被打断的问题')

    // 9. 移除条目 → 回简报按钮恢复可点
    const secondId = await cards.nth(1).getAttribute('data-testid') // collection-entry-<id>
    const entryId = secondId!.replace('collection-entry-', '')
    await window.getByTestId(`collection-remove-${entryId}`).click()
    await window.getByTestId('confirm-dialog-confirm').click()
    await expect(window.locator('[data-testid^="collection-entry-"]')).toHaveCount(1)
    await window.getByTestId(`briefing-date-item-${localToday()}`).click()
    await expect(window.getByTestId('chunk-collect-button-0')).toBeEnabled()

    // 10. 重启 → 精选集仍在
    await window.reload()
    const cover2 = new CoverPage(window)
    await cover2.goToBriefing()

    // 确保日期列已渲染（精选集入口始终在今日上方）
    await expect(window.getByTestId('briefing-collection-entry')).toBeVisible({ timeout: 15000 })

    // 10a. 重启后直接打开简报 → 已收藏块的按钮为 ★ 已收藏禁用
    await window.getByTestId(`briefing-date-item-${localToday()}`).click()
    await expect(window.getByTestId('chunk-collect-button-0')).toContainText('已收藏')
    await expect(window.getByTestId('chunk-collect-button-0')).toBeDisabled()

    await window.getByTestId('briefing-collection-entry').click()
    await expect(window.locator('[data-testid^="collection-entry-"]')).toHaveCount(1)

    // 11. 删除该日简报 → 条目仍完整可读
    fs.rmSync(path.join(testLibraryPath, '夜航简报', `夜航简报-${localToday()}.md`))
    await expect(window.locator('[data-testid^="collection-entry-"]')).toHaveCount(1)
    await expect(window.locator('[data-testid^="collection-entry-"]').first()).toContainText('训练数据的去重与过滤')
  })
})
