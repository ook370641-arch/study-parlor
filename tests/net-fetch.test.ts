import { describe, expect, it, vi, beforeEach } from 'vitest'

// net-fetch.ts 依赖 electron.net——在单测中 mock，避免真调 Electron
vi.mock('electron', () => ({ net: { fetch: vi.fn() } }))

import { net } from 'electron'
import { httpFetchWithRetry } from '../electron/lib/net-fetch'

const mockFetch = net.fetch as unknown as ReturnType<typeof vi.fn>

function res(ok: boolean, status: number): Response {
  return { ok, status } as Response
}

describe('httpFetchWithRetry', () => {
  beforeEach(() => mockFetch.mockReset())

  it('429 → 退避重试 → 200 成功', async () => {
    mockFetch.mockResolvedValueOnce(res(false, 429)).mockResolvedValueOnce(res(true, 200))
    const r = await httpFetchWithRetry('https://x.com/a', { attempts: 3, retryDelayMs: 1 })
    expect(r.status).toBe(200)
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })

  it('持续 5xx → 抛错（不无限重试）', async () => {
    mockFetch.mockResolvedValue(res(false, 503))
    await expect(httpFetchWithRetry('https://x.com/b', { attempts: 2, retryDelayMs: 1 })).rejects.toThrow('HTTP 503')
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })

  it('404 确定性失败不重试', async () => {
    mockFetch.mockResolvedValue(res(false, 404))
    const r = await httpFetchWithRetry('https://x.com/c', { attempts: 3, retryDelayMs: 1 })
    expect(r.status).toBe(404)
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('网络异常重试后成功', async () => {
    mockFetch.mockRejectedValueOnce(new Error('network down')).mockResolvedValueOnce(res(true, 200))
    const r = await httpFetchWithRetry('https://x.com/d', { attempts: 2, retryDelayMs: 1 })
    expect(r.status).toBe(200)
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })
})
