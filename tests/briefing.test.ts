import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { ipcMain } from 'electron'
import { registerBriefingIpc } from '@electron/ipc/briefing'
import { formatDisplayDate } from '@/pages/Briefing'
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

    const mockSender = { send: vi.fn(), isDestroyed: () => false }
    const mockEvent = { sender: mockSender }
    const first = await ipcHandlers['briefing:generate'](mockEvent, { date: '2026-06-21', profile })

    expect(first.cached).toBe(false)
    expect(first.filePath).toContain(`${path.sep}夜航简报${path.sep}`)
    expect(kimi.chatNonStream).toHaveBeenCalledTimes(2)

    const firstCall = (kimi.chatNonStream as any).mock.calls[0][1]
    expect(firstCall.thinking).toEqual({ type: 'enabled', reasoning_effort: 'high' })
    expect(firstCall.messages[0].content).toContain('I follow LLM infrastructure')

    const secondCall = (kimi.chatNonStream as any).mock.calls[1][1]
    expect(secondCall.thinking).toEqual({ type: 'enabled', reasoning_effort: 'high' })
    expect(secondCall.messages[0].content).toContain('"builders"')
    expect(secondCall.messages[0].content).toContain('"name": "A"')

    expect(mockSender.send).toHaveBeenCalledWith('briefing:progress', 'fetching', undefined)
    expect(mockSender.send).toHaveBeenCalledWith('briefing:progress', 'extracting', undefined)
    expect(mockSender.send).toHaveBeenCalledWith('briefing:progress', 'assembling', undefined)
    expect(mockSender.send).toHaveBeenCalledWith('briefing:progress', 'finalizing', undefined)

    expect(first.generatedAt).toBeDefined()

    const second = await ipcHandlers['briefing:generate'](mockEvent, { date: '2026-06-21', profile })
    expect(second.cached).toBe(true)
    expect(second.content.trim()).toBe(first.content.trim())
    expect(second.sources).toEqual(first.sources)
  })

  it('throws FEED_EMPTY when all feeds are empty', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ x: [], podcasts: [], blogs: [] }) })) as any)
    const mockSender = { send: vi.fn(), isDestroyed: () => false }
    const mockEvent = { sender: mockSender }
    await expect(ipcHandlers['briefing:generate'](mockEvent, { date: '2026-06-21', profile })).rejects.toThrow('FEED_EMPTY')
  })

  it('rejects invalid date', async () => {
    const mockSender = { send: vi.fn(), isDestroyed: () => false }
    const mockEvent = { sender: mockSender }
    await expect(ipcHandlers['briefing:generate'](mockEvent, { date: 'not-a-date', profile })).rejects.toThrow('Invalid')
  })

  it('skips X builders with missing or empty tweets instead of crashing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({
        x: [
          { name: 'A', handle: 'a', tweets: [] },
          { name: 'B', handle: 'b' },
          { name: 'C', handle: 'c', tweets: [{ text: 't', url: 'u', createdAt: 'd' }] },
        ],
        podcasts: [],
        blogs: [],
      })
    })) as any)

    vi.spyOn(kimi, 'chatNonStream')
      .mockResolvedValueOnce(JSON.stringify({ builders: [], podcasts: [], blogs: [] }))
      .mockResolvedValueOnce('content')

    const mockSender = { send: vi.fn(), isDestroyed: () => false }
    const mockEvent = { sender: mockSender }
    const result = await ipcHandlers['briefing:generate'](mockEvent, { date: '2026-06-23', profile })
    expect(result.sources).toHaveLength(1)
    expect(result.sources[0].author).toBe('C')
  })

  it('throws ASSEMBLY_ERROR when LLM returns malformed JSON', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({
        x: [{ name: 'A', handle: 'a', tweets: [{ text: 't', url: 'u', createdAt: 'd' }] }],
        podcasts: [],
        blogs: [],
      })
    })) as any)

    vi.spyOn(kimi, 'chatNonStream')
      .mockResolvedValueOnce('not valid json')

    const mockSender = { send: vi.fn(), isDestroyed: () => false }
    const mockEvent = { sender: mockSender }
    await expect(ipcHandlers['briefing:generate'](mockEvent, { date: '2026-06-23', profile }))
      .rejects.toThrow('ASSEMBLY_ERROR')
  })

  it('passes abort signal to both LLM calls', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({
        x: [{ name: 'A', handle: 'a', tweets: [{ text: 't', url: 'u', createdAt: 'd' }] }],
        podcasts: [],
        blogs: [],
      })
    })) as any)

    const chatSpy = vi.spyOn(kimi, 'chatNonStream')
      .mockResolvedValueOnce(JSON.stringify({ builders: [], podcasts: [], blogs: [] }))
      .mockResolvedValueOnce('content')

    const mockSender = { send: vi.fn(), isDestroyed: () => false }
    const mockEvent = { sender: mockSender }
    await ipcHandlers['briefing:generate'](mockEvent, { date: '2026-06-23', profile })

    expect(chatSpy).toHaveBeenCalledTimes(2)
    expect((chatSpy.mock.calls[0][1] as any).signal).toBeInstanceOf(AbortSignal)
    expect((chatSpy.mock.calls[1][1] as any).signal).toBeInstanceOf(AbortSignal)
  })

  it('returns cacheWriteFailed when file write fails', async () => {
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

    const writeSpy = vi.spyOn(fs, 'writeFileSync').mockImplementation((filePath) => {
      if (
        typeof filePath === 'string' &&
        filePath.includes('夜航简报') &&
        !filePath.includes('recovery')
      ) {
        throw new Error('disk full')
      }
    })

    try {
      const mockSender = { send: vi.fn(), isDestroyed: () => false }
      const mockEvent = { sender: mockSender }
      const result = await ipcHandlers['briefing:generate'](mockEvent, { date: '2026-06-24', profile })
      expect(result.cacheWriteFailed).toBe(true)
      expect(result.cached).toBe(false)
    } finally {
      writeSpy.mockRestore()
    }
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

    const mockSender = { send: vi.fn(), isDestroyed: () => false }
    const mockEvent = { sender: mockSender }
    await ipcHandlers['briefing:generate'](mockEvent, { date: '2026-06-22', profile })

    const list = await ipcHandlers['briefing:list'](null)
    expect(list).toHaveLength(1)
    expect(list[0].date).toBe('2026-06-22')
    expect(list[0].filePath).toContain(`${path.sep}夜航简报${path.sep}`)
  })
})

describe('formatDisplayDate', () => {
  it('formats valid date', () => {
    expect(formatDisplayDate('2026-06-23')).toBe('2026 年 6 月 23 日')
  })

  it('returns raw string for invalid date', () => {
    expect(formatDisplayDate('invalid')).toBe('invalid')
    expect(formatDisplayDate('abc-def-ghi')).toBe('abc-def-ghi')
  })
})
