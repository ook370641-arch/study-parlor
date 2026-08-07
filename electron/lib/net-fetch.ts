import { net } from 'electron'

/**
 * 主进程统一 HTTP 入口：走 Chromium 网络栈，自动跟随系统代理/VPN。
 * （node 原生 fetch 不走系统代理，claude.com 在直连下不可达。）
 * 单测用 vi.mock('../electron/lib/net-fetch') 替换。
 */
export function httpFetch(url: string): Promise<Response> {
  return net.fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })
}
