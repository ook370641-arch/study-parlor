import { test, expect } from '../fixtures/electron'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { CoverPage } from '../pages/CoverPage'
import { SELECTORS } from '../helpers/selectors'
import { seedStateJson } from '../helpers/test-library'

/**
 * 回归:大字号(2xl)下含长行代码块的文章不得在写作编辑器中撑出横向滚动条。
 * 根因:应用从未加载 prosemirror-view 内置 CSS,<pre> 落 UA 默认 white-space: pre
 * 禁止软换行,overflow-wrap: anywhere 对它无效。修复:writing-editor.css 给
 * .ProseMirror pre 加 white-space: pre-wrap(overflow-wrap 从 .ProseMirror 继承)。
 */

/** 超长无空格代码行,足以在 2xl(25px)下撑破容器;末尾哨兵用于验证内容未被截断 */
const LONG_CODE_LINE =
  'const result = await someVeryLongFunctionNameWithLotsOfArguments(argumentAlpha, argumentBeta, argumentGamma, argumentDelta, argumentEpsilon, argumentZeta); // CODE_END_MARKER'

const LONG_PARAGRAPH =
  '这是一段用于验证普通段落换行行为不受代码块修复影响的较长文字。'.repeat(6) + '段落末尾。'

const ARTICLE_TITLE = '长代码行换行回归'

function fm(title: string): string {
  return `---\ntype: writing\ntitle: ${title}\ncreated: 2026-08-09\nupdated: 2026-08-09\n---\n\n`
}

test.describe('@p2 writing-codeblock-wrap', () => {
  async function setup(window: any, testLibraryPath: string, testConfigDir: string) {
    // 复刻真实用户设置:writingUIFontSize=2xl(25px 正文)
    seedStateJson(testConfigDir, { writingUIFontSize: '2xl', writingFontSize: '2xl' })

    const writingDir = path.join(testLibraryPath, 'writing')
    fs.mkdirSync(writingDir, { recursive: true })
    fs.writeFileSync(
      path.join(writingDir, `${ARTICLE_TITLE}.md`),
      fm(ARTICLE_TITLE) +
        `# ${ARTICLE_TITLE}\n\n${LONG_PARAGRAPH}\n\n\`\`\`typescript\n${LONG_CODE_LINE}\nconst short = 1\n\`\`\`\n`,
      'utf8',
    )

    // 导航到写作页(seed 了 state.json,封面可能是回访态:输入框或点灯按钮二选一)
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

  test('2xl 字号下长行代码块不产生横向溢出', async ({ window, testLibraryPath, testConfigDir }) => {
    await setup(window, testLibraryPath, testConfigDir)

    const m = await window.evaluate(() => {
      const container = document.querySelector('[data-testid="writing-editor"]') as HTMLElement
      const pre = container.querySelector('.ProseMirror pre') as HTMLElement
      return {
        containerClient: container.clientWidth,
        containerScroll: container.scrollWidth,
        preClient: pre.clientWidth,
        preScroll: pre.scrollWidth,
        preWhiteSpace: getComputedStyle(pre).whiteSpace,
      }
    })

    // 容器无横向滚动条(容差 2px)
    expect(m.containerScroll).toBeLessThanOrEqual(m.containerClient + 2)
    // 代码块自身也无横向溢出(内容在块内软换行,而非内部裁剪/滚动)
    expect(m.preScroll).toBeLessThanOrEqual(m.preClient + 2)
    // 样式确认:pre 已脱离 UA 默认 white-space: pre
    expect(m.preWhiteSpace).toBe('pre-wrap')
  })

  test('代码块内容完整可见且普通段落换行行为不变', async ({ window, testLibraryPath, testConfigDir }) => {
    await setup(window, testLibraryPath, testConfigDir)

    // 代码块文字完整:末尾哨兵仍在 DOM 中,未被截断/丢字
    const pre = window.locator('[data-testid="writing-editor"] .ProseMirror pre')
    await expect(pre).toContainText('CODE_END_MARKER')
    await expect(pre).toContainText('const short = 1')

    // 普通段落仍正常换行:长段落应折成多行(高度明显超过一行)
    const paraHeight = await window.evaluate(() => {
      const p = document.querySelector('[data-testid="writing-editor"] .ProseMirror p') as HTMLElement
      const lineHeight = parseFloat(getComputedStyle(p).lineHeight)
      return { height: p.getBoundingClientRect().height, lineHeight }
    })
    expect(paraHeight.height).toBeGreaterThan(paraHeight.lineHeight * 1.5)

    // 段落自身同样无横向溢出
    const paraOverflow = await window.evaluate(() => {
      const p = document.querySelector('[data-testid="writing-editor"] .ProseMirror p') as HTMLElement
      return p.scrollWidth - p.clientWidth
    })
    expect(paraOverflow).toBeLessThanOrEqual(2)
  })
})
