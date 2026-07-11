import { describe, it, expect } from 'vitest'
import path from 'node:path'
import { findPortListeners, isProcessRunning, killProcessTree, listProjectProcesses, killProjectProcessesByPattern, cleanupProjectOrphans, forceCleanupDevEnvironment } from '../scripts/lib/process-cleanup'

// Use an isolated subpath so these tests never enumerate real project processes.
// Killing the Vitest main process from a worker would crash the test run.
const ISOLATED_ROOT = path.join(process.cwd(), 'tests', 'process-cleanup-isolation-root')

describe('process-cleanup', () => {
  it('listProjectProcesses does not throw and returns array', async () => {
    const procs = await listProjectProcesses(ISOLATED_ROOT)
    expect(Array.isArray(procs)).toBe(true)
  })

  it('findPortListeners returns empty for a very unlikely port', async () => {
    const listeners = await findPortListeners(54321)
    expect(Array.isArray(listeners)).toBe(true)
  })

  it('isProcessRunning returns true for current process', async () => {
    expect(await isProcessRunning(process.pid)).toBe(true)
  })

  it('isProcessRunning returns false for pid 0', async () => {
    expect(await isProcessRunning(0)).toBe(false)
  })

  it('killProcessTree returns true for non-existent pid', async () => {
    expect(await killProcessTree(0)).toBe(true)
  })

  it('killProjectProcessesByPattern returns { killed, failed }', async () => {
    const result = await killProjectProcessesByPattern(ISOLATED_ROOT, 'definitely-not-a-real-pattern-12345')
    expect(result).toHaveProperty('killed')
    expect(result).toHaveProperty('failed')
    expect(Array.isArray(result.killed)).toBe(true)
    expect(Array.isArray(result.failed)).toBe(true)
  })

  it('cleanupProjectOrphans returns { killed, failed }', async () => {
    const result = await cleanupProjectOrphans(ISOLATED_ROOT, [process.pid])
    expect(result).toHaveProperty('killed')
    expect(result).toHaveProperty('failed')
    expect(Array.isArray(result.killed)).toBe(true)
    expect(Array.isArray(result.failed)).toBe(true)
  })

  it('forceCleanupDevEnvironment does not throw', async () => {
    const result = await forceCleanupDevEnvironment(ISOLATED_ROOT, {
      ports: [54321],
      currentPids: [process.pid],
    })
    expect(result).toHaveProperty('killed')
    expect(result).toHaveProperty('failed')
  })
})
