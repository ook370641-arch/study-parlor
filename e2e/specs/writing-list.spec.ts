import { test, expect } from '../fixtures/electron'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { CoverPage } from '../pages/CoverPage'
import { SELECTORS } from '../helpers/selectors'
import { seedStateJson } from '../helpers/test-library'

/**
 * 写作列表行为(2026-08-09 列表修复)
 * 根因:Tailwind preflight 把 ul/ol 重置为 list-style:none + 无缩进,writing-editor.css
 * 只补回过 h1-h3/strong,漏了列表——插入后 markdown 已变但视觉零反馈,表现为"无法插入"。
 * 本 spec 固化:
 * 1. 列表渲染必须有标记(disc/decimal)与缩进(计算样式断言,防 preflight 回潮)
 * 2. gutter「+」插入无序/有序列表(单入口;工具栏 •/1. 已移除)
 * 3. 列表内 Enter 续接下一项(preset-commonmark listItemKeymap 原生行为)
 * 4. Tab 缩进嵌套 / Shift-Tab 逐级解除,顶层 Shift-Tab 删除列表标记
 * 5. 工具栏不再提供 •/1. 按钮(无双入口)
 */

const ARTICLE_TITLE = '列表行为验证'

const ARTICLE_BODY = `# ${ARTICLE_TITLE}

正文段落一。

正文段落二。

- 已有无序项

1. 已有有序项
`

function fm(title: string): string {
  return `---\ntype: writing\ntitle: ${title}\ncreated: 2026-08-09\nupdated: 2026-08-09\n---\n\n`
}

test.describe('@p2 writing-list', () => {
  async function setup(window: any, testLibraryPath: string, testConfigDir: string) {
    seedStateJson(testConfigDir, {})

    const writingDir = path.join(testLibraryPath, 'writing')
    fs.mkdirSync(writingDir, { recursive: true })
    fs.writeFileSync(path.join(writingDir, `${ARTICLE_TITLE}.md`), fm(ARTICLE_TITLE) + ARTICLE_BODY, 'utf8')

    const cover = new CoverPage(window)
    await cover.nameInput.or(cover.lightButton).waitFor({ state: 'visible', timeout: 15000 })
    if (await cover.nameInput.isVisible().catch(() => false)) {
      await cover.enterName('E2E 测试员')
    }
    await cover.goToBriefing()
    await expect(window.locator(SELECTORS.briefing.sourceSidebar)).toBeVisible({ timeout: 10000 })
    await window.locator(SELECTORS.writing.sourceButton).click()
    await expect(window.locator(SELECTORS.writing.listTabArticles)).toBeVisible({ timeout: 15000 })
    await window.waitForTimeout(1500)

    await window.getByTestId('writing-tree-node').filter({ hasText: ARTICLE_TITLE }).click()
    await expect(window.locator('[data-testid="writing-editor"] .ProseMirror')).toBeVisible({ timeout: 10000 })
    await window.waitForTimeout(1500)
  }

  test('列表渲染有标记与缩进(计算样式)', async ({ window, testLibraryPath, testConfigDir }) => {
    await setup(window, testLibraryPath, testConfigDir)

    const m = await window.evaluate(() => {
      const ul = document.querySelector('.ProseMirror ul') as HTMLElement
      const ol = document.querySelector('.ProseMirror ol') as HTMLElement
      const ulCs = getComputedStyle(ul)
      const olCs = getComputedStyle(ol)
      return {
        ulListStyle: ulCs.listStyleType,
        ulPaddingLeft: parseFloat(ulCs.paddingLeft),
        olListStyle: olCs.listStyleType,
        olPaddingLeft: parseFloat(olCs.paddingLeft),
      }
    })
    expect(m.ulListStyle).toBe('disc')
    expect(m.ulPaddingLeft).toBeGreaterThan(0)
    expect(m.olListStyle).toBe('decimal')
    expect(m.olPaddingLeft).toBeGreaterThan(0)
  })

  test('gutter「+」插入无序/有序列表', async ({ window, testLibraryPath, testConfigDir }) => {
    await setup(window, testLibraryPath, testConfigDir)

    await window.locator('.ProseMirror p').filter({ hasText: '正文段落一' }).click()
    await expect(window.getByTestId('writing-gutter-plus')).toBeVisible()
    await window.getByTestId('writing-gutter-plus').click()
    await window.getByTestId('writing-gutter-item').filter({ hasText: '无序列表' }).click()
    await expect(window.locator('.ProseMirror ul li').filter({ hasText: '正文段落一' })).toHaveCount(1)

    await window.locator('.ProseMirror p').filter({ hasText: '正文段落二' }).click()
    await window.getByTestId('writing-gutter-plus').click()
    await window.getByTestId('writing-gutter-item').filter({ hasText: '有序列表' }).click()
    await expect(window.locator('.ProseMirror ol li').filter({ hasText: '正文段落二' })).toHaveCount(1)
  })

  test('列表内 Enter 续接下一项', async ({ window, testLibraryPath, testConfigDir }) => {
    await setup(window, testLibraryPath, testConfigDir)

    await window.locator('.ProseMirror ul li').filter({ hasText: '已有无序项' }).click()
    await window.keyboard.press('End')
    await window.keyboard.press('Enter')
    await expect(window.locator('.ProseMirror ul li')).toHaveCount(2)

    // 续接出的新项可正常输入
    await window.keyboard.type('续接项')
    await expect(window.locator('.ProseMirror ul li').filter({ hasText: '续接项' })).toHaveCount(1)
  })

  test('Tab 嵌套 / Shift-Tab 逐级解除,顶层解除删除列表标记', async ({ window, testLibraryPath, testConfigDir }) => {
    await setup(window, testLibraryPath, testConfigDir)

    await window.locator('.ProseMirror ul li').filter({ hasText: '已有无序项' }).click()
    await window.keyboard.press('End')
    await window.keyboard.press('Enter')
    await window.keyboard.type('第二项')

    // Tab → 嵌套为子列表
    await window.keyboard.press('Tab')
    await expect(window.locator('.ProseMirror ul ul li').filter({ hasText: '第二项' })).toHaveCount(1)

    // 第一次 Shift-Tab → 回到顶层列表项(标记仍在)
    await window.keyboard.press('Shift+Tab')
    await expect(window.locator('.ProseMirror ul ul')).toHaveCount(0)
    await expect(window.locator('.ProseMirror ul li').filter({ hasText: '第二项' })).toHaveCount(1)

    // 顶层再 Shift-Tab → 删除列表标记,变回普通段落
    await window.keyboard.press('Shift+Tab')
    await expect(window.locator('.ProseMirror ul li').filter({ hasText: '第二项' })).toHaveCount(0)
    await expect(window.locator('.ProseMirror p').filter({ hasText: '第二项' })).toHaveCount(1)
  })

  test('工具栏不再提供 •/1. 按钮(入口已统一至 gutter)', async ({ window, testLibraryPath, testConfigDir }) => {
    await setup(window, testLibraryPath, testConfigDir)

    await expect(window.getByTestId('writing-toolbar-bullet-list')).toHaveCount(0)
    await expect(window.getByTestId('writing-toolbar-ordered-list')).toHaveCount(0)
  })
})
