import { test, expect } from '../fixtures/electron'
import { CoverPage } from '../pages/CoverPage'
import { seedBook } from '../helpers/test-library'

test.describe('沉浸阅读模式', () => {
  test('进入后左列卸载、控件 hover 显示，Esc 退出恢复', async ({ window, testLibraryPath }) => {
    seedBook(testLibraryPath, {
      title: '沉浸模式之书',
      chapters: [
        { title: '第一章 起', body: '## 第一节\n\n沉浸正文甲。' },
        { title: '第二章 承', body: '## 第二节\n\n沉浸正文乙。' },
      ],
    })

    const cover = new CoverPage(window)
    await cover.enterName('E2E 测试员')
    await cover.goToBriefing()

    await window.getByTestId('briefing-source-book').click()
    await window.getByTestId('book-card-0').click()
    await window.getByTestId('chapter-row-0').click()
    await expect(window.getByTestId('book-chapter-body')).toContainText('沉浸正文甲')

    // 行宽保持进入前像素宽度，仅整体居中
    const afterBox = await bodyColumn.boundingBox()
    expect(Math.round(afterBox!.width)).toBe(Math.round(beforeBox!.width))

    // 记录进入前正文行宽（article 的父容器即阅读轴）
    const bodyColumn = window.getByTestId('book-chapter-body').locator('..')
    const beforeBox = await bodyColumn.boundingBox()

    // 进入沉浸：左两列卸载，工具栏/旁注 tab/记事板入口转为 hover 显示
    await window.getByTestId('book-immersive-toggle').click()
    await expect(window.getByTestId('briefing-list-column')).toHaveCount(0)
    await expect(window.getByTestId('briefing-source-book')).toHaveCount(0)
    await expect(window.getByTestId('reader-controls')).toHaveCSS('opacity', '0')
    await expect(window.getByTestId('article-assistant-tab')).toHaveCSS('opacity', '0')
    await expect(window.getByTestId('notepad-fab-button')).toHaveCSS('opacity', '0')
    await expect(window.getByTestId('book-chapter-body')).toContainText('沉浸正文甲')

    // hover 工具栏热区：四按钮重新可见，同一按钮退出
    await window.getByTestId('reader-controls').hover()
    await expect(window.getByTestId('reader-controls')).toHaveCSS('opacity', '1')
    await window.getByTestId('book-immersive-toggle').click()
    await expect(window.getByTestId('briefing-list-column')).toBeVisible()
    await expect(window.getByTestId('reader-controls')).toHaveCSS('opacity', '1')

    // 再次进入，Esc 退出
    await window.getByTestId('book-immersive-toggle').click()
    await expect(window.getByTestId('reader-controls')).toHaveCSS('opacity', '0')
    await window.keyboard.press('Escape')
    await expect(window.getByTestId('briefing-list-column')).toBeVisible()
    await expect(window.getByTestId('briefing-source-book')).toBeVisible()
  })
})
