// Dev-only startup health watchdog.
//
// Motivation: slow startup is not a single bug but a family of independent
// root causes sharing one symptom (orphan processes, watcher pollution,
// eager-chain growth, dependency re-optimization...). Each past investigation
// relied on obscure signals scattered through the log (a second
// did-start-loading, "new dependencies optimized", duplicated store.init).
// This module turns those signals into explicit anomaly detection: alerts
// fire the moment an anomaly occurs, with the most likely cause and a fix
// pointer, and a HEALTHY / UNHEALTHY summary is printed after boot.
//
// Output is intentionally English/ASCII-only: the Windows console codepage
// (GBK) mangles UTF-8 Chinese/box-drawing into mojibake, and a watchdog whose
// output cannot be read is no watchdog at all. Project log convention
// ([bootstrap], [dev]) is English for the same reason.
//
// History: docs/superpowers/plans/2026-07-10-fix-dev-hang-and-orphan-processes.md

export interface StartupWatchdog {
  onDidStartLoading(): void
  onDidFinishLoad(): void
  onRendererTiming(label: string, elapsed: number): void
  onBootComplete(): void
}

export interface StartupWatchdogOptions {
  enabled: boolean
  // Output sink, injected by tests; defaults to console.log
  out?: (line: string) => void
  now?: () => number
}

// First renderer load (did-start-loading → did-finish-load) beyond this is a
// cold-transform slowdown. Healthy baseline: ~1.5s warm, ~3s with deps rebuild;
// the Task 11 failure mode was 14s.
const SLOW_LOAD_THRESHOLD_MS = 8000
// boot:complete not arriving within this window after did-finish-load means
// the boot sequence is stalled (usually model probe hang or missing IPC).
const BOOT_STALL_THRESHOLD_MS = 30_000
// Delay before printing the health summary, leaving room for the Cover chunk
// and late anomalies.
const SUMMARY_DELAY_MS = 12_000

const DOC_REF = 'docs/superpowers/plans/2026-07-10-fix-dev-hang-and-orphan-processes.md'

// 'App mounted' repeating within one page load means React Fast Refresh
// remounted the tree in place (HMR) — legitimate dev behavior, not an anomaly.
const REMOUNT_LABEL = 'App mounted'

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
  let remountCount = 0
  let coverElapsed: number | null = null
  let bootDone = false
  let summaryScheduled = false
  const anomalies: string[] = []
  let stallTimer: ReturnType<typeof setTimeout> | null = null

  const unref = (t: ReturnType<typeof setTimeout>) => {
    // Watchdog timers must not keep the process alive
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
    const load = firstLoadDuration !== null ? `${(firstLoadDuration / 1000).toFixed(1)}s` : 'unknown'
    const loadOk = firstLoadDuration !== null && firstLoadDuration <= SLOW_LOAD_THRESHOLD_MS
    emit([
      '-- startup health summary --------------------',
      `  first load: ${load} ${loadOk ? 'OK' : 'TOO SLOW'}`,
      `  page reloads: ${Math.max(0, loadCount - 1)} ${loadCount > 1 ? 'FAIL' : 'OK'}`,
      `  in-place remounts (HMR): ${remountCount} (informational)`,
      `  duplicate init events: ${dupCount} ${dupCount > 0 ? 'FAIL' : 'OK'}`,
      `  Cover ready: ${coverElapsed !== null ? `+${(coverElapsed / 1000).toFixed(1)}s` : 'not received'}`,
      ok
        ? '  verdict: HEALTHY'
        : `  verdict: UNHEALTHY - ${anomalies.join('; ')}`,
      ...(ok ? [] : [`  investigation entry: ${DOC_REF}`]),
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
        anomalies.push('full page reload')
        emit([
          '[WARN] renderer loaded a 2nd time (full page reload) - user sees a brown flash + loading screen twice',
          '  Most common cause: Vite discovered a new bare dependency mid-session and re-optimized.',
          '  -> scroll up for "new dependencies optimized: <pkg>" and add <pkg> to',
          '     electron.vite.config.ts renderer.optimizeDeps.include',
          '  If you just edited .env / vite config or finished the setup wizard, this reload is expected.',
          `  Ref: ${DOC_REF} Task 11`,
        ])
      } else {
        anomalies.push(`renderer loaded ${loadCount}x`)
        emit([`[WARN] renderer loaded ${loadCount} times - possible reload loop`])
      }
    },

    onDidFinishLoad() {
      if (loadCount === 1 && firstLoadDuration === null) {
        firstLoadDuration = now() - firstLoadStart
        if (firstLoadDuration > SLOW_LOAD_THRESHOLD_MS) {
          anomalies.push('slow first load')
          emit([
            `[WARN] first renderer load took ${(firstLoadDuration / 1000).toFixed(1)}s (threshold ${SLOW_LOAD_THRESHOLD_MS / 1000}s)`,
            '  -> Vite cold transform too slow. Check warmup.clientFiles covers new page entries,',
            '     node_modules/.vite is not being deleted, antivirus is not scanning node_modules.',
            `  Ref: ${DOC_REF} Task 9/10/11`,
          ])
        }
        // Boot-stall detection (cleared when boot:complete arrives)
        stallTimer = unref(setTimeout(() => {
          if (bootDone) return
          anomalies.push('boot sequence stalled')
          emit([
            `[WARN] boot sequence may be stalled: no boot:complete within ${BOOT_STALL_THRESHOLD_MS / 1000}s of did-finish-load`,
            '  -> find the last [bootstrap] stage log to locate the stuck stage;',
            '     commonly a model-probe network hang or an unregistered IPC handler.',
          ])
        }, BOOT_STALL_THRESHOLD_MS))
      }
    },

    onRendererTiming(label: string, elapsed: number) {
      if (labelsSeen.has(label)) {
        if (label === REMOUNT_LABEL) {
          // React Fast Refresh remounted the tree in place (no page reload).
          // Legitimate dev behavior: timing labels will repeat for the new
          // mount, so reset tracking instead of alerting.
          remountCount++
          labelsSeen = new Set([REMOUNT_LABEL])
          emit([
            '[info] App remounted in-place (React Fast Refresh / HMR) - timing counters reset.',
            '  Expected after edits that break Fast Refresh (e.g. non-component exports);',
            '  if unintended, scroll up for "hmr invalidate" to find the offending file.',
          ])
          return
        }
        dupCount++
        anomalies.push(`"${label}" duplicated`)
        emit([
          `[WARN] "${label}" fired twice within one page load - store.init / files:scan may run twice`,
          '  -> check the LoadingScreen finish() once-only guard (Task 11 Step 11.4)',
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
