import { test, expect } from '../fixtures/electron'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { CoverPage } from '../pages/CoverPage'
import { seedBook } from '../helpers/test-library'
import { DEMO_NOTES } from '../../src/lib/demo-notes'

/**
 * Demo 说明入口（`i` 按钮）：四个位置都存在、都能展开、都能关闭。
 * 覆盖用户的演示动线：书籍来源 → 章节（导读）→ 旁注 → 点亮灯火（复习/图表）。
 */
test.describe('@p1 demo notes', () => {
  test('书籍来源与章节：解析说明、导读说明、旁注说明', async ({ window, testLibraryPath }) => {
    seedBook(testLibraryPath, {
      title: 'E2E 说明之书',
      chapters: [{ title: '第一章 起', body: '## 第一节\n\n正文内容甲。' }],
    })

    const cover = new CoverPage(window)
    await cover.enterName('E2E 说明员')
    await cover.goToBriefing()
    await window.getByTestId('briefing-source-book').click()

    // 0. 书籍来源：列展开按钮左侧（列展开时可见）
    const bookInfo = window.getByTestId('demo-info-book-source')
    await expect(bookInfo).toBeVisible()
    await bookInfo.click()
    const bookNote = window.getByTestId('demo-note-popover-book-source')
    await expect(bookNote).toBeVisible()
    await expect(bookNote).toContainText('技术取舍')
    await expect(bookNote).toContainText('解析层迭代了三次')
    await expect(bookNote).toContainText('你现在看到的是什么')
    await window.getByTestId('demo-note-close').click()
    await expect(bookNote).toHaveCount(0)

    // 1. 导读：进入章节后，「导读」标题右侧（按书名定位，不依赖索引）
    const e2eBook = window.locator('[data-testid^="book-card-"]:has-text("E2E 说明之书")')
    await e2eBook.click()
    await window.getByTestId('chapter-row-0').click()
    await expect(window.getByTestId('book-chapter-body')).toContainText('正文内容甲')

    const guideInfo = window.getByTestId('demo-info-guide')
    await expect(guideInfo).toBeVisible()
    await guideInfo.click()
    const guideNote = window.getByTestId('demo-note-popover-guide')
    await expect(guideNote).toContainText('它怎么跑')
    await expect(guideNote).toContainText('导读不是摘要')
    await expect(guideNote).toBeVisible()

    // 层级回归：列滚动容器带 transform + overflow，弹层必须 portal 到 body
    // 且是视口内该位置上最顶层的元素，不能被列或其他面板遮住。
    const guideBox = (await guideNote.boundingBox())!
    expect(await window.evaluate(() => {
      const el = document.querySelector('[data-testid="demo-note-popover-guide"]')
      return el?.parentElement === document.body
    })).toBe(true)
    const topmost = await window.evaluate(({ points }) =>
      points.map(([x, y]) => {
        const el = document.elementFromPoint(x, y) as HTMLElement | null
        return !!el?.closest('[data-testid="demo-note-popover-guide"]')
      }),
      {
        points: [
          [guideBox.x + 12, guideBox.y + 12],
          [guideBox.x + guideBox.width / 2, guideBox.y + guideBox.height / 2],
          [guideBox.x + guideBox.width - 12, guideBox.y + guideBox.height - 12],
        ],
      }
    )
    expect(topmost).toEqual([true, true, true])
    // 完整落在视口内
    const viewport = await window.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight }))
    expect(guideBox.x).toBeGreaterThanOrEqual(0)
    expect(guideBox.y).toBeGreaterThanOrEqual(0)
    expect(guideBox.x + guideBox.width).toBeLessThanOrEqual(viewport.width)
    expect(guideBox.y + guideBox.height).toBeLessThanOrEqual(viewport.height)

    await guideNote.getByTestId('demo-note-close').click()

    // 2. 旁注：打开聊天窗后，关闭按钮左侧
    await window.getByTestId('article-assistant-tab').click()
    const annoInfo = window.getByTestId('demo-info-annotation')
    await expect(annoInfo).toBeVisible()
    await annoInfo.click()
    const annoNote = window.getByTestId('demo-note-popover-annotation')
    await expect(annoNote).toBeVisible()
    await expect(annoNote).toContainText('发送时，上下文由什么组成')
    await expect(annoNote).toContainText('输入行有三个开关')
    // Esc 关闭
    await window.keyboard.press('Escape')
    await expect(annoNote).toHaveCount(0)
  })

  test('点亮灯火：设置按钮左侧的复习/图表说明', async ({ window }) => {
    const cover = new CoverPage(window)
    // 「点亮灯火」= 点亮后进入的首页
    await cover.enterIfNeeded('E2E 说明员')
    await expect(window.getByTestId('home-settings-button')).toBeVisible({ timeout: 15_000 })

    const reviewInfo = window.getByTestId('demo-info-review')
    await expect(reviewInfo).toBeVisible()
    // 位置约束：在「设置」按钮左侧
    const infoBox = await reviewInfo.boundingBox()
    const settingsBox = await window.getByTestId('home-settings-button').boundingBox()
    expect(infoBox!.x + infoBox!.width).toBeLessThanOrEqual(settingsBox!.x + 1)

    await reviewInfo.click()
    const reviewNote = window.getByTestId('demo-note-popover-review')
    await expect(reviewNote).toBeVisible()
    await expect(reviewNote).toContainText('复习与学习图表')
    await expect(reviewNote).toContainText('SVG')

    // 定位回归：锚点是 display:contents 的 span（自身无盒子），弹层必须贴住按钮
    // 而不是被甩到左上角。右对齐锚点右缘，且位于其下方。
    const noteBox = (await reviewNote.boundingBox())!
    const anchorBox = (await reviewInfo.boundingBox())!
    // 右对齐锚点右缘；若被视口夹紧（面板比可用空间宽），改为要求整体落在视口内
    const viewportWidth = await window.evaluate(() => window.innerWidth)
    const rightAligned = Math.abs(noteBox.x + noteBox.width - (anchorBox.x + anchorBox.width)) <= 2
    const clampedInView = noteBox.x >= 0 && noteBox.x + noteBox.width <= viewportWidth
    expect(rightAligned || clampedInView).toBe(true)
    expect(noteBox.y).toBeGreaterThanOrEqual(anchorBox.y + anchorBox.height)

    await window.getByTestId('demo-note-close').click()
    await expect(reviewNote).toHaveCount(0)
  })

  test('双击进入编辑模式：改写落盘 state.json，reload 后仍在，可恢复默认', async ({
    window,
    testConfigDir,
  }) => {
    const cover = new CoverPage(window)
    await cover.enterIfNeeded('E2E 说明员')
    await expect(window.getByTestId('home-settings-button')).toBeVisible({ timeout: 15_000 })

    await window.getByTestId('demo-info-review').click()
    const reviewNote = window.getByTestId('demo-note-popover-review')
    await expect(reviewNote).toBeVisible()
    // 默认文案的唯一事实源是 src/lib/demo-notes.ts；这里读它，避免改文案就断测试。
    const defaultThesis = DEMO_NOTES.review.thesis

    // 双击弹层 → 出现编辑条，文本块变可编辑
    await reviewNote.dblclick({ position: { x: 12, y: 12 } })
    await expect(window.getByTestId('demo-note-edit-hint')).toBeVisible()
    await expect(window.getByTestId('demo-note-edit-thesis')).toHaveAttribute('contenteditable', 'true')

    const thesis = window.getByTestId('demo-note-edit-thesis')
    await thesis.fill('这是我在面试前改写的结论文案。')
    await thesis.blur()

    // 落盘：state.json 记录改写，且界面立即显示新文案
    await expect.poll(() => {
      const s = JSON.parse(fs.readFileSync(path.join(testConfigDir, 'state.json'), 'utf8'))
      return s.demoNoteOverrides?.review?.thesis
    }).toBe('这是我在面试前改写的结论文案。')
    await expect(reviewNote).toContainText('这是我在面试前改写的结论文案。')

    // reload 后仍生效
    await window.reload()
    const cover2 = new CoverPage(window)
    await cover2.enterIfNeeded()
    await expect(window.getByTestId('home-settings-button')).toBeVisible({ timeout: 15_000 })
    await window.getByTestId('demo-info-review').click()
    const reopened = window.getByTestId('demo-note-popover-review')
    await expect(reopened).toContainText('这是我在面试前改写的结论文案。')

    // 恢复默认 → 回到内置文案，state.json 清掉该条目
    await reopened.dblclick({ position: { x: 12, y: 12 } })
    await window.getByTestId('demo-note-reset').click()
    await expect(reopened).toContainText(defaultThesis)
    await expect.poll(() => {
      const s = JSON.parse(fs.readFileSync(path.join(testConfigDir, 'state.json'), 'utf8'))
      return s.demoNoteOverrides?.review ?? null
    }).toBeNull()
  })
})
