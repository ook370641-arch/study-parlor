import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { ipcMain } from 'electron'
import { registerBriefingIpc } from '@electron/ipc/briefing'
import * as kimi from '@electron/lib/kimi'
import type { AppConfig } from '@electron/env'
import type { Profile } from '@shared/index'

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() }
}))

const profile: Profile = {
  name: 'Tester',
  profile_text: 'I follow LLM infrastructure and agent tooling.',
  preferred_topics: [],
}

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

  it('uses two LLM calls with max-effort thinking and injects profile text', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({
        x: [{ name: 'A', handle: 'a', tweets: [{ text: 't', url: 'u', createdAt: 'd' }] }],
        podcasts: [],
        blogs: [],
      })
    })) as any)

    const structured = JSON.stringify({
      builders: [{ name: 'A', role: 'CEO', handle: 'a', summary: 's', key_url: 'u' }],
      podcasts: [],
      blogs: [],
    })

    vi.spyOn(kimi, 'chatNonStream')
      .mockResolvedValueOnce(structured)
      .mockResolvedValueOnce('## X / Twitter\nSummary text')

    const first = await ipcHandlers['briefing:generate'](null, { date: '2026-06-21', profile })

    expect(first.cached).toBe(false)
    expect(first.filePath).toContain(`${path.sep}夜航简报${path.sep}`)
    expect(kimi.chatNonStream).toHaveBeenCalledTimes(2)

    const firstCall = (kimi.chatNonStream as any).mock.calls[0][1]
    expect(firstCall.thinking).toEqual({ type: 'enabled', reasoning_effort: 'max' })
    expect(firstCall.messages[0].content).toContain('I follow LLM infrastructure')

    const secondCall = (kimi.chatNonStream as any).mock.calls[1][1]
    expect(secondCall.thinking).toEqual({ type: 'enabled', reasoning_effort: 'max' })
    expect(secondCall.messages[0].content).toContain('"builders"')
    expect(secondCall.messages[0].content).toContain('"name": "A"')

    const second = await ipcHandlers['briefing:generate'](null, { date: '2026-06-21', profile })
    expect(second.cached).toBe(true)
    expect(second.content.trim()).toBe(first.content.trim())
    expect(second.sources).toEqual(first.sources)
  })

  it('throws FEED_EMPTY when all feeds are empty', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ x: [], podcasts: [], blogs: [] }) })) as any)
    await expect(ipcHandlers['briefing:generate'](null, { date: '2026-06-21', profile })).rejects.toThrow('FEED_EMPTY')
  })

  it('rejects invalid date', async () => {
    await expect(ipcHandlers['briefing:generate'](null, { date: 'not-a-date', profile })).rejects.toThrow('Invalid')
  })

  it('lists cached briefing dates', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({
        x: [{ name: 'A', handle: 'a', tweets: [{ text: 't', url: 'u', createdAt: 'd' }] }],
        podcasts: [],
        blogs: [],
      })
    })) as any)

    vi.spyOn(kimi, 'chatNonStream')
      .mockResolvedValueOnce(JSON.stringify({ builders: [], podcasts: [], blogs: [] }))
      .mockResolvedValueOnce('content')

    await ipcHandlers['briefing:generate'](null, { date: '2026-06-22', profile })

    const list = await ipcHandlers['briefing:list'](null)
    expect(list).toHaveLength(1)
    expect(list[0].date).toBe('2026-06-22')
    expect(list[0].filePath).toContain(`${path.sep}夜航简报${path.sep}`)
  })
})
