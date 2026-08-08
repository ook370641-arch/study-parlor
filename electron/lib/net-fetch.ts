import { net } from 'electron'

/**
 * 主进程统一 HTTP 入口：走 Chromium 网络栈，自动跟随系统代理/VPN。
 * （node 原生 fetch 不走系统代理，claude.com 在直连下不可达。）
 * 单测用 vi.mock('../electron/lib/net-fetch') 替换。
 */
export function httpFetch(url: string): Promise<Response> {
  return net.fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })
}

/**
 * 带退避重试的 HTTP 获取。仅对瞬时限流/服务器错误（429、5xx）与网络异常重试；
 * 其他 4xx（404 等）视为确定性失败不重试。元数据回填以并发打多站点，限流是常态。
 */
export async function httpFetchWithRetry(
  url: string,
  opts: { attempts?: number; retryDelayMs?: number } = {}
): Promise<Response> {
  const attempts = Math.max(opts.attempts ?? 3, 1)
  const retryDelayMs = opts.retryDelayMs ?? 1000
  let lastErr: Error | null = null
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const res = await httpFetch(url)
      if (res.ok) return res
      if (res.status === 429 || res.status >= 500) {
        lastErr = new Error(`HTTP ${res.status}`)
      } else {
        return res
      }
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err))
    }
    if (attempt < attempts - 1) {
      await new Promise((r) => setTimeout(r, retryDelayMs * (attempt + 1)))
    }
  }
  throw lastErr ?? new Error(`fetch failed after ${attempts} attempts`)
}
