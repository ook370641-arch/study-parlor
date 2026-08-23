import { test, expect } from '../fixtures/electron'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { CoverPage } from '../pages/CoverPage'
import { SELECTORS } from '../helpers/selectors'
import { seedStateJson } from '../helpers/test-library'

/**
 * 写作代码块用户链路全覆盖(设计:docs/superpowers/specs/2026-08-23-writing-codeblock-design.md §验收 checklist)。
 * 10 条链路:加号栏插入 / ``` 输入规则 / 编辑保存 / Enter 退出 / 折叠展开 /
 * 删除(块内全删 + 块首合并) / 语法高亮 / 双主题 / 序列化往返 / 代码块内 gutter 守卫。
 * 导航与 seed 模式照抄 writing-codeblock-wrap.spec.ts。
 */

function fm(title: string): string {
  return `---\ntype: writing\ntitle: ${title}\ncreated: 2026-08-09\nupdated: 2026-08-09\n---\n\n`
}

/** 封面 → 简报 → 写作来源 → 打开指定文章(seed 后封面可能是回访态:输入框或点灯按钮二选一) */
async function openArticle(window: any, title: string) {
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

  await window.getByTestId('writing-tree-node').filter({ hasText: title }).click()
  await expect(window.locator('[data-testid="writing-editor"] .ProseMirror')).toBeVisible({ timeout: 10000 })
  await window.waitForTimeout(1500)
}

async function setup(
  window: any,
  testLibraryPath: string,
  testConfigDir: string,
  title: string,
  body: string,
  theme?: 'academic' | 'newspaper',
) {
  seedStateJson(testConfigDir, theme ? { briefingTheme: theme } : {})

  const writingDir = path.join(testLibraryPath, 'writing')
  fs.mkdirSync(writingDir, { recursive: true })
  fs.writeFileSync(path.join(writingDir, `${title}.md`), fm(title) + body, 'utf8')

  await openArticle(window, title)
}

/** 编辑器顶层结构:NodeView 代码块记为 'codeblock',其余取 tagName */
function topLevelStructure(window: any): Promise<string[]> {
  return window.evaluate(() =>
    Array.from(document.querySelector('.ProseMirror')!.children).map(el =>
      el.classList.contains('writing-codeblock') ? 'codeblock' : el.tagName.toLowerCase()))
}

