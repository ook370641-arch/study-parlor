import { test, expect } from '../fixtures/electron'
import { CoverPage } from '../pages/CoverPage'
import { seedBook, seedWritingTree } from '../helpers/test-library'

test.describe('书籍来源', () => {
  test('书架 → 章节 → 导读生成', async ({ window, testLibraryPath }) => {
    seedBook(testLibraryPath, {
      title: 'E2E 测试之书',
      chapters: [
        { title: '第一章 起', body: '## 第一节\n\n正文内容甲。' },
        { title: '第二章 承', body: '## 第二节\n\n正文内容乙。' },
      ],
    })

    const cover = new CoverPage(window)
    await cover.enterName('E2E 测试员')
    await cover.goToBriefing()

    await window.getByTestId('briefing-source-book').click()
    await expect(window.getByTestId('book-card-0')).toContainText('E2E 测试之书')
    await window.getByTestId('book-card-0').click()
    await expect(window.getByTestId('chapter-row-0')).toBeVisible()

    await window.getByTestId('chapter-row-0').click()
    await expect(window.getByTestId('book-chapter-body')).toContainText('正文内容甲')
    await expect(window.getByTestId('article-panel-tab-guide-book')).toBeVisible()
    await expect(window.getByTestId('guide-progress')).toBeVisible()
    // 导读进度可视化：SVG 罗盘随阶段挂载（planning → searching → writing）
    await expect(window.getByTestId('guide-compass')).toBeVisible()

    // 折叠列表列：内容整体卸载，不挤在 56px 窄栏里
    const bookColumn = window.getByTestId('briefing-list-column').first()
    await bookColumn.getByTestId('briefing-list-column-toggle').click()
    await expect(window.getByTestId('book-list-column')).toHaveCount(0)
    await bookColumn.getByTestId('briefing-list-column-toggle').click()
    await expect(window.getByTestId('book-list-column')).toBeVisible()

    // 章节切换：正文与阅读位置跟随所选章节
    await window.getByTestId('chapter-row-1').click()
    await expect(window.getByTestId('book-chapter-body')).toContainText('正文内容乙')
    await window.getByTestId('chapter-row-0').click()
    await expect(window.getByTestId('book-chapter-body')).toContainText('正文内容甲')
    // 切换章节后导读侧栏仍挂载；本章导读（或缓存）随后可用
    await expect(window.getByTestId('article-panel-tab-guide-book')).toBeVisible()
    // 全书导读为懒生成，生成完成后回填书卡
    await expect(window.getByTestId('book-card-0')).toContainText('E2E mock 全书导读', { timeout: 20_000 })
    await window.getByTestId('guide-chunk').first().waitFor({ timeout: 20_000 })
  })

  test('章节正文使用宽阅读栏并支持字号调整', async ({ window, testLibraryPath }) => {
    seedBook(testLibraryPath, {
      title: 'E2E 宽栏之书',
      chapters: [{ title: '第一章 起', body: '## 第一节\n\n宽栏正文。' }],
    })

    const cover = new CoverPage(window)
    await cover.enterName('E2E 测试员')
    await cover.goToBriefing()

    await window.getByTestId('briefing-source-book').click()
    await window.getByTestId('book-card-0').click()
    await window.getByTestId('chapter-row-0').click()
    await expect(window.getByTestId('book-chapter-body')).toContainText('宽栏正文')

    const contentColumn = window.getByTestId('book-chapter-body').locator('..')
    await expect.poll(() => contentColumn.evaluate((el) => getComputedStyle(el).maxWidth)).toBe('none')

    const body = window.getByTestId('book-chapter-body').locator('.md-body')
    const initialFontSize = await body.evaluate((el) => getComputedStyle(el).fontSize)
    await window.getByTestId('book-font-size-increase').click()
    await expect.poll(() => body.evaluate((el) => getComputedStyle(el).fontSize)).not.toBe(initialFontSize)
    await window.getByTestId('book-font-size-decrease').click()
    await expect.poll(() => body.evaluate((el) => getComputedStyle(el).fontSize)).toBe(initialFontSize)
  })

  test('章节对照：对照 tab → 来源栏写作 → 挑一篇文章进对照槽', async ({ window, testLibraryPath }) => {
    seedBook(testLibraryPath, {
      title: 'E2E 对照之书',
      chapters: [{ title: '第一章 起', body: '## 第一节\n\n对照正文。' }],
    })
    seedWritingTree(testLibraryPath)

    const cover = new CoverPage(window)
    await cover.enterName('E2E 测试员')
    await cover.goToBriefing()

    await window.getByTestId('briefing-source-book').click()
    await window.getByTestId('book-card-0').click()
    await window.getByTestId('chapter-row-0').click()
    await expect(window.getByTestId('book-chapter-body')).toContainText('对照正文')

    await window.getByTestId('article-panel-tab-companion-book').click()
    // 对照 tab 下点来源栏「写作」= 左栏换挑选器（不跳转到写作页）
    await window.getByTestId('briefing-source-writing').click()
    await expect(window.getByTestId('companion-writing-picker')).toBeVisible()
    await window.locator('[data-testid="writing-tree-node"]', { hasText: '七月夜话' }).first().click()

    await expect(window.getByTestId('article-companion-board')).toBeVisible()
    await expect(window.getByTestId('article-companion-board')).toContainText('七月夜话.md')
  })

  test('章节对照：挑选器为本章新建笔记，并直接放入对照槽', async ({ window, testLibraryPath }) => {
    seedBook(testLibraryPath, {
      title: 'E2E 新笔记之书',
      chapters: [{ title: '第一章 起', body: '## 第一节\n\n新笔记正文。' }],
    })

    const cover = new CoverPage(window)
    await cover.enterName('E2E 测试员')
    await cover.goToBriefing()

    await window.getByTestId('briefing-source-book').click()
    await window.getByTestId('book-card-0').click()
    await window.getByTestId('chapter-row-0').click()
    await expect(window.getByTestId('book-chapter-body')).toContainText('新笔记正文')

    await window.getByTestId('article-panel-tab-companion-book').click()
    await window.getByTestId('briefing-source-writing').click()
    await expect(window.getByTestId('companion-writing-picker')).toBeVisible()

    // 本章尚无对应笔记 → 笔记段出现「＋ 新建」
    await expect(window.getByTestId('picker-note-create')).toBeVisible()
    await window.getByTestId('picker-note-create').click()

    // 创建后直接进入对照槽，标题为「书名 · 章节名」
    await expect(window.getByTestId('article-companion-board')).toBeVisible()
    await expect(window.getByTestId('article-companion-board')).toContainText('E2E 新笔记之书 · 第一章 起')
    // 已存在对应笔记 → 入口收起，不再重复创建
    await expect(window.getByTestId('picker-note-create')).toHaveCount(0)

    // 这篇笔记真的落到笔记书架（阅读 → 沉淀的最后一跳）
    await window.getByTestId('article-panel-tab-guide-book').click()
    await window.getByTestId('briefing-source-writing').click()
    await window.getByTestId('writing-list-tab-notes').click()
    await expect(window.locator('body')).toContainText('E2E 新笔记之书 · 第一章 起')
  })
})
