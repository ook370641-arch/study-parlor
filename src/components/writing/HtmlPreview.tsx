import { useMemo, useState } from 'react'
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

export function HtmlPreview({ file }: { file: HtmlFile }) {
  const showToast = useStore(s => s.showToast)
  const writingUISize = useStore(s => s.writingUIFontSize)
  const [opening, setOpening] = useState(false)

  // srcdoc 装配：<base target="_blank">（链接走系统浏览器）+ zoom 注入（随字号档位整页等比缩放）。
  // 沙箱无 allow-same-origin，父进程碰不到内部 DOM，只能在字符串生成期注入。
  // 调档位 → srcdoc 变化 → iframe 整体重载（脚本重跑、滚动回顶），已知取舍见 spec。
  const srcDoc = useMemo(
    () => buildPreviewSrcdoc(file.body, WRITING_HTML_ZOOM[writingUISize]),
    [file.body, writingUISize],
  )

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
      {/* 顶部信息栏：文件名 + 类型徽标 + 系统打开按钮 */}
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