test.describe('@p1 writing-codeblock', () => {
  // 链路 1:加号栏插入
  test('gutter 加号栏插入代码块,光标落在代码区可输入', async ({ window, testLibraryPath, testConfigDir }) => {
    const TITLE = '代码块-加号栏插入'
    await setup(window, testLibraryPath, testConfigDir, TITLE, `# ${TITLE}\n\n上文段落\n`)

    await window.locator('.ProseMirror p').filter({ hasText: '上文段落' }).click()
    await expect(window.getByTestId('writing-gutter-plus')).toBeVisible()
    await window.getByTestId('writing-gutter-plus').click()
    await expect(window.getByTestId('writing-gutter-menu')).toBeVisible()
    await window.locator('[data-testid="writing-gutter-item"][data-type="codeblock"]').click()

    const block = window.getByTestId('writing-codeblock')
    await expect(block).toBeVisible()
    await expect(block).toHaveAttribute('data-collapsed', 'false')
    // 当前段落被转为代码块,原文保留
    await expect(window.locator('.writing-codeblock-body')).toContainText('上文段落')

    // 光标在 pre code 内
    const cursorInCode = await window.evaluate(() => {
      const sel = document.getSelection()
      const code = document.querySelector('.writing-codeblock-body code')
      return !!sel && sel.rangeCount > 0 && !!code && code.contains(sel.anchorNode)
    })
    expect(cursorInCode).toBe(true)

    // 打字进代码区
    await window.keyboard.type('GUTTER_INSERT_OK')
    await expect(window.locator('.writing-codeblock-body')).toContainText('GUTTER_INSERT_OK')
  })

  // 链路 2:``` 输入规则
  test('输入规则:``` 生成代码块,```js 带语言标签', async ({ window, testLibraryPath, testConfigDir }) => {
    const TITLE = '代码块-输入规则'
    await setup(window, testLibraryPath, testConfigDir, TITLE, `# ${TITLE}\n\n上文段落\n`)

    await window.locator('.ProseMirror p').filter({ hasText: '上文段落' }).click()
    await window.keyboard.press('End')
    await window.keyboard.press('Enter')

    // 新空段落逐字打 ``` + 空格(输入规则 /^```([a-z]*)?[\s\n]$/ 由尾随空白触发)→ 无语言代码块
    await window.keyboard.type('```')
    await window.keyboard.type(' ')
    await expect(window.getByTestId('writing-codeblock')).toHaveCount(1)
    await expect(window.getByTestId('writing-codeblock-lang').first()).toHaveText('文本')

    // 光标在空代码块内,Enter 退出到新段落(末行空行 Enter 链路在此复用)
    await window.keyboard.press('Enter')

    // ```js + 空格 → 语言标签 js
    await window.keyboard.type('```js')
    await window.keyboard.type(' ')
    await expect(window.getByTestId('writing-codeblock')).toHaveCount(2)
    await expect(window.getByTestId('writing-codeblock-lang').nth(1)).toHaveText('js')
  })

  // 链路 3:编辑 → 自动保存 → 磁盘 markdown 回写
  test('块内编辑自动保存,磁盘 markdown 回写正确', async ({ window, testLibraryPath, testConfigDir }) => {
    const TITLE = '代码块-编辑保存'
    const filePath = path.join(testLibraryPath, 'writing', `${TITLE}.md`)
    await setup(window, testLibraryPath, testConfigDir, TITLE, `# ${TITLE}\n\n\`\`\`js\nlet a = 1\n\`\`\`\n`)

    // 输入字符
    await window.locator('.writing-codeblock-body code').click()
    await window.keyboard.press('End')
    await window.keyboard.type('XYZ')
    await expect(window.locator(SELECTORS.writing.saveStatus)).toContainText('已保存', { timeout: 8000 })
    await expect.poll(() => fs.readFileSync(filePath, 'utf8'), { timeout: 8000 }).toContain('let a = 1XYZ')

    // 删除字符
    await window.keyboard.press('Backspace')
    await window.keyboard.press('Backspace')
    await window.keyboard.press('Backspace')
    await expect(window.locator(SELECTORS.writing.saveStatus)).toContainText('已保存', { timeout: 8000 })
    await expect.poll(() => {
      const md = fs.readFileSync(filePath, 'utf8')
      return md.includes('let a = 1\n') && !md.includes('XYZ')
    }, { timeout: 8000 }).toBe(true)

    const md = fs.readFileSync(filePath, 'utf8')
    expect(md).toContain('```js')
  })

  // 链路 4:末行空行 Enter 退出
  test('末行空行 Enter 退出代码块,typing 落进新段落', async ({ window, testLibraryPath, testConfigDir }) => {
    const TITLE = '代码块-Enter退出'
    await setup(window, testLibraryPath, testConfigDir, TITLE, `# ${TITLE}\n\n\`\`\`\nfoo\n\`\`\`\n`)

    await window.locator('.writing-codeblock-body code').click()
    await window.keyboard.press('End')
    // 第一次 Enter:块内换行(newlineInCode),不产生新段落
    await window.keyboard.press('Enter')
    await expect(window.getByTestId('writing-codeblock')).toHaveCount(1)
    expect(await topLevelStructure(window)).toEqual(['h1', 'codeblock'])
    // 第二次 Enter:末行空行 → 退出代码块,新建段落
    await window.keyboard.press('Enter')

    await window.keyboard.type('退出后的段落')
    await expect(window.locator('.writing-codeblock-body')).not.toContainText('退出后的段落')
    await expect(window.locator('.ProseMirror > p').last()).toHaveText('退出后的段落')
    expect(await topLevelStructure(window)).toEqual(['h1', 'codeblock', 'p'])
  })

  // 链路 5:折叠/展开
  test('折叠露出前 3 行加展开条,点展开条恢复全高', async ({ window, testLibraryPath, testConfigDir }) => {
    const TITLE = '代码块-折叠展开'
    await setup(window, testLibraryPath, testConfigDir, TITLE,
      `# ${TITLE}\n\n\`\`\`js\nconst l1 = 1\nconst l2 = 2\nconst l3 = 3\nconst l4 = 4\nconst l5 = 5\n\`\`\`\n`)

    const block = window.getByTestId('writing-codeblock')
    const fullHeight: number = await window.evaluate(() =>
      (document.querySelector('.writing-codeblock-body') as HTMLElement).getBoundingClientRect().height)

    await window.getByTestId('writing-codeblock-toggle').click()
    await expect(block).toHaveAttribute('data-collapsed', 'true')
    await expect(window.getByTestId('writing-codeblock-expand')).toBeVisible()

    const m = await window.evaluate(() => {
      const body = document.querySelector('.writing-codeblock-body') as HTMLElement
      return { h: body.getBoundingClientRect().height, lh: parseFloat(getComputedStyle(body).lineHeight) }
    })
    // 折叠高度 = max-height: calc(1.6em * 3 + 16px),即 3 行 + 上下 padding,容差 ±4px
    expect(Math.abs(m.h - (3 * m.lh + 16))).toBeLessThanOrEqual(4)
    expect(m.h).toBeLessThan(fullHeight)

    await window.getByTestId('writing-codeblock-expand').click()
    await expect(block).toHaveAttribute('data-collapsed', 'false')
    await expect(window.getByTestId('writing-codeblock-expand')).toBeHidden()
    const restored: number = await window.evaluate(() =>
      (document.querySelector('.writing-codeblock-body') as HTMLElement).getBoundingClientRect().height)
    expect(Math.abs(restored - fullHeight)).toBeLessThanOrEqual(4)
  })

  // 链路 6a:块内全选删除
  test('块内 Ctrl+A Backspace 后代码块消失,文档剩空段落', async ({ window, testLibraryPath, testConfigDir }) => {
    const TITLE = '代码块-块内全删'
    await setup(window, testLibraryPath, testConfigDir, TITLE, `# ${TITLE}\n\n段落文字\n\n\`\`\`\ncode line\n\`\`\`\n`)

    await window.locator('.writing-codeblock-body code').click()
    await window.keyboard.press('Control+a')
    await window.keyboard.press('Backspace')

    await expect(window.getByTestId('writing-codeblock')).toHaveCount(0)
    expect(await topLevelStructure(window)).toEqual(['p'])
    const text: string = await window.evaluate(() => document.querySelector('.ProseMirror')!.textContent ?? '')
    expect(text).toBe('')
  })

  // 链路 6b:块首 Backspace 与上文合并
  test('块首 Backspace 与上文段落合并不错乱', async ({ window, testLibraryPath, testConfigDir }) => {
    const TITLE = '代码块-块首合并'
    await setup(window, testLibraryPath, testConfigDir, TITLE, `# ${TITLE}\n\n前文段落\n\n\`\`\`\ncode here\n\`\`\`\n`)

    await window.locator('.writing-codeblock-body code').click()
    await window.keyboard.press('Home')
    await window.keyboard.press('Backspace')

    await expect(window.getByTestId('writing-codeblock')).toHaveCount(0)
    expect(await topLevelStructure(window)).toEqual(['h1', 'p'])
    const merged = window.locator('.ProseMirror > p').last()
    await expect(merged).toContainText('前文段落')
    await expect(merged).toContainText('code here')
  })

  // 链路 7:语法高亮
  test('js 块出现 token.keyword 着色,无语言块无 token 装饰', async ({ window, testLibraryPath, testConfigDir }) => {
    const TITLE = '代码块-高亮'
    await setup(window, testLibraryPath, testConfigDir, TITLE,
      `# ${TITLE}\n\n\`\`\`js\nconst foo = 1\n\`\`\`\n\n\`\`\`\nplain code\n\`\`\`\n`)

    const blocks = window.getByTestId('writing-codeblock')
    await expect(blocks).toHaveCount(2)

    const kw = blocks.first().locator('.token.keyword').first()
    await expect(kw).toBeVisible()
    const kwColor: string = await kw.evaluate(el => getComputedStyle(el).color)
    // academic 主题 keyword = #d97757(非继承色,与代码正文 #e8d5b7 不同)
    expect(kwColor).toBe('rgb(217, 119, 87)')
    const bodyColor: string = await window.locator('.writing-codeblock-body').first()
      .evaluate((el: Element) => getComputedStyle(el).color)
    expect(kwColor).not.toBe(bodyColor)

    // 无语言块:零装饰
    await expect(blocks.nth(1).locator('.token')).toHaveCount(0)
  })

  // 链路 8:双主题(各自 seed 冷启动,不在运行中切主题)
  for (const theme of ['academic', 'newspaper'] as const) {
    test(`双主题:${theme} 版式代码块面板色值`, async ({ window, testLibraryPath, testConfigDir }) => {
      const TITLE = `代码块-主题-${theme}`
      await setup(window, testLibraryPath, testConfigDir, TITLE, `# ${TITLE}\n\n\`\`\`js\nconst a = 1\n\`\`\`\n`, theme)

      await expect(window.locator('.writing-editor-root')).toHaveAttribute('data-theme', theme)
      const bg: string = await window.getByTestId('writing-codeblock')
        .evaluate(el => getComputedStyle(el).backgroundColor)
      if (theme === 'academic') {
        // 深墨面板 rgba(0,0,0,0.28):r 通道 < 60
        const m = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/)
        expect(m).not.toBeNull()
        expect(Number(m![1])).toBeLessThan(60)
      } else {
        // 浅灰纸面板 #f5f2ed
        expect(bg).toBe('rgb(245, 242, 237)')
      }
    })
  }

  // 链路 9:序列化往返
  test('保存后 reload 重开:代码与语言标签保留,.md 不含 collapsed', async ({ window, testLibraryPath, testConfigDir }) => {
    const TITLE = '代码块-序列化往返'
    const filePath = path.join(testLibraryPath, 'writing', `${TITLE}.md`)
    await setup(window, testLibraryPath, testConfigDir, TITLE, `# ${TITLE}\n\n\`\`\`js\nconst keep = 1\n\`\`\`\n`)

    // 折叠(视图态)+ 编辑代码内容,一起进保存
    await window.getByTestId('writing-codeblock-toggle').click()
    await expect(window.getByTestId('writing-codeblock')).toHaveAttribute('data-collapsed', 'true')
    await window.locator('.writing-codeblock-body code').click()
    await window.keyboard.press('End')
    await window.keyboard.type('0')
    await expect(window.locator(SELECTORS.writing.saveStatus)).toContainText('已保存', { timeout: 8000 })
    await expect.poll(() => fs.readFileSync(filePath, 'utf8'), { timeout: 8000 }).toContain('const keep = 10')

    const md = fs.readFileSync(filePath, 'utf8')
    expect(md).toContain('```js')
    expect(md).not.toContain('collapsed')

    // reload 重开:代码与语言围栏保留;本用例折叠后又改了内容 → 块 hash 失配,重开默认展开
    await window.reload()
    await openArticle(window, TITLE)
    await expect(window.locator('.writing-codeblock-body')).toContainText('const keep = 10')
    await expect(window.getByTestId('writing-codeblock-lang')).toHaveText('js')
    await expect(window.getByTestId('writing-codeblock')).toHaveAttribute('data-collapsed', 'false')
  })

  // 链路 11:折叠状态跨重开持久化(折叠偏好存 state.json,不进 .md)
  test('折叠状态跨重开持久化:折叠后 reload 仍折叠,展开后 reload 仍展开', async ({ window, testLibraryPath, testConfigDir }) => {
    const TITLE = '代码块-折叠持久化'
    const statePath = path.join(testConfigDir, 'state.json')
    await setup(window, testLibraryPath, testConfigDir, TITLE, `# ${TITLE}\n\n\`\`\`\nline1\nline2\nline3\nline4\n\`\`\`\n`)

    // 折叠(不改内容,块 hash 不变)
    await window.getByTestId('writing-codeblock-toggle').click()
    await expect(window.getByTestId('writing-codeblock')).toHaveAttribute('data-collapsed', 'true')

    // 折叠偏好经 patchState 落盘 state.json(与正文 autosave 无关)
    await expect.poll(() => {
      const raw = JSON.parse(fs.readFileSync(statePath, 'utf8'))
      const collapsed = raw.writingCodeblockCollapsed ?? {}
      return Object.values(collapsed).flat().length
    }, { timeout: 8000 }).toBeGreaterThan(0)

    // reload 重开:折叠状态恢复
    await window.reload()
    await openArticle(window, TITLE)
    await expect(window.getByTestId('writing-codeblock')).toHaveAttribute('data-collapsed', 'true')

    // 展开 → 偏好清空 → 再 reload 仍展开
    await window.getByTestId('writing-codeblock-toggle').click()
    await expect(window.getByTestId('writing-codeblock')).toHaveAttribute('data-collapsed', 'false')
    await expect.poll(() => {
      const raw = JSON.parse(fs.readFileSync(statePath, 'utf8'))
      const collapsed = raw.writingCodeblockCollapsed ?? {}
      return Object.values(collapsed).flat().length
    }, { timeout: 8000 }).toBe(0)

    await window.reload()
    await openArticle(window, TITLE)
    await expect(window.getByTestId('writing-codeblock')).toHaveAttribute('data-collapsed', 'false')
  })

  // 链路 10:嵌套守卫
  test('光标在代码块内时 gutter 加号不可见', async ({ window, testLibraryPath, testConfigDir }) => {
    const TITLE = '代码块-gutter守卫'
    await setup(window, testLibraryPath, testConfigDir, TITLE, `# ${TITLE}\n\n普通段落\n\n\`\`\`\ncode\n\`\`\`\n`)

    // 正面参照:段落上「+」可见
    await window.locator('.ProseMirror p').filter({ hasText: '普通段落' }).click()
    await expect(window.getByTestId('writing-gutter-plus')).toBeVisible()

    // 光标进代码块 →「+」隐藏
    await window.locator('.writing-codeblock-body code').click()
    await expect(window.getByTestId('writing-gutter-plus')).toBeHidden()
  })
})
