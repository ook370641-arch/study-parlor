import { test, expect } from '@playwright/test'
import { spawn, ChildProcess } from 'node:child_process'
import path from 'node:path'
import { chromium, Browser, Page } from 'playwright'
import {
  createTestLibrary,
  cleanupTestLibrary,
  createTestConfigDir,
  cleanupTestConfigDir,
} from '../helpers/test-library'
import { killProcessTree, findPortListeners } from '../helpers/process-cleanup'

// 启动健康 E2E：通过真实 dev 路径（electron-vite dev server + Electron）
// 启动应用，而不是像其他 E2E 那样加载生产构建。它守护的失败模式——依赖
// re-optimization 触发整页 reload、冷转换过慢、init 重复执行——只存在于
// dev server 模式，生产构建路径无法覆盖。
//
// 注意：不能直接 spawn `scripts/dev.js`——其 preflight 会按「命令行包含项目
// 根目录」匹配并杀掉 node 进程，Playwright runner 自身也匹配，会被误杀
// （runner 静默退出、无测试报告）。这里直接 spawn electron-vite 主 bin。
//
// 断言分两层：
//   结构不变量（确定性）：恰好一次 did-start-loading、无 new dependencies
//     optimized、store.init 恰好一次、看门狗无 [WARN]、verdict HEALTHY。
//   时间预算（宽容阈值）：首次加载 < 20s，只拦截灾难级回归，避免机器差异抖动。
//
// 失败时先看输出末尾附带的排查入口文档。
// 排查入口: docs/superpowers/plans/2026-07-10-fix-dev-hang-and-orphan-processes.md
const TRACKING_DOC =
  'docs/superpowers/plans/2026-07-10-fix-dev-hang-and-orphan-processes.md'

const CDP_PATTERN = /DevTools listening on (ws:\/\/\S+)/
const FIRST_LOAD_BUDGET_MS = 20_000
const STARTUP_TIMEOUT_MS = 120_000

interface DevSession {
  proc: ChildProcess
  output: () => string
}

