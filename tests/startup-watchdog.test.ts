import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createStartupWatchdog } from '../electron/lib/startup-watchdog'

function makeWatchdog(enabled = true) {
  const lines: string[] = []
  const watchdog = createStartupWatchdog({ enabled, out: (l) => lines.push(l) })
  return { lines, watchdog }
}

// 模拟一次健康的完整启动
function healthyRun(w: ReturnType<typeof createStartupWatchdog>) {
  w.onDidStartLoading()
  w.onDidFinishLoad()
  w.onRendererTiming('main.tsx imports resolved', 1500)
  w.onRendererTiming('App mounted', 1600)
  w.onRendererTiming('App boot:complete received', 4500)
  w.onRendererTiming('App store.init start', 4500)
  w.onRendererTiming('App store.init done', 4600)
  w.onRendererTiming('App Cover chunk ready', 4700)
  w.onBootComplete()
}

describe('startup-watchdog', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('健康启动：12s 后输出 HEALTHY 摘要，无任何报警', () => {
    const { lines, watchdog } = makeWatchdog()
    healthyRun(watchdog)
    vi.advanceTimersByTime(12_000)
    const text = lines.join('\n')
    expect(text).toContain('启动健康摘要')
    expect(text).toContain('verdict: HEALTHY')
    expect(text).not.toContain('⚠')
  })

  it('第二次 did-start-loading：立即报警整页 reload 并指向 optimizeDeps', () => {
    const { lines, watchdog } = makeWatchdog()
    healthyRun(watchdog)
    vi.advanceTimersByTime(5_000)
    watchdog.onDidStartLoading() // 模拟 vite re-optimization 触发的 reload
    const text = lines.join('\n')
    expect(text).toContain('整页 reload')
    expect(text).toContain('optimizeDeps.include')
    // 摘要应标记 UNHEALTHY
    vi.advanceTimersByTime(10_000)
    expect(lines.join('\n')).toContain('verdict: UNHEALTHY')
  })

  it('同一页面加载内 timing 标签重复：报警 init 重复执行', () => {
    const { lines, watchdog } = makeWatchdog()
    healthyRun(watchdog)
    watchdog.onRendererTiming('App store.init start', 9000)
    expect(lines.join('\n')).toContain('"App store.init start" 第 2 次出现')
  })

  it('reload 后标签重复属新页面加载，不误报', () => {
    const { lines, watchdog } = makeWatchdog()
    healthyRun(watchdog)
    watchdog.onDidStartLoading() // reload → labelsSeen 重置
    watchdog.onRendererTiming('App store.init start', 600)
    const text = lines.join('\n')
    expect(text).not.toContain('第 2 次出现')
  })

  it('首次加载超过 8s：报警冷转换过慢', () => {
    const { lines, watchdog } = makeWatchdog()
    watchdog.onDidStartLoading()
    vi.advanceTimersByTime(14_000)
    watchdog.onDidFinishLoad()
    const text = lines.join('\n')
    expect(text).toContain('首次加载 14.0s')
    expect(text).toContain('冷转换过慢')
  })

  it('boot 30s 未完成：报警 boot 卡死；完成后不再报', () => {
    const { lines, watchdog } = makeWatchdog()
    watchdog.onDidStartLoading()
    watchdog.onDidFinishLoad()
    vi.advanceTimersByTime(30_000)
    expect(lines.join('\n')).toContain('boot:complete')
    expect(lines.join('\n')).toContain('卡死')

    const { lines: lines2, watchdog: w2 } = makeWatchdog()
    healthyRun(w2)
    vi.advanceTimersByTime(60_000)
    expect(lines2.join('\n')).not.toContain('卡死')
  })

  it('disabled：完全不输出', () => {
    const { lines, watchdog } = makeWatchdog(false)
    healthyRun(watchdog)
    watchdog.onDidStartLoading()
    vi.advanceTimersByTime(60_000)
    expect(lines).toHaveLength(0)
  })
})
