import { test, expect } from '../fixtures/electron'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { CoverPage } from '../pages/CoverPage'
import { SELECTORS } from '../helpers/selectors'
import { seedWritingTree, seedRepository, seedCatalogJson } from '../helpers/test-library'

/**
 * 写作库非 md 文件（xlsx/pdf/docx）放置与阅读。
 * - 树中显示非 md 文件，点击后只读 markdown 预览（表格）
 * - 无文本层 PDF 走 PDF_NO_TEXT 降级路径 + 系统打开兜底
 */
test.describe('@p2 writing-non-md', () => {
  const FIXTURES = path.resolve(__dirname, '..', '..', 'tests', 'fixtures')

  function seedNonMdFiles(libPath: string) {
    fs.mkdirSync(path.join(libPath, 'writing'), { recursive: true })
    fs.mkdirSync(path.join(libPath, 'repository'), { recursive: true })
    fs.copyFileSync(path.join(FIXTURES, 'sample.xlsx'), path.join(libPath, 'writing', '报表.xlsx'))
    fs.copyFileSync(path.join(FIXTURES, 'blank.pdf'), path.join(libPath, 'writing', '扫描件.pdf'))
    fs.copyFileSync(path.join(FIXTURES, 'sample.pdf'), path.join(libPath, 'repository', '论文.pdf'))
    // 自包含静态 HTML：内联 CSS + 少量 JS，验证 iframe srcdoc 原生渲染
    fs.writeFileSync(
      path.join(libPath, 'writing', '报告.html'),
      '<!DOCTYPE html><html><head><meta charset="utf-8"><style>h1{color:#d97757}</style></head>' +
      '<body><h1>月度报告</h1><p>HTML 原生渲染</p></body></html>',
    )
  }

  async function gotoWriting(window: any, libPath: string) {
    seedWritingTree(libPath)
    seedRepository(libPath)
    seedCatalogJson(libPath)
    seedNonMdFiles(libPath)

    const cover = new CoverPage(window)
    await cover.enterName('E2E 测试员')
    await cover.goToBriefing()
    await expect(window.locator(SELECTORS.briefing.sourceSidebar)).toBeVisible({ timeout: 10000 })
    await window.locator(SELECTORS.writing.sourceButton).click()
    await expect(window.locator(SELECTORS.writing.listTabArticles)).toBeVisible({ timeout: 15000 })
    await window.waitForTimeout(1500)
  }

  test('xlsx 在树中显示并可预览为表格', async ({ window, testLibraryPath }) => {
    await gotoWriting(window, testLibraryPath)

    const node = window.locator('[data-testid="writing-tree-node"]').filter({ hasText: '报表.xlsx' })
    await expect(node).toBeVisible({ timeout: 5000 })
    await node.click()

    await expect(window.getByTestId('writing-readonly-preview')).toBeVisible({ timeout: 5000 })
    await expect(window.getByTestId('writing-preview-open')).toBeVisible()
    // xlsx 解析出的 markdown 表格内容可见（react-markdown 渲染 <table>）
    await expect(window.getByTestId('writing-preview-content')).toContainText('姓名')
    await expect(window.getByTestId('writing-preview-content')).toContainText('数学')
  })

  test('扫描 PDF 走 PDF_NO_TEXT 降级：错误提示 + 系统打开兜底', async ({ window, testLibraryPath }) => {
    await gotoWriting(window, testLibraryPath)

    const node = window.locator('[data-testid="writing-tree-node"]').filter({ hasText: '扫描件.pdf' })
    await expect(node).toBeVisible({ timeout: 5000 })
    await node.click()

    await expect(window.getByTestId('writing-preview-error')).toBeVisible({ timeout: 5000 })
    await expect(window.getByTestId('writing-preview-error')).toContainText('无文本层')
    await expect(window.getByTestId('writing-preview-error-open')).toBeVisible()
  })

  test('带文本层的 PDF 按页预览', async ({ window, testLibraryPath }) => {
    await gotoWriting(window, testLibraryPath)

    // 仓库 tab 里也有非 md 文件
    await window.locator('[data-testid="writing-list-tab-repository"]').click()
    const node = window.locator('[data-testid="writing-tree-node"]').filter({ hasText: '论文.pdf' })
    await expect(node).toBeVisible({ timeout: 5000 })
    await node.click()

    await expect(window.getByTestId('writing-preview-content')).toContainText('Hello PDF', { timeout: 5000 })
  })

  test('HTML 文件原生渲染：iframe 沙箱显示，与浏览器一致', async ({ window, testLibraryPath }) => {
    await gotoWriting(window, testLibraryPath)

    const node = window.locator('[data-testid="writing-tree-node"]').filter({ hasText: '报告.html' })
    await expect(node).toBeVisible({ timeout: 5000 })
    await node.click()

    await expect(window.getByTestId('writing-html-preview')).toBeVisible({ timeout: 5000 })
    await expect(window.getByTestId('writing-html-preview-iframe')).toBeVisible()
    // iframe srcdoc 内真实渲染出的 DOM + 内联 CSS 生效（证明是浏览器原生渲染而非文本展示）
    const frame = window.frameLocator('[data-testid="writing-html-preview-iframe"]')
    await expect(frame.locator('body')).toContainText('月度报告', { timeout: 5000 })
    await expect(frame.locator('h1')).toHaveCSS('color', 'rgb(217, 119, 87)')
    // HTML 徽标 + 系统打开兜底
    await expect(window.getByTestId('writing-preview-kind')).toHaveText('HTML')
    await expect(window.getByTestId('writing-preview-open')).toBeVisible()

    // 缩放随字号档位（spec 追加 §缩放）：base 档 = zoom 1.2，点 + → lg 档 = 1.33
    const iframe = window.getByTestId('writing-html-preview-iframe')
    await expect(iframe).toHaveAttribute('srcdoc', /zoom:1\.2 !important/)
    await window.getByTestId('writing-ui-font-size-increase').click()
    await expect(iframe).toHaveAttribute('srcdoc', /zoom:1\.33 !important/, { timeout: 5000 })
    await window.getByTestId('writing-ui-font-size-decrease').click()
    await expect(iframe).toHaveAttribute('srcdoc', /zoom:1\.2 !important/, { timeout: 5000 })
  })

  test('HTML 删除模式：点块删除 + Ctrl+Z 撤销 + 完成写回（磁盘无注入物残留）', async ({ window, testLibraryPath }) => {
    await gotoWriting(window, testLibraryPath)
    const node = window.locator('[data-testid="writing-tree-node"]').filter({ hasText: '报告.html' })
    await expect(node).toBeVisible({ timeout: 5000 })
    await node.click()
    await expect(window.getByTestId('writing-html-preview-iframe')).toBeVisible({ timeout: 5000 })

    // IPC 暴露断言（ipc-state §1：新 IPC 至少一个运行时断言）
    const exposed = await window.evaluate(() => typeof (window as any).api?.writingSaveHtml === 'function')
    expect(exposed).toBe(true)

    // 进入删除模式 → 顶栏切到「完成」+ 字号按钮锁定
    await window.getByTestId('writing-html-delete-enter').click()
    await expect(window.getByTestId('writing-html-delete-done')).toBeVisible()
    await expect(window.getByTestId('writing-ui-font-size-increase')).toBeDisabled()
    await expect(window.getByTestId('writing-ui-font-size-decrease')).toBeDisabled()

    // frameLocator 穿透沙箱。合成事件说明：Electron 30（Chromium 124）根级 CSS zoom 有
    // getBoundingClientRect 不反映 zoom 的 bug——rect 返回未缩放坐标，而渲染与命中测试均按
    // 缩放后位置（已在 Electron CDP 环境用探针坐实：elementFromPoint 与真实 mouse.click 的
    // 命中区 = 视觉位置，唯 rect/quads 偏小 1/zoom）。Playwright 依 rect 算点击点必落在
    // 视觉位置上方，永远点不到目标块；真实用户点视觉位置可正常命中，属测试工具链 × 内嵌
    // Chromium 版本的不兼容，非产品缺陷。故在 frame 内 dispatchEvent：走同一批 document
    // 捕获监听器（mouseover/click/keydown），完整覆盖 删除→撤销→写回 链路。
    const frame = window.frameLocator('[data-testid="writing-html-preview-iframe"]')
    const target = frame.locator('p', { hasText: 'HTML 原生渲染' })
    await expect(target).toHaveCount(1)
    // hover 高亮类出现 = 注入脚本已在生产 CSP 下真实执行（sha256 白名单回归断言）
    await target.evaluate(el => el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })))
    await expect(target).toHaveClass(/sp-del-hover/)
    await target.evaluate(el => el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })))
    await expect(target).toHaveCount(0)

    // Ctrl+Z 撤销恢复（合成 keydown：合成 click 不转移焦点，真实 keyboard 事件进不了 iframe）
    await frame.locator('body').evaluate(body => {
      body.ownerDocument.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true }))
    })
    await expect(target).toHaveCount(1)

    // 再删 → 完成 → 自动写回
    await target.evaluate(el => el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })))
    await expect(target).toHaveCount(0)
    await window.getByTestId('writing-html-delete-done').click()
    await expect(window.getByTestId('writing-html-delete-enter')).toBeVisible({ timeout: 5000 })

    // 磁盘断言：块已删、doctype 保留、无任何注入物残留
    const saved = fs.readFileSync(path.join(testLibraryPath, 'writing', '报告.html'), 'utf-8')
    expect(saved).not.toContain('HTML 原生渲染')
    expect(saved).toContain('月度报告')
    expect(saved).toMatch(/^<!DOCTYPE html>/i)
    expect(saved).not.toContain('data-sp-inject')
    expect(saved).not.toContain('sp-del-hover')
    expect(saved).not.toContain('sp-html-collect')

    // 按天备份 = 修改前版本
    const backup = fs.readFileSync(path.join(testLibraryPath, 'writing', '.backups', '报告.html'), 'utf-8')
    expect(backup).toContain('HTML 原生渲染')

    // 回归：写回后调字号重建 srcdoc，已删块不得复活（store body 已同步）
    await window.getByTestId('writing-ui-font-size-increase').click()
    await expect(frame.locator('p', { hasText: 'HTML 原生渲染' })).toHaveCount(0, { timeout: 5000 })
  })

  test('HTML 删除模式：脏状态切换文件自动写回', async ({ window, testLibraryPath }) => {
    await gotoWriting(window, testLibraryPath)
    const node = window.locator('[data-testid="writing-tree-node"]').filter({ hasText: '报告.html' })
    await expect(node).toBeVisible({ timeout: 5000 })
    await node.click()
    await expect(window.getByTestId('writing-html-preview-iframe')).toBeVisible({ timeout: 5000 })

    await window.getByTestId('writing-html-delete-enter').click()
    const frame = window.frameLocator('[data-testid="writing-html-preview-iframe"]')
    const target = frame.locator('p', { hasText: 'HTML 原生渲染' })
    // frame 内合成 click：根级 CSS zoom × Chromium 124 的 rect 错位使真实坐标点击不可达，
    // 详见上条用例注释
    await target.evaluate(el => el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })))
    await expect(target).toHaveCount(0)

    // 切到 xlsx：selectWritingFile 头部 flush 门先写回再读取，预览出现即写盘已完成
    await window.locator('[data-testid="writing-tree-node"]').filter({ hasText: '报表.xlsx' }).click()
    await expect(window.getByTestId('writing-readonly-preview')).toBeVisible({ timeout: 5000 })
    const saved = fs.readFileSync(path.join(testLibraryPath, 'writing', '报告.html'), 'utf-8')
    expect(saved).not.toContain('HTML 原生渲染')
  })
})
