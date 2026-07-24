import { test, expect } from '../fixtures/electron'
import { CoverPage } from '../pages/CoverPage'
import { SELECTORS } from '../helpers/selectors'
import { seedBriefing } from '../helpers/test-library'
import * as fs from 'node:fs'
import * as path from 'node:path'

function localToday(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Simulate a text selection on a <p> element inside the article body.
 * Selects `length` characters starting at `startOffset` within the first
 * text node of the first <p>, sets window.getSelection(), and dispatches
 * a mouseup event on the paragraph to trigger the ArticleAnnotations
 * selection handler.
 */
async function selectTextInArticle(
  window: any,
  startOffset: number,
  length: number,
) {
  // Use the E2E helper exposed by ArticleAnnotations to reliably trigger the ghost pen.
  // The synthetic dispatchEvent approach is unreliable because the component defers
  // reading window.getSelection() via requestAnimationFrame + setTimeout(0) inside
  // a native mouseup handler.
  await window.evaluate(
    ({ start, len }: { start: number; len: number }) => {
      const article = document.querySelector('[data-testid="anthropic-reader-article"]')
      if (!article) throw new Error('article element not found')
      const p = article.querySelector('p')
      if (!p) throw new Error('no <p> in article')
      const helper = (window as any).__e2e_triggerGhostPen as
        | ((paraEl: Element, start: number, end: number) => void)
        | undefined
      if (!helper) throw new Error('__e2e_triggerGhostPen not found — is ArticleAnnotations mounted?')
      helper(p, start, start + len)
    },
    { start: startOffset, len: length },
  )
}

test.describe('文章标注 (Article Annotations)', () => {
  test('E2E-A1: 完整标注生命周期 — 创建、保存、持久化、编辑、删除', async ({
    window,
    testLibraryPath,
  }) => {
    const cover = new CoverPage(window)
    await cover.enterName('E2E 测试员')
    await cover.goToBriefing()
    await expect(window.locator(SELECTORS.briefing.page)).toBeVisible()

    // --- 第一步：导入一篇 Anthropic 文章 ---
    await window.locator(SELECTORS.briefing.sourceAnthropicButton).click()
    const listColumn = window.locator(SELECTORS.briefing.listColumn)
    await expect(listColumn).toBeVisible()

    // 处理新文章检测提示
    const prompt = window.locator(SELECTORS.briefing.anthropicNewArticlesPrompt)
    await prompt.waitFor({ timeout: 120000 }).catch(() => {})
    const promptVisible = await prompt.isVisible().catch(() => false)
    if (promptVisible) await prompt.click()

    const rows = window.locator(SELECTORS.briefing.anthropicArticleRow)
    await rows.first().waitFor({ timeout: 120000 })

    // 点击第一篇未保存文章触发导入
    const firstRow = rows.first()
    const articleTitle = await firstRow.locator(SELECTORS.briefing.anthropicArticleTitle).textContent()
    expect(articleTitle).toBeTruthy()
    await firstRow.click()

    // 等待阅读器加载
    const reader = window.locator(SELECTORS.briefing.anthropicArticleReader)
    await reader.waitFor({ state: 'visible', timeout: 120000 })
    const readerTitle = await window.locator(SELECTORS.briefing.anthropicReaderTitle).textContent()
    expect(readerTitle).toBeTruthy()

    // --- 第二步：选中正文文本，触发幽灵笔 ---
    // 等待文章正文渲染（article > p 存在）
    await window.locator('article p').first().waitFor({ state: 'visible', timeout: 15000 })

    // 获取文章正文前几个字，用于后续验证
    const selectedText = await window.evaluate(() => {
      const p = document.querySelector('article p')
      return p?.textContent?.slice(0, 15) ?? ''
    })
    expect(selectedText.length).toBeGreaterThanOrEqual(2)

    // 模拟选中前 15 个字符
    await selectTextInArticle(window, 0, 15)

    // 幽灵笔应出现
    const ghostPen = window.locator(SELECTORS.annotations.ghostPen)
    await expect(ghostPen).toBeVisible({ timeout: 5000 })

    // 位置校验：幽灵笔应紧邻选区末尾（回归：坐标系错位会让它渲染到 header 上方）
    const penBox = await ghostPen.boundingBox()
    const selEnd = await window.evaluate(() => {
      const sel = window.getSelection()!
      const range = sel.getRangeAt(0).cloneRange()
      range.collapse(false)
      const r = range.getBoundingClientRect()
      return { x: r.right, y: r.top }
    })
    expect(penBox).not.toBeNull()
    console.log(`[anno-position] pen y=${penBox!.y} selEnd y=${selEnd.y} delta=${Math.abs(penBox!.y - selEnd.y)}`)
    expect(Math.abs(penBox!.y - selEnd.y)).toBeLessThan(50)

    // 高亮 overlay 应覆盖在选中段落上
    const highlight = window.locator(SELECTORS.annotations.selectionHighlight).first()
    await expect(highlight).toBeVisible()
    const hlBox = await highlight.boundingBox()
    const paraBox = await window.locator('article p').first().boundingBox()
    console.log(`[anno-position] highlight y=${hlBox!.y} para y=${paraBox!.y} delta=${Math.abs(hlBox!.y - paraBox!.y)}`)
    expect(Math.abs(hlBox!.y - paraBox!.y)).toBeLessThan(60)

    // --- 第 2.5 步：高亮消隐 — 点击正文他处，高亮与幽灵笔应一并消失 ---
    // （高亮驻留已由上方断言覆盖：mouseup 之后、点击他处之前高亮持续可见）
    await window.locator('article p').last().click()
    await expect(window.locator(SELECTORS.annotations.selectionHighlight)).toHaveCount(0)
    await expect(ghostPen).toBeHidden()

    // 重新触发同一选区，恢复原有流程（后续步骤保持不变）
    await selectTextInArticle(window, 0, 15)
    await expect(ghostPen).toBeVisible({ timeout: 5000 })
    await expect(highlight).toBeVisible()

    // --- 第三步：点击幽灵笔，打开备注卡片 ---
    await ghostPen.click({ force: true })

    // 备注卡片应出现
    const noteCard = window.locator(SELECTORS.annotations.noteCard)
    await expect(noteCard).toBeVisible({ timeout: 5000 })

    // 文本框应获得焦点
    const textarea = window.locator(SELECTORS.annotations.noteTextarea)
    await expect(textarea).toBeVisible()

    // --- 第四步：输入备注并保存 ---
    const noteText = '这是一条E2E测试备注——波兰尼默会知识。'
    await textarea.fill(noteText)
    // Use E2E save helper — bypasses DOM event system for reliable save
    await window.evaluate(() => (window as any).__e2e_saveAnnotation())

    // 卡片应关闭
    await expect(noteCard).toBeHidden({ timeout: 5000 })

    // 标注标记笔应出现在正文中
    const markerPen = window.locator(SELECTORS.annotations.markerPen).first()
    await expect(markerPen).toBeVisible({ timeout: 5000 })

    // 被标注文字应有高亮底色
    const markedText = window.locator(SELECTORS.annotations.markedText).first()
    await expect(markedText).toBeVisible()

    // --- 第五步：验证标注文件写入磁盘（poll 因为 IPC 异步写盘） ---
    const anthropicDir = path.join(testLibraryPath, 'Anthropic博客')
    await expect.poll(() => fs.existsSync(anthropicDir)).toBe(true)

    // 等待 .annotations.md 文件出现并包含备注内容
    let annoPath = ''
    await expect
      .poll(() => {
        const files = fs.readdirSync(anthropicDir, { recursive: true } as any).filter((f: string) =>
          f.endsWith('.annotations.md'),
        )
        if (files.length === 0) return ''
        annoPath = path.join(anthropicDir, files[0] as string)
        return fs.readFileSync(annoPath, 'utf8')
      })
      .toContain(noteText)

    // --- 第六步：重新打开同一篇文章，验证标注持久化 ---
    // 切换来源以关闭阅读器
    await window.locator(SELECTORS.briefing.sourceDigestButton).click()
    await window.waitForTimeout(1000)
    await window.locator(SELECTORS.briefing.sourceAnthropicButton).click()
    await expect(listColumn).toBeVisible()

    // 等待列表重新出现
    const savedRows = window.locator(SELECTORS.briefing.anthropicArticleRow)
    await savedRows.first().waitFor({ timeout: 30000 })

    // 点击已保存的文章（带 saved testid 的第一篇）
    const savedRow = savedRows
      .filter({ has: window.locator(SELECTORS.briefing.anthropicArticleSaved) })
      .first()
    await expect(savedRow).toBeVisible({ timeout: 10000 })
    await savedRow.click()

    // 阅读器重新打开
    await reader.waitFor({ state: 'visible', timeout: 30000 })
    await window.locator('article p').first().waitFor({ state: 'visible', timeout: 15000 })

    // 标注标记应仍然存在（持久化验证）
    const persistedMarker = window.locator(SELECTORS.annotations.markerPen).first()
    await expect(persistedMarker).toBeVisible({ timeout: 10000 })

    // --- 第七步：点击标注笔，编辑备注 ---
    await persistedMarker.click({ force: true })

    const reopenedCard = window.locator(SELECTORS.annotations.noteCard)
    await expect(reopenedCard).toBeVisible({ timeout: 5000 })

    const reopenedTextarea = window.locator(SELECTORS.annotations.noteTextarea)
    await expect(reopenedTextarea).toBeVisible()
    // 之前的备注内容应保留
    await expect(reopenedTextarea).toHaveValue(noteText)

    // 编辑备注
    const updatedNote = '更新后的E2E测试备注。'
    await reopenedTextarea.fill(updatedNote)
    await window.evaluate(() => (window as any).__e2e_saveAnnotation())
    await expect(reopenedCard).toBeHidden({ timeout: 5000 })

    // --- 第八步：删除标注 ---
    // 再次点击标记笔打开卡片
    await persistedMarker.click({ force: true })
    await expect(window.locator(SELECTORS.annotations.noteCard)).toBeVisible({ timeout: 5000 })

    // 使用 E2E helper 删除标注 — 绕过 DOM 事件系统的干扰
    await window.evaluate(() => (window as any).__e2e_deleteAnnotation())

    // 卡片关闭，标记笔从 DOM 中移除
    await expect(window.locator(SELECTORS.annotations.noteCard)).toBeHidden({ timeout: 5000 })
    await expect(persistedMarker).toBeHidden({ timeout: 5000 })

    // 标注文件应更新（不含原备注内容，poll 因为 IPC 异步写盘）
    await expect
      .poll(() => {
        if (!fs.existsSync(annoPath)) return ''
        return fs.readFileSync(annoPath, 'utf8')
      })
      .not.toContain(noteText)
  })

  test('E2E-A4: digest 简报划线标注', async ({ window, testLibraryPath }) => {
    const today = localToday()
    const { seedBriefing } = await import('../helpers/test-library')
    seedBriefing(testLibraryPath, today)

    const cover = new CoverPage(window)
    await cover.enterName('E2E 测试员')
    await cover.goToBriefing()
    await window.locator(SELECTORS.briefing.receiveDigestButton).click()
    await expect(window.locator(SELECTORS.briefing.academicLayout)).toBeVisible({ timeout: 15000 })

    // Wait for article body
    await window.locator('[data-testid="briefing-markdown-body"]').waitFor({ state: 'visible', timeout: 15000 })

    // Wait for ArticleAnnotations to mount and register the E2E helper
    await window.waitForFunction(() => (window as any).__e2e_triggerGhostPen != null, null, { timeout: 10000 })

    // Use E2E helper to trigger ghost pen on first paragraph
    await window.evaluate(() => {
      const body = document.querySelector('[data-testid="briefing-markdown-body"]')
      const p = body?.querySelector('p')
      if (!p || !p.textContent) throw new Error('no paragraph')
      const helper = (window as any).__e2e_triggerGhostPen as
        | ((paraEl: Element, start: number, end: number) => void)
        | undefined
      if (!helper) throw new Error('__e2e_triggerGhostPen not found')
      helper(p, 0, Math.min(15, p.textContent.length))
    })

    const ghostPen = window.locator(SELECTORS.annotations.ghostPen)
    await expect(ghostPen).toBeVisible({ timeout: 5000 })

    await ghostPen.click({ force: true })
    await expect(window.locator(SELECTORS.annotations.noteCard)).toBeVisible({ timeout: 5000 })

    const noteText = 'Digest标注E2E'
    await window.locator(SELECTORS.annotations.noteTextarea).fill(noteText)
    await window.evaluate(() => (window as any).__e2e_saveAnnotation())
    await expect(window.locator(SELECTORS.annotations.noteCard)).toBeHidden({ timeout: 5000 })

    // Verify marker and file
    await expect(window.locator(SELECTORS.annotations.markerPen).first()).toBeVisible({ timeout: 5000 })
    const briefingDir = path.join(testLibraryPath, '夜航简报')
    await expect.poll(() => {
      const files = fs.readdirSync(briefingDir).filter((f: string) => f.endsWith('.annotations.md'))
      if (files.length === 0) return ''
      return fs.readFileSync(path.join(briefingDir, files[0] as string), 'utf8')
    }).toContain(noteText)
  })
})

test.describe('真实选区交互', () => {
  test('E2E-A3: 创建选区后幽灵笔与高亮出现并可解散', async ({ window }) => {
    const cover = new CoverPage(window)
    await cover.enterName('E2E 测试员')
    await cover.goToBriefing()
    await expect(window.locator(SELECTORS.briefing.page)).toBeVisible()

    await window.locator(SELECTORS.briefing.sourceAnthropicButton).click()
    const prompt = window.locator(SELECTORS.briefing.anthropicNewArticlesPrompt)
    await prompt.waitFor({ timeout: 120000 }).catch(() => {})
    const promptVisible = await prompt.isVisible().catch(() => false)
    if (promptVisible) await prompt.click()

    const rows = window.locator(SELECTORS.briefing.anthropicArticleRow)
    await rows.first().waitFor({ timeout: 120000 })
    await rows.first().click()

    const reader = window.locator(SELECTORS.briefing.anthropicArticleReader)
    await reader.waitFor({ state: 'visible', timeout: 120000 })

    const p = window.locator('article p').first()
    await p.waitFor({ state: 'visible', timeout: 15000 })

    // Electron/Playwright drag/triple-click text selection is unreliable in the
    // E2E environment, so we create the range via the renderer and dispatch a
    // real mouseup to exercise the production handleMouseUp handler.
    await window.evaluate(() => {
      const article = document.querySelector('[data-testid="anthropic-reader-article"]')
      const p = article?.querySelector('p')
      if (!p) throw new Error('no paragraph')
      const firstText = Array.from(p.childNodes).find(
        (n): n is Text => n.nodeType === Node.TEXT_NODE && (n.textContent?.length ?? 0) > 0,
      )
      if (!firstText) throw new Error('no text node')
      const range = document.createRange()
      range.setStart(firstText, 0)
      range.setEnd(firstText, 15)
      const sel = window.getSelection()
      sel?.removeAllRanges()
      sel?.addRange(range)
      p.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }))
    })

    const ghostPen = window.locator(SELECTORS.annotations.ghostPen)
    await expect(ghostPen).toBeVisible({ timeout: 5000 })

    const highlight = window.locator(SELECTORS.annotations.selectionHighlight).first()
    await expect(highlight).toBeVisible({ timeout: 3000 })

    // Clicking outside the highlight/ghost pen dismisses both
    const lastP = window.locator('article p').last()
    await lastP.click()
    await expect(window.locator(SELECTORS.annotations.selectionHighlight)).toHaveCount(0)
    await expect(ghostPen).toBeHidden()
  })
})

