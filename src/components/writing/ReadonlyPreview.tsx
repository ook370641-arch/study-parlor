import { useState } from 'react'
import { ipc } from '@/lib/ipc'
import { useStore } from '@/store'
import { MarkdownContent } from '@/components/md/MarkdownContent'

type PreviewFile = {
  path: string
  body: string
  kind: 'xlsx' | 'pdf' | 'docx'
  truncated?: boolean
  previewError?: string
}

const KIND_LABEL: Record<PreviewFile['kind'], string> = {
  xlsx: 'XLSX',
  pdf: 'PDF',
  docx: 'DOCX',
}

// 取路径最后一段作为显示名（兼容 / 与 \）
function basename(path: string): string {
  const parts = path.split(/[\\/]/)
  return parts[parts.length - 1] || path
}

export function ReadonlyPreview({ file }: { file: PreviewFile }) {
  const showToast = useStore(s => s.showToast)
  const [opening, setOpening] = useState(false)

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

  const isPdfNoText = file.previewError === 'PDF_NO_TEXT'

  return (
    <div data-testid="writing-readonly-preview" className="flex flex-col h-full min-h-0">
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
          {KIND_LABEL[file.kind]}
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

      {/* 内容区：预览 markdown；出错时只展示错误文案 */}
      <div
        data-testid="writing-preview-content"
        className="flex-1 min-h-0 overflow-y-auto px-8 py-6"
        style={{
          fontSize: 'var(--writing-body-size)',
          fontWeight: 'var(--writing-body-weight)',
          color: 'var(--writing-tone-color)',
        }}>
        {file.previewError ? (
          <div
            data-testid="writing-preview-error"
            className="flex flex-col items-center justify-center h-full gap-3 text-sm text-parchment/60 text-center">
            {isPdfNoText ? (
              <p>该 PDF 无文本层（可能是扫描件），无法在应用内预览，请用系统程序打开</p>
            ) : (
              <p>文件解析失败</p>
            )}
            {/* 两种错误都提供系统打开兜底（扫描 PDF 尤需此入口） */}
            <button
              data-testid="writing-preview-error-open"
              onClick={handleOpen}
              disabled={opening}
              className="px-2.5 py-1 text-xs text-ember border border-ember/40 rounded hover:bg-ember/10 disabled:opacity-50 transition-colors">
              {opening ? '打开中…' : '用系统程序打开'}
            </button>
          </div>
        ) : (
          <>
            <MarkdownContent children={file.body} />
            {file.truncated && (
              <p
                data-testid="writing-preview-truncated"
                className="mt-4 text-xs text-parchment/50">
                内容较多，仅预览部分内容
              </p>
            )}
          </>
        )}
      </div>
    </div>
  )
}
