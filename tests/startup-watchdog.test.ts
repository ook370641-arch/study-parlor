import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createStartupWatchdog } from '../electron/lib/startup-watchdog'

function makeWatchdog(enabled = true) {
  const lines: string[] = []
  const watchdog = createStartupWatchdog({ enabled, out: (l) => lines.push(l) })
  return { lines, watchdog }
}

// Simulate one full healthy startup
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

// Simulate a React Fast Refresh in-place remount (HMR): App mounts again and
// the whole boot-complete flow re-runs, WITHOUT a page reload.
function hmrRemount(w: ReturnType<typeof createStartupWatchdog>) {
  w.onRendererTiming('App mounted', 3_700_000)
  w.onRendererTiming('App boot checks resolved', 3_700_010)
  w.onRendererTiming('App boot:complete received', 3_701_000)
  w.onRendererTiming('App store.init start', 3_701_000)
  w.onRendererTiming('App store.init done', 3_701_100)
  w.onRendererTiming('App Cover chunk ready', 3_701_200)
}

describe('startup-watchdog', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('healthy startup: HEALTHY summary after 12s, no alerts', () => {
    const { lines, watchdog } = makeWatchdog()
    healthyRun(watchdog)
    vi.advanceTimersByTime(12_000)
    const text = lines.join('\n')
    expect(text).toContain('startup health summary')
    expect(text).toContain('verdict: HEALTHY')
    expect(text).not.toContain('[WARN]')
  })

  it('second did-start-loading: immediate full-reload alert pointing at optimizeDeps', () => {
    const { lines, watchdog } = makeWatchdog()
    healthyRun(watchdog)
    vi.advanceTimersByTime(5_000)
    watchdog.onDidStartLoading() // vite re-optimization reload
    const text = lines.join('\n')
    expect(text).toContain('full page reload')
    expect(text).toContain('optimizeDeps.include')
    vi.advanceTimersByTime(10_000)
    expect(lines.join('\n')).toContain('verdict: UNHEALTHY')
  })

  it('duplicate init label without remount: alert about double store.init', () => {
    const { lines, watchdog } = makeWatchdog()
    healthyRun(watchdog)
    watchdog.onRendererTiming('App store.init start', 9000)
    const text = lines.join('\n')
    expect(text).toContain('"App store.init start" fired twice')
    expect(text).toContain('[WARN]')
  })

  it('HMR in-place remount: info only, counters reset, no duplicate alerts, verdict stays HEALTHY', () => {
    const { lines, watchdog } = makeWatchdog()
    healthyRun(watchdog)
    hmrRemount(watchdog)
    const text = lines.join('\n')
    expect(text).toContain('remounted in-place')
    expect(text).not.toContain('[WARN]')
    expect(text).not.toContain('fired twice')
    vi.advanceTimersByTime(12_000)
    const full = lines.join('\n')
    expect(full).toContain('in-place remounts (HMR): 1')
    expect(full).toContain('verdict: HEALTHY')
  })

  it('labels repeating after a page reload are a fresh load, not duplicates', () => {
    const { lines, watchdog } = makeWatchdog()
    healthyRun(watchdog)
    watchdog.onDidStartLoading() // reload resets tracking
    watchdog.onRendererTiming('App store.init start', 600)
    expect(lines.join('\n')).not.toContain('fired twice')
  })

  it('first load beyond 8s: slow cold-transform alert', () => {
    const { lines, watchdog } = makeWatchdog()
    watchdog.onDidStartLoading()
    vi.advanceTimersByTime(14_000)
    watchdog.onDidFinishLoad()
    const text = lines.join('\n')
    expect(text).toContain('first renderer load took 14.0s')
    expect(text).toContain('cold transform too slow')
  })

  it('boot stall: alert after 30s without boot:complete; none when boot completes', () => {
    const { lines, watchdog } = makeWatchdog()
    watchdog.onDidStartLoading()
    watchdog.onDidFinishLoad()
    vi.advanceTimersByTime(30_000)
    expect(lines.join('\n')).toContain('stalled')

    const { lines: lines2, watchdog: w2 } = makeWatchdog()
    healthyRun(w2)
    vi.advanceTimersByTime(60_000)
    expect(lines2.join('\n')).not.toContain('stalled')
  })

  it('disabled: no output at all', () => {
    const { lines, watchdog } = makeWatchdog(false)
    healthyRun(watchdog)
    watchdog.onDidStartLoading()
    vi.advanceTimersByTime(60_000)
    expect(lines).toHaveLength(0)
  })
})
