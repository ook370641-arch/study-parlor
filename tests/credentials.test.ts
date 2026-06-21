import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const TEST_DIR = path.join(os.tmpdir(), 'study-parlor-credentials-test')

vi.mock('electron', () => ({
  safeStorage: {
    encryptString: (s: string) => Buffer.from(`enc:${s}`),
    decryptString: (b: Buffer) => b.toString().replace(/^enc:/, '')
  }
}))

vi.mock('../electron/lib/credentials', async () => {
  const actual = await vi.importActual<typeof import('../electron/lib/credentials')>('../electron/lib/credentials')
  return actual
})

describe('credentials', () => {
  beforeEach(() => {
    if (fs.existsSync(TEST_DIR)) fs.rmSync(TEST_DIR, { recursive: true })
    fs.mkdirSync(TEST_DIR, { recursive: true })
  })
  afterEach(() => {
    if (fs.existsSync(TEST_DIR)) fs.rmSync(TEST_DIR, { recursive: true })
  })

  it('placeholder', () => {
    expect(true).toBe(true)
  })
})
