import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { ipcMain } from 'electron'
import { registerBriefingIpc } from '@electron/ipc/briefing'
import * as kimi from '@electron/lib/kimi'
import type { AppConfig } from '@electron/env'

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() }
}))

describe('registerBriefingIpc', () => {
  let tmpDir: string
  let cfg: AppConfig
  let ipcHandlers: Record<string, Function> = {}

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'briefing-test-'))
    cfg = { apiKey: 'k', baseUrl: 'https://x', model: 'kimi-k2.6', libraryPath: tmpDir }
    ipcHandlers = {}
    vi.clearAllMocks()
    ;(ipcMain.handle as ReturnType<typeof vi.fn>).mockImplementation((channel: string, fn: Function) => {
      ipcHandlers[channel] = fn
    })
    registerBriefingIpc(cfg)
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
    vi.unstubAllGlobals()
  })

  it('returns cached file on second call for same date', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ x: [{ name: 'A', handle: 'a', tweets: [{ text: 't', url: 'u', createdAt: 'd' }] }], podcasts: [], blogs: [] })
    })) as any)
    vi.spyOn(kimi, 'chatNonStream').mockResolvedValue('## 今日航标\nHello')

    const first = await ipcHandlers['briefing:generate'](null, { date: '2026-06-21' })
    expect(first.cached).toBe(false)

    const second = await ipcHandlers['briefing:generate'](null, { date: '2026-06-21' })
    expect(second.cached).toBe(true)
    expect(second.content.trim()).toBe(first.content.trim())
  })

  it('throws FEED_EMPTY when all feeds are empty', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ x: [], podcasts: [], blogs: [] }) })) as any)
    await expect(ipcHandlers['briefing:generate'](null, { date: '2026-06-21' })).rejects.toThrow('FEED_EMPTY')
  })

  it('rejects invalid date', async () => {
    await expect(ipcHandlers['briefing:generate'](null, { date: 'not-a-date' })).rejects.toThrow('Invalid')
  })
})