async function startDevApp(configDir: string, libraryPath: string): Promise<DevSession> {
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE

  const chunks: string[] = []
  // 轻量 preflight：只按端口释放 5173/9222（前一次运行的残留 electron 会占着
  // 它们，导致 electron 起不来、等不到 CDP）。不要用 cleanupProjectOrphans——
  // 它按「命令行含项目根」匹配 node 进程，Playwright runner/worker 也匹配，
  // 会把自己杀掉。也不能 spawn scripts/dev.js，同理（见文件头注释）。
  for (const port of [5173, 9222]) {
    const listeners = await findPortListeners(port)
    for (const pid of listeners) {
      if (pid === process.pid) continue
      console.log(`[e2e] preflight: port ${port} occupied by pid ${pid}, killing`)
      await killProcessTree(pid)
    }
  }
  const electronViteBin = path.join(process.cwd(), 'node_modules', 'electron-vite', 'bin', 'electron-vite.js')
  const proc = spawn(process.execPath, [electronViteBin, 'dev'], {
    cwd: process.cwd(),
    env: {
      ...env,
      NODE_ENV: 'development',
      E2E_CONFIG_DIR: configDir,
      E2E_STUDY_LIBRARY_PATH: libraryPath,
      E2E_SKIP_PROBE: '1',
      E2E_SILENT: '1',
      // E2E 静默模式默认关闭看门狗；本测试显式开启并直接断言其输出
      E2E_STARTUP_WATCHDOG: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  proc.stdout?.on('data', (d: Buffer) => chunks.push(d.toString()))
  proc.stderr?.on('data', (d: Buffer) => chunks.push(d.toString()))
  return { proc, output: () => chunks.join('') }
}

async function waitForOutput(session: DevSession, pattern: RegExp, timeoutMs: number): Promise<string> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const match = session.output().match(pattern)
    if (match) return match[0]
    if (session.proc.exitCode !== null) {
      throw new Error(`dev process exited early (code ${session.proc.exitCode}) while waiting for ${pattern}\n${session.output()}`)
    }
    await new Promise((r) => setTimeout(r, 200))
  }
  throw new Error(`Timed out waiting for ${pattern}\n${session.output()}`)
}

function countOccurrences(text: string, needle: string): number {
  return text.split(needle).length - 1
}

function parseBootstrapOffset(text: string, label: string): number | null {
  const match = text.match(new RegExp(`\\[bootstrap\\] ${label} \\[\\+(\\d+)ms\\]`))
  return match ? parseInt(match[1], 10) : null
}

test.describe('@p1 startup-health (dev server mode)', () => {
  // 必须 0 重试：vite deps 缓存会"自愈"——首次运行发现缺失依赖后写入缓存，
  // 重试时缓存已热，异常不再复现，真实回归会被误判为 flaky。
  test.describe.configure({ retries: 0 })

  test('cold dev startup: no reload, no re-optimization, single init, HEALTHY verdict', async ({}, testInfo) => {
    test.setTimeout(STARTUP_TIMEOUT_MS + 60_000)
    const configDir = createTestConfigDir()
    const libraryPath = createTestLibrary()
    let session: DevSession | null = null
    let browser: Browser | null = null

    try {
      session = await startDevApp(configDir, libraryPath)

      // 等 dev server + Electron 起来，拿 CDP 地址连接
      const cdpLine = await waitForOutput(session, CDP_PATTERN, 120_000)
      const cdpUrl = cdpLine.match(CDP_PATTERN)![1]
      const port = parseInt(cdpUrl.match(/:(\d+)\//)![1], 10)
      browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { timeout: 30_000 })

      // 看门狗摘要在 boot 完成 12s 后输出，它是本测试的核心断言对象
      await waitForOutput(session, /\[startup-watchdog\].*verdict:/, 90_000)
      const out = session.output()

      // ---- 结构不变量（失败信息自带排查入口）----
      expect(
        countOccurrences(out, 'renderer did-start-loading'),
        `页面发生了多次加载（整页 reload）。最常见的根因是懒加载链新增裸依赖触发 Vite re-optimization。排查入口: ${TRACKING_DOC} Task 11`,
      ).toBe(1)

      expect(
        out.includes('new dependencies optimized'),
        `Vite 运行时发现新依赖并 re-optimize——把该依赖加入 electron.vite.config.ts 的 optimizeDeps.include。排查入口: ${TRACKING_DOC} Task 11`,
      ).toBe(false)

      expect(
        countOccurrences(out, 'App store.init start'),
        `store.init 重复执行。排查入口: ${TRACKING_DOC} Task 11 Step 11.4`,
      ).toBe(1)

      // 看门狗的四类异常告警（不含 customLogger 对 Re-optimizing 的提示——
      // 配置变更后的 deps 重建是一次性正常事件，不算异常）
      for (const signature of ['full page reload', 'fired twice', 'cold transform too slow', 'boot sequence may be stalled']) {
        expect(
          out.includes(signature),
          `看门狗报告异常 "${signature}"，查看附件 dev-server-output 中的 [startup-watchdog] 行。排查入口: ${TRACKING_DOC}`,
        ).toBe(false)
      }

      expect(
        out.includes('verdict: HEALTHY'),
        `看门狗摘要不是 HEALTHY。排查入口: ${TRACKING_DOC}`,
      ).toBe(true)

      // ---- 时间预算（宽容，只拦截灾难级回归）----
      const startLoading = parseBootstrapOffset(out, 'renderer did-start-loading')
      const finishLoad = parseBootstrapOffset(out, 'renderer did-finish-load')
      expect(startLoading).not.toBeNull()
      expect(finishLoad).not.toBeNull()
      expect(
        finishLoad! - startLoading!,
        `首次加载 ${finishLoad! - startLoading!}ms 超过预算 ${FIRST_LOAD_BUDGET_MS}ms（冷转换退化）。排查入口: ${TRACKING_DOC} Task 9/10/11`,
      ).toBeLessThan(FIRST_LOAD_BUDGET_MS)

      // ---- UI 冒烟：Cover 真的渲染出来了 ----
      const context = browser.contexts()[0]
      const page: Page | undefined = context.pages().find((p) => p.url().includes('localhost'))
      expect(page, '未找到应用页面').toBeTruthy()
      await page!
        .locator('[data-testid="cover-light-button"], [data-testid="cover-name-input"]')
        .first()
        .waitFor({ state: 'visible', timeout: 15_000 })
    } finally {
      // 失败时把 dev server 完整输出附到报告里——排查不需要复现，直接看附件
      if (testInfo.status !== 'passed' && session) {
        await testInfo.attach('dev-server-output', { body: session.output() })
      }
      if (browser) {
        try { await browser.close() } catch { /* 进程树清理由下方兜底 */ }
      }
      if (session?.proc.pid) {
        await killProcessTree(session.proc.pid)
      }
      await cleanupTestConfigDir(configDir)
      await cleanupTestLibrary(libraryPath)
    }
  })
})
