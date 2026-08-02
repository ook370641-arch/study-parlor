// Startup resource waterfall diagnostics.
//
// Captures browser Performance API resource timing after all static imports
// resolve in main.tsx. Reports structured data via the existing logTiming IPC
// so it appears in the terminal alongside bootstrap/watchdog output.
//
// The report helps distinguish three failure modes when the watchdog flags
// a slow first renderer load (>8s):
//
//   source files slow  → warmup.clientFiles may not cover new page entries,
//                         or the eager dependency chain has grown too large
//   dep chunks slow    → optimizeDeps cache may be stale or missing entries;
//                         check node_modules/.vite/deps
//   ALL resources slow → system-level I/O contention (antivirus, cold disk
//                         cache, CPU throttling); not a code regression
//
// Dev-only: tree-shaken in production builds (import.meta.env.DEV guard at
// the call site). Designed to produce zero overhead when stripped.

function shortName(url: string): string {
  // Strip origin and leading path noise for readable log output.
  // e.g. "http://localhost:5173/src/store/index.ts" → "src/store/index.ts"
  // e.g. "http://localhost:5173/node_modules/.vite/deps/chunk-X.js" → "deps/chunk-X.js"
  let s = url.replace(/^https?:\/\/[^/]+\//, '')
  if (s.startsWith('node_modules/.vite/deps/')) s = 'deps/' + s.slice('node_modules/.vite/deps/'.length)
  if (s.startsWith('@')) s = 'src' + s // @fs-resolved paths
  return s
}

export function reportStartupResources() {
  const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[]

  let sourceFiles = 0
  let depChunks = 0
  let cssFiles = 0
  let otherFiles = 0
  let totalKB = 0
  const slowEntries: Array<{ name: string; ms: number; kb: number }> = []

  for (const r of resources) {
    const kb = Math.round((r.transferSize || 0) / 1024)
    totalKB += kb
    const ms = Math.round(r.responseEnd - r.startTime)
    const url = r.name

    if (url.includes('/src/') || url.includes('/@fs/') || url.includes('/@id/')) {
      sourceFiles++
    } else if (url.includes('/node_modules/.vite/deps/')) {
      depChunks++
    } else if (url.endsWith('.css')) {
      cssFiles++
    } else {
      otherFiles++
    }

    // Track resources that took >50ms — these dominate the waterfall
    if (ms > 50) {
      slowEntries.push({ name: shortName(url), ms, kb })
    }
  }

  slowEntries.sort((a, b) => b.ms - a.ms)

  const log = window.api?.logTiming
  if (!log) return

  // Summary line: source-count / dep-count / css-count = total KB
  log(
    `startup resources: ${sourceFiles}src ${depChunks}deps ${cssFiles}css = ${totalKB}KB`,
    performance.now(),
  )

  // Top 5 slowest individual resources — these are the bottleneck candidates
  for (const s of slowEntries.slice(0, 5)) {
    log(`startup slow: ${s.name} (${s.ms}ms, ${s.kb}KB)`, performance.now())
  }

  // Correlation hint: if all resource types are similarly slow, it's likely
  // system-level (I/O, antivirus); if only source files are slow, it's a
  // warmup / dependency-graph issue.
  const avgSourceMs =
    sourceFiles > 0
      ? slowEntries
          .filter(e => e.name.startsWith('src/'))
          .reduce((s, e) => s + e.ms, 0) / Math.min(sourceFiles, slowEntries.length)
      : 0
  const avgDepMs =
    depChunks > 0
      ? slowEntries
          .filter(e => e.name.startsWith('deps/'))
          .reduce((s, e) => s + e.ms, 0) / Math.min(depChunks, slowEntries.length)
      : 0

  if (sourceFiles > 20 && depChunks > 5 && avgSourceMs > 100 && avgDepMs > 100) {
    log(
      'startup hint: ALL resources slow → likely system I/O (antivirus/Windows Defender, cold disk cache, CPU throttle). ' +
        'Fastest fix: add this project folder to Windows Defender exclusions, then rerun npm run dev. ' +
        'Ref: docs/superpowers/plans/2026-07-10-fix-dev-hang-and-orphan-processes.md Task 15',
      performance.now(),
    )
  } else if (sourceFiles > 20 && avgSourceMs > 100 && avgDepMs < 50) {
    log('startup hint: only source files slow → check warmup.clientFiles / eager chain', performance.now())
  } else if (depChunks > 5 && avgDepMs > 200) {
    log('startup hint: dep chunks slow → check node_modules/.vite/deps cache', performance.now())
  }
}
