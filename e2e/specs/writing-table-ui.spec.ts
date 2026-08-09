import { test, expect } from '../fixtures/electron'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { CoverPage } from '../pages/CoverPage'
import { SELECTORS } from '../helpers/selectors'
import { seedStateJson } from '../helpers/test-library'

/**
 * 写作表格 UI(设计:docs/superpowers/specs/2026-08-09-writing-table-ui-design.md)
 * - 表格网格样式:官方 tables.css 未加载,自写暗色网格;列宽拖拽手柄显式隐藏
 *   (GFM 存不下列宽,不留假 affordance)。
 * - 行列手柄/⋯菜单/gutter 菜单见后续测试。
 */

const ARTICLE_TITLE = '表格 UI 验证'

/** 3 列 2 数据行表格,分隔行用裸 ---(对齐断言依赖:左对齐后才出现 `:---`) */
const ARTICLE_BODY = `# ${ARTICLE_TITLE}

正文段落一。

| 名称 | 数量 | 备注 |
| --- | --- | --- |
| 甲 | 1 | x |
| 乙 | 2 | y |

\`\`\`
code line
\`\`\`

正文段落二。
`

function fm(title: string): string {
  return `---\ntype: writing\ntitle: ${title}\ncreated: 2026-08-09\nupdated: 2026-08-09\n---\n\n`
}

test.describe('@p2 writing-table-ui', () => {
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

  test('表格渲染带边框网格,列宽拖拽手柄被隐藏', async ({ window, testLibraryPath, testConfigDir }) => {
    await setup(window, testLibraryPath, testConfigDir)

    const m = await window.evaluate(() => {
      const td = document.querySelector('.ProseMirror td') as HTMLElement
      // 拖拽手柄只在拖拽瞬间生成,用探针元素验证 CSS 规则本身
      const probe = document.createElement('div')
      probe.className = 'column-resize-handle'
      document.querySelector('.ProseMirror')!.appendChild(probe)
      const probeDisplay = getComputedStyle(probe).display
      probe.remove()
      return {
        tdBorderWidth: getComputedStyle(td).borderTopWidth,
        tdBorderStyle: getComputedStyle(td).borderTopStyle,
        probeDisplay,
      }
    })

    expect(m.tdBorderWidth).toBe('1px')
    expect(m.tdBorderStyle).toBe('solid')
    expect(m.probeDisplay).toBe('none')
  })
})