test('E2E-A6: 标注跨 renderer reload 恢复', async ({ window, testLibraryPath }) => {
  const today = localToday()
  seedBriefing(testLibraryPath, today)

  const openDigest = async () => {
    const cover = new CoverPage(window)
    // enterName（不点击进入按钮）停留在封面，goToBriefing 的封面简报按钮才可见。
    // 该路径不写 profile.name，因此 reload 后封面仍是无名变体，同一序列可复用。
    await cover.enterName('E2E 测试员')
    await cover.goToBriefing()
    await window.locator(SELECTORS.briefing.receiveDigestButton).click()
    await expect(window.locator(SELECTORS.briefing.academicLayout)).toBeVisible({ timeout: 15000 })
    await window.locator(SELECTORS.briefing.markdownBody).waitFor({ state: 'visible', timeout: 15000 })
  }

  await openDigest()
  await window.evaluate(() => {
    const body = document.querySelector('[data-testid="briefing-markdown-body"]')
    const p = body?.querySelector('p')
    if (!p || !p.textContent) throw new Error('no paragraph')
    const helper = (window as any).__e2e_triggerGhostPen as | ((paraEl: Element, start: number, end: number) => void) | undefined
    if (!helper) throw new Error('__e2e_triggerGhostPen not found')
    helper(p, 0, Math.min(15, p.textContent.length))
  })
  await expect(window.locator(SELECTORS.annotations.ghostPen)).toBeVisible({ timeout: 5000 })
  await window.locator(SELECTORS.annotations.ghostPen).click({ force: true })
  await expect(window.locator(SELECTORS.annotations.noteCard)).toBeVisible({ timeout: 5000 })
  await window.locator(SELECTORS.annotations.noteTextarea).fill('跨重启标注-唯一标识')
  await window.evaluate(() => (window as any).__e2e_saveAnnotation())
  await expect(window.locator(SELECTORS.annotations.markerPen).first()).toBeVisible({ timeout: 5000 })

  await window.reload()
  await openDigest()
  await expect(window.locator(SELECTORS.annotations.markerPen).first()).toBeVisible({ timeout: 15000 })
})
