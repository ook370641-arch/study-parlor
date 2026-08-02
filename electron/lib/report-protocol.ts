import { app, protocol } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { resolveLibraryReportPath, resolveBundledReportDir } from './report-sync'

/**
 * sp-report:// — 本地自包含交互报告的专用协议。
 *
 * 服务顺序：学习库副本（优先）→ 应用内置 asar（回退）。
 * 响应头携带报告专属宽松 CSP，与应用主 CSP 互不干扰。
 */

export const REPORT_SCHEME = 'sp-report'

const REPORT_CSP =
  "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:"

function resolveServingPath(): string {
  const libraryRoot = process.env.STUDY_LIBRARY_PATH
  if (libraryRoot) {
    const libraryPath = resolveLibraryReportPath(libraryRoot)
    if (fs.existsSync(libraryPath)) return libraryPath
  }
  const bundledDir = resolveBundledReportDir(app.getAppPath(), __dirname)
  return path.join(bundledDir, 'index.html')
}

export function registerReportSchemePrivileges(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: REPORT_SCHEME,
      privileges: { standard: true, secure: true, supportFetchAPI: false, stream: true },
    },
  ])
}

export function registerReportProtocol(): void {
  protocol.handle(REPORT_SCHEME, (request) => {
    const url = new URL(request.url)
    const isConstitution =
      url.hostname === 'constitution' && (url.pathname === '/' || url.pathname === '/index.html')
    if (!isConstitution) {
      return new Response('Not Found', { status: 404 })
    }
    const filePath = resolveServingPath()
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
