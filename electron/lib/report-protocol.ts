import { app, protocol } from 'electron'
import fs from 'node:fs'
import path from 'node:path'

/**
 * sp-report:// — 本地自包含交互报告（如 constitution/index.html）的专用协议。
 *
 * 为什么不用 iframe srcDoc：生产环境页面 CSP 是 script-src 'self'（无
 * unsafe-inline），srcDoc 继承父页面 CSP，报告内联脚本在打包后会被拦截。
 * 走独立协议后，响应头携带报告专属宽松 CSP，与应用主 CSP 互不干扰。
 */

export const REPORT_SCHEME = 'sp-report'

/** 报告专属 CSP：内容全内联，禁一切外部资源加载。 */
const REPORT_CSP =
  "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:"

export function resolveConstitutionReportPath(appPath: string): string {
  return path.join(appPath, 'constitution', 'index.html')
}

/** 必须在 app ready 之前调用（模块顶层）。standard 保证 host 形态 URL 解析。 */
export function registerReportSchemePrivileges(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: REPORT_SCHEME,
      privileges: { standard: true, secure: true, supportFetchAPI: false, stream: true },
    },
  ])
}

/** 必须在 app ready 之后调用（bootstrap 内、createWindow 前）。 */
export function registerReportProtocol(): void {
  protocol.handle(REPORT_SCHEME, (request) => {
    const url = new URL(request.url)
    const isConstitution =
      url.hostname === 'constitution' && (url.pathname === '/' || url.pathname === '/index.html')
    if (!isConstitution) {
      return new Response('Not Found', { status: 404 })
    }
    const filePath = resolveConstitutionReportPath(app.getAppPath())
    try {
      const buf = fs.readFileSync(filePath)
      return new Response(new Uint8Array(buf), {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Content-Security-Policy': REPORT_CSP,
        },
      })
    } catch (err) {
      console.error('[sp-report] constitution report missing at', filePath, err)
      return new Response('Not Found', { status: 404 })
    }
  })
}
