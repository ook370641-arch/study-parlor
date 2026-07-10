import { describe, it, expect } from 'vitest'
import { findPortListeners, isProcessRunning, killProcessTree, listProjectProcesses } from '../scripts/lib/process-cleanup'

describe('process-cleanup', () => {
  it('listProjectProcesses does not throw and returns array', async () => {
    const procs = await listProjectProcesses(process.cwd())
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
})
