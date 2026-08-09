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

/** 3 列 2 数据行表格,分隔行用裸 ---(对齐断言依赖:左对齐后才出现 `:---`;
 *  首列表头用 4 字——markdown-table 按列宽生成分隔符,宽度 ≥4 时左对齐产出 `:---`) */
const ARTICLE_BODY = `# ${ARTICLE_TITLE}

正文段落一。

| 物品名称 | 数量 | 备注 |
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

  test('行列手柄跟随光标,支持增删行列', async ({ window, testLibraryPath, testConfigDir }) => {
    await setup(window, testLibraryPath, testConfigDir)

    // 光标进表格第一个单元格 → 手柄出现
    await window.locator('.ProseMirror td').first().click()
    await expect(window.getByTestId('writing-table-row-add')).toBeVisible()
    await expect(window.getByTestId('writing-table-row-del')).toBeVisible()
    await expect(window.getByTestId('writing-table-col-add')).toBeVisible()
    await expect(window.getByTestId('writing-table-col-del')).toBeVisible()
    await expect(window.getByTestId('writing-table-menu')).toBeVisible()

    // 行增删:3 行(表头+2)→ 4 → 3
    await expect(window.locator('.ProseMirror tr')).toHaveCount(3)
    await window.getByTestId('writing-table-row-add').click()
    await expect(window.locator('.ProseMirror tr')).toHaveCount(4)
    await window.getByTestId('writing-table-row-del').click()
    await expect(window.locator('.ProseMirror tr')).toHaveCount(3)

    // 列增删:3 列 → 4 → 3
    await expect(window.locator('.ProseMirror tr').first().locator('th,td')).toHaveCount(3)
    await window.getByTestId('writing-table-col-add').click()
    await expect(window.locator('.ProseMirror tr').first().locator('th,td')).toHaveCount(4)
    await window.getByTestId('writing-table-col-del').click()
    await expect(window.locator('.ProseMirror tr').first().locator('th,td')).toHaveCount(3)
  })

  test('⋯ 菜单:列对齐写回 markdown,删除表格', async ({ window, testLibraryPath, testConfigDir }) => {
    await setup(window, testLibraryPath, testConfigDir)
    const filePath = path.join(testLibraryPath, 'writing', `${ARTICLE_TITLE}.md`)

    await window.locator('.ProseMirror td').first().click()
    await window.getByTestId('writing-table-menu').click()
    await expect(window.getByTestId('writing-table-menu-popup')).toBeVisible()

    // 左对齐 → 自动保存后磁盘 markdown 分隔行出现 `:---`(fixture 原为裸 `---`)
    await window.getByTestId('writing-table-align').filter({ hasText: '左对齐' }).click()
    await expect(window.locator(SELECTORS.writing.saveStatus)).toContainText('已保存', { timeout: 5000 })
    const aligned = fs.readFileSync(filePath, 'utf8')
    expect(aligned).toContain(':---')

    // 删除表格 → 编辑器中 table 消失
    await window.getByTestId('writing-table-menu').click()
    await window.getByTestId('writing-table-delete').click()
    await expect(window.locator('.ProseMirror table')).toHaveCount(0)
  })

  test('gutter「+」菜单插入表格/无序列表', async ({ window, testLibraryPath, testConfigDir }) => {
    await setup(window, testLibraryPath, testConfigDir)

    // 光标在段落二 →「+」可见 → 菜单 → 插入表格
    await window.locator('.ProseMirror p').filter({ hasText: '正文段落二' }).click()
    await expect(window.getByTestId('writing-gutter-plus')).toBeVisible()
    await window.getByTestId('writing-gutter-plus').click()
    await expect(window.getByTestId('writing-gutter-menu')).toBeVisible()
    const tableCount = await window.locator('.ProseMirror table').count()
    await window.getByTestId('writing-gutter-item').filter({ hasText: '表格' }).click()
    await expect(window.locator('.ProseMirror table')).toHaveCount(tableCount + 1)

    // 无序列表
    await window.locator('.ProseMirror p').filter({ hasText: '正文段落一' }).click()
    await window.getByTestId('writing-gutter-plus').click()
    await window.getByTestId('writing-gutter-item').filter({ hasText: '无序列表' }).click()
    await expect(window.locator('.ProseMirror ul li').filter({ hasText: '正文段落一' })).toHaveCount(1)
  })

  // H2 单独一条:list_item 的 schema 是 paragraph block*,setBlockType(heading)
  // 在 li 内不合法会静默返回 false(与工具栏标题命令同约束),故在顶层段落上验证。
  test('gutter「+」H2 作用于顶层段落', async ({ window, testLibraryPath, testConfigDir }) => {
    await setup(window, testLibraryPath, testConfigDir)

    await window.locator('.ProseMirror p').filter({ hasText: '正文段落一' }).click()
    await window.getByTestId('writing-gutter-plus').click()
    await window.getByTestId('writing-gutter-item').filter({ hasText: 'H2' }).click()
    await expect(window.locator('.ProseMirror h2').filter({ hasText: '正文段落一' })).toHaveCount(1)
  })

  test('代码块内 gutter「+」隐藏', async ({ window, testLibraryPath, testConfigDir }) => {
    await setup(window, testLibraryPath, testConfigDir)

    await window.locator('.ProseMirror pre').click()
    await expect(window.getByTestId('writing-gutter-plus')).toBeHidden()
  })

  test('顶部栏不再提供插入表格按钮(入口已移至 gutter)', async ({ window, testLibraryPath, testConfigDir }) => {
    await setup(window, testLibraryPath, testConfigDir)

    await expect(window.getByTestId('writing-toolbar-table')).toHaveCount(0)
  })
})
