// Dev-only 启动健康看门狗。
//
// 动机：启动慢不是单一 bug，而是一类共享同一症状的独立根因（orphan 进程、
// watcher 污染、eager 链膨胀、依赖 re-optimization……）。每次排查都依赖
// 散落在日志里的隐晦信号（第二次 did-start-loading、"new dependencies
// optimized"、双份 store.init）。本模块把这些信号变成显式异常检测：
// 异常发生时立即报警并给出最可能原因与修复指引，boot 完成后再输出一段
// HEALTHY / UNHEALTHY 摘要，让下次 debug 直接从结论开始。
//
// 历史背景：docs/superpowers/plans/2026-07-10-fix-dev-hang-and-orphan-processes.md

export interface StartupWatchdog {
  onDidStartLoading(): void
  onDidFinishLoad(): void
  onRendererTiming(label: string, elapsed: number): void
  onBootComplete(): void
}

export interface StartupWatchdogOptions {
  enabled: boolean
  // 输出函数，测试时注入；默认 console.log
  out?: (line: string) => void
  now?: () => number
}

// renderer 首次加载（did-start-loading → did-finish-load）超过该阈值视为冷转换过慢。
// 健康基线：热缓存 ~1.5s，deps 重建 ~3s；Task 11 前的故障值是 14s。
const SLOW_LOAD_THRESHOLD_MS = 8000
// did-finish-load 后 boot:complete 未在该时间内到达，视为 boot 序列卡死
// （通常是 probe model 网络挂起或 IPC 未注册）。
const BOOT_STALL_THRESHOLD_MS = 30_000
// boot 完成后延迟输出健康摘要，给 Cover chunk 与潜在晚期异常留出窗口。
const SUMMARY_DELAY_MS = 12_000

const DOC_REF = 'docs/superpowers/plans/2026-07-10-fix-dev-hang-and-orphan-processes.md'

export function createStartupWatchdog(opts: StartupWatchdogOptions): StartupWatchdog {
  const out = opts.out ?? ((line: string) => console.log(line))
  const now = opts.now ?? (() => Date.now())
  const prefix = '[startup-watchdog]'
  const emit = (lines: string[]) => { for (const l of lines) out(`${prefix} ${l}`) }

  let loadCount = 0
  let firstLoadStart = 0
  let firstLoadDuration: number | null = null
  let labelsSeen = new Set<string>()
  let dupCount = 0
  let coverElapsed: number | null = null
  let bootDone = false
  let summaryScheduled = false
  const anomalies: string[] = []
  let stallTimer: ReturnType<typeof setTimeout> | null = null

  const unref = (t: ReturnType<typeof setTimeout>) => {
    // 看门狗定时器不得阻止进程退出
    ;(t as unknown as { unref?: () => void }).unref?.()
    return t
  }

  if (!opts.enabled) {
    return {
      onDidStartLoading() {},
      onDidFinishLoad() {},
      onRendererTiming() {},
      onBootComplete() {},
    }
  }

  function printSummary() {
    const ok = anomalies.length === 0
    const load = firstLoadDuration !== null ? `${(firstLoadDuration / 1000).toFixed(1)}s` : '未知'
    emit([
      '── 启动健康摘要 ──────────────────────',
      `  首次加载: ${load}${firstLoadDuration !== null && firstLoadDuration > SLOW_LOAD_THRESHOLD_MS ? ' ✗ 过慢' : ' ✓'}`,
      `  页面 reload: ${Math.max(0, loadCount - 1)} 次${loadCount > 1 ? ' ✗' : ' ✓'}`,
      `  init 事件重复: ${dupCount} 次${dupCount > 0 ? ' ✗' : ' ✓'}`,
      `  Cover 就绪: ${coverElapsed !== null ? `+${(coverElapsed / 1000).toFixed(1)}s` : '未收到'}`,
      ok
        ? '  verdict: HEALTHY'
        : `  verdict: UNHEALTHY — ${anomalies.join('；')}`,
      ...(ok ? [] : [`  排查入口: ${DOC_REF}`]),
    ])
  }

  return {
    onDidStartLoading() {
      loadCount++
      labelsSeen = new Set()
      if (loadCount === 1) {
        firstLoadStart = now()
        return
      }
      if (loadCount === 2) {
        anomalies.push('renderer 整页 reload')
        emit([
          '⚠ 检测到 renderer 第二次加载（整页 reload）——用户会看到棕色闪屏 + 二次加载动画',
          '  最常见原因：Vite 运行时发现懒加载链上的新裸依赖并 re-optimize。',
          '  → 向上翻找 "new dependencies optimized: <pkg>"，把 <pkg> 加入',
          '    electron.vite.config.ts 的 renderer.optimizeDeps.include',
          '  若你刚修改过 .env / vite 配置 / 刚完成 setup 向导，此次 reload 属预期，可忽略。',
          `  参考: ${DOC_REF} Task 11`,
        ])
      } else {
        anomalies.push(`renderer 第 ${loadCount} 次加载`)
        emit([`⚠ renderer 第 ${loadCount} 次加载，启动链路可能存在循环 reload`])
      }
    },

    onDidFinishLoad() {
      if (loadCount === 1 && firstLoadDuration === null) {
        firstLoadDuration = now() - firstLoadStart
        if (firstLoadDuration > SLOW_LOAD_THRESHOLD_MS) {
          anomalies.push('首次加载过慢')
          emit([
            `⚠ renderer 首次加载 ${(firstLoadDuration / 1000).toFixed(1)}s（阈值 ${SLOW_LOAD_THRESHOLD_MS / 1000}s）`,
            '  → Vite 冷转换过慢。检查 warmup.clientFiles 是否覆盖新增的页面入口；',
            '    node_modules/.vite 是否被删除；是否有安全软件扫描 node_modules。',
            `  参考: ${DOC_REF} Task 9/10/11`,
          ])
        }
        // boot 卡死检测（boot:complete 到达时清除）
        stallTimer = unref(setTimeout(() => {
          if (bootDone) return
          anomalies.push('boot 序列卡死')
          emit([
            `⚠ boot 序列疑似卡死：did-finish-load 后 ${BOOT_STALL_THRESHOLD_MS / 1000}s 仍未收到 boot:complete`,
            '  → 向上翻找最后一条 [bootstrap] stage 日志定位卡住阶段；',
            '    常见为 probe model 网络挂起或 IPC handler 未注册。',
          ])
        }, BOOT_STALL_THRESHOLD_MS))
      }
    },

    onRendererTiming(label: string, elapsed: number) {
      if (labelsSeen.has(label)) {
        dupCount++
        anomalies.push(`"${label}" 重复`)
        emit([
          `⚠ 同一页面加载内 "${label}" 第 2 次出现——store.init / files:scan 可能重复执行`,
          '  → 检查 LoadingScreen finish() 一次性守卫是否被破坏（Task 11 Step 11.4）',
        ])
      } else {
        labelsSeen.add(label)
      }
      if (label === 'App Cover chunk ready') {
        coverElapsed = elapsed
      }
    },

    onBootComplete() {
      bootDone = true
      if (stallTimer) {
        clearTimeout(stallTimer)
        stallTimer = null
      }
      if (!summaryScheduled) {
        summaryScheduled = true
        unref(setTimeout(printSummary, SUMMARY_DELAY_MS))
      }
    },
  }
}
