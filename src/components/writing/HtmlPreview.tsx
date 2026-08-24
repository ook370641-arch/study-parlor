import { useEffect, useMemo, useRef, useState } from 'react'
import { ipc } from '@/lib/ipc'
import { useStore } from '@/store'
import { buildPreviewSrcdoc } from '@/lib/html-srcdoc'
import { WRITING_HTML_ZOOM } from '@/lib/briefing-font-size'

type HtmlFile = {
  path: string
  body: string
  previewError?: string
}

// 取路径最后一段作为显示名（兼容 / 与 \）
function basename(path: string): string {
  const parts = path.split(/[\\/]/)
  return parts[parts.length - 1] || path
}

const FLUSH_TIMEOUT_MS = 3000

// deletable: 仅主写作板（WritingBoard）传入；对照槽（CompanionBoard）复用本组件但保持
// 只读，避免两个实例争抢 store 的 flush 注册（spec 2026-08-24 §交互与 UI 出口）。
export function HtmlPreview({ file, deletable }: { file: HtmlFile; deletable?: boolean }) {
  const showToast = useStore(s => s.showToast)
  const writingUISize = useStore(s => s.writingUIFontSize)
  const deleteMode = useStore(s => s.htmlDeleteMode)
  const setHtmlDeleteMode = useStore(s => s.setHtmlDeleteMode)
  const setHtmlDeleteDirty = useStore(s => s.setHtmlDeleteDirty)
  const registerHtmlDeleteFlush = useStore(s => s.registerHtmlDeleteFlush)
  const [opening, setOpening] = useState(false)
  const [saving, setSaving] = useState(false)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  // 组件不随 file.path 重建（无 key），flush 闭包必须经 ref 读最新 file
  const fileRef = useRef(file)
  fileRef.current = file

  // srcdoc 装配：<base target="_blank">（链接走系统浏览器）+ zoom 注入（随字号档位整页等比缩放）
  // + 删除模式脚本（常驻休眠）。沙箱无 allow-same-origin，父进程碰不到内部 DOM，
  // 只能在字符串生成期注入。调档位 → srcdoc 变化 → iframe 整体重载，已知取舍见 spec。
  const srcDoc = useMemo(
    () => buildPreviewSrcdoc(file.body, WRITING_HTML_ZOOM[writingUISize]),
    [file.body, writingUISize],
  )

  // 接收 iframe 回传 dirty。opaque origin 无法校验 origin，只校验 source 是当前 iframe。
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (!iframeRef.current || e.source !== iframeRef.current.contentWindow) return
      const d = e.data as { type?: string } | null
      if (d?.type === 'sp-html-dirty') setHtmlDeleteDirty(true)
    }
    window.addEventListener('message', onMsg)
    return () => window.removeEventListener('message', onMsg)
  }, [setHtmlDeleteDirty])

  // flush：退出删除模式前把删除结果写回文件。返回 false = 失败，调用方应中止后续动作
  // （selectWritingFile 据此中止切换，避免静默丢改动）。
  useEffect(() => {
    if (!deletable) return
    const flush = async (): Promise<boolean> => {
      const st = useStore.getState()
      if (!st.htmlDeleteMode) return true
      const win = iframeRef.current?.contentWindow
      const exitMode = () => {
        win?.postMessage({ type: 'sp-html-edit', on: false }, '*')
        st.setHtmlDeleteMode(false)
        st.setHtmlDeleteDirty(false)
      }
      if (!st.htmlDeleteDirty || !win) { exitMode(); return true }
      setSaving(true)
      try {
        const html = await new Promise<string | null>((resolve) => {
          const onMsg = (e: MessageEvent) => {
            if (e.source !== win) return
            const d = e.data as { type?: string; html?: unknown } | null
            if (d?.type !== 'sp-html-save' || typeof d.html !== 'string') return
            done(d.html)
          }
          const timer = setTimeout(() => done(null), FLUSH_TIMEOUT_MS)
          function done(v: string | null) {
            clearTimeout(timer)
            window.removeEventListener('message', onMsg)
            resolve(v)
          }
          window.addEventListener('message', onMsg)
          win.postMessage({ type: 'sp-html-collect' }, '*')
        })
        if (html === null) {
          showToast('HTML 写回失败：预览无响应，请重试')
          return false
        }
        const f = fileRef.current
        const out = (/^\s*<!doctype/i.test(f.body) ? '<!DOCTYPE html>\n' : '') + html
        const r = await ipc.writingSaveHtml({ path: f.path, html: out })
        if (!r.ok) {
          showToast('HTML 写回失败: ' + r.message)
          return false
        }
        exitMode()
        return true
      } finally {
        setSaving(false)
      }
    }
    registerHtmlDeleteFlush(flush)
    return () => registerHtmlDeleteFlush(null)
  }, [deletable, registerHtmlDeleteFlush, showToast])

  const enterDeleteMode = () => {
    setHtmlDeleteMode(true)
    iframeRef.current?.contentWindow?.postMessage({ type: 'sp-html-edit', on: true }, '*')
  }
  const doneDeleteMode = async () => {
    const flush = useStore.getState().htmlDeleteFlush
    if (flush) await flush()
  }

  // 核心兜底入口：调系统默认程序打开原始文件
  const handleOpen = async () => {
    if (opening) return
    setOpening(true)
    try {
      const r = await ipc.writingOpenInSystem({ path: file.path })
      if (!r.ok) showToast(r.message || '打开失败')
    } catch (err) {
      showToast('打开失败: ' + (err instanceof Error ? err.message : String(err)))
    } finally {
      setOpening(false)
    }
  }

  return (
    <div data-testid="writing-html-preview" className="flex flex-col h-full min-h-0">
      {/* 顶部信息栏：文件名 + 类型徽标 + 删除模式 + 系统打开按钮 */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-parchment/10 shrink-0">
        <span
          data-testid="writing-preview-filename"
          className="truncate text-sm min-w-0"
          style={{ color: 'var(--writing-tone-color)' }}>
          {basename(file.path)}
        </span>
        <span
          data-testid="writing-preview-kind"
          className="shrink-0 px-1.5 py-0.5 rounded text-[10px] border border-parchment/20 text-parchment/60">
          HTML
        </span>
        <div className="flex-1" />
        {deletable && !file.previewError && (
          deleteMode ? (
            <>
              <span data-testid="writing-html-deleting-badge" className="shrink-0 text-[10px] text-ember/80">
                删除中：点击块删除，Ctrl+Z 撤销
              </span>
              <button
                data-testid="writing-html-delete-done"
                onClick={() => void doneDeleteMode()}
                disabled={saving}
                className="shrink-0 px-2.5 py-1 text-xs text-ember border border-ember/40 rounded hover:bg-ember/10 disabled:opacity-50 transition-colors">
                {saving ? '写回中…' : '完成'}
              </button>
            </>
          ) : (
            <button
              data-testid="writing-html-delete-enter"
              onClick={enterDeleteMode}
              className="shrink-0 px-2.5 py-1 text-xs text-parchment/70 border border-parchment/25 rounded hover:bg-parchment/10 transition-colors"
              title="进入删除模式：点击正文中的块将其删除，完成时自动写回">
              删除模式
            </button>
          )
        )}
        <button
          data-testid="writing-preview-open"
          onClick={handleOpen}
          disabled={opening}
          className="shrink-0 px-2.5 py-1 text-xs text-ember border border-ember/40 rounded hover:bg-ember/10 disabled:opacity-50 transition-colors">
          {opening ? '打开中…' : '用系统程序打开'}
        </button>
      </div>

      {/* 内容区：iframe srcdoc 沙箱渲染；出错时展示错误文案 + 系统打开兜底 */}
      {file.previewError ? (
        <div
          data-testid="writing-preview-error"
          className="flex-1 min-h-0 flex flex-col items-center justify-center gap-3 text-sm text-parchment/60 text-center px-8">
          <p>{file.previewError.includes('文件过大') ? '文件过大，无法在应用内预览，请用系统程序打开' : '文件读取失败'}</p>
          <button
            data-testid="writing-preview-error-open"
            onClick={handleOpen}
            disabled={opening}
            className="px-2.5 py-1 text-xs text-ember border border-ember/40 rounded hover:bg-ember/10 disabled:opacity-50 transition-colors">
            {opening ? '打开中…' : '用系统程序打开'}
          </button>
        </div>
      ) : (
        <iframe
          ref={iframeRef}
          onLoad={() => {
            if (useStore.getState().htmlDeleteMode) {
              iframeRef.current?.contentWindow?.postMessage({ type: 'sp-html-edit', on: true }, '*')
            }
          }}
          data-testid="writing-html-preview-iframe"
          title={basename(file.path)}
          // allow-popups:srcdoc 注入 <base target="_blank">,点击链接是弹窗请求,
          // 缺 allow-popups 会被沙箱静默拦截(点了没反应);弹窗由 main.ts
          // setWindowOpenHandler 拦截并路由到系统浏览器(与 ConstitutionReportView 同一模式)
          sandbox="allow-scripts allow-popups"
          srcDoc={srcDoc}
          className="flex-1 min-h-0 w-full border-0 bg-white"
        />
      )}
    </div>
  )
}
