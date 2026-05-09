import { useEffect, useState } from 'react'
import { ipc } from '@/lib/ipc'

type Props = {
  dirName: string
  sessionNumber: number
  fileName: string
  title: string
  onClose: () => void
}

export function SessionViewer({ dirName, sessionNumber, fileName, title, onClose }: Props) {
  const [content, setContent] = useState<string | null>(null)
  const [mimeType, setMimeType] = useState<string>('text/markdown')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    ipc.readSessionFile({ dirName, sessionNumber, fileName })
      .then((res) => {
        if (cancelled) return
        setContent(res.content)
        setMimeType(res.mimeType ?? 'text/markdown')
      })
      .catch((err) => {
        if (cancelled) return
        setError(err?.message ?? '读取失败')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [dirName, sessionNumber, fileName])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="w-[800px] max-w-[90vw] max-h-[80vh] flex flex-col bg-ink border border-slate/40 rounded-md overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate/30 shrink-0">
          <span className="font-serif text-parchment/90 truncate">{title}</span>
          <button
            onClick={onClose}
            className="text-parchment/50 hover:text-parchment transition-colors text-lg leading-none px-2"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto p-4 min-h-0">
          {loading && (
            <div className="text-center text-parchment/50 font-sans text-sm py-8">
              <span className="inline-block w-4 h-4 border-2 border-parchment/30 border-t-ember rounded-full animate-spin mr-2 align-middle" />
              加载中...
            </div>
          )}

          {error && (
            <div className="text-center text-wine font-sans text-sm py-8">
              {error}
            </div>
          )}

          {!loading && !error && mimeType.startsWith('image/') && content && (
            <img
              src={`data:${mimeType};base64,${content}`}
              alt={title}
              className="max-w-full h-auto mx-auto"
            />
          )}

          {!loading && !error && !mimeType.startsWith('image/') && content && (
            <pre className="whitespace-pre-wrap text-sm text-parchment/80 font-sans leading-relaxed">
              {content}
            </pre>
          )}
        </div>
      </div>
    </div>
  )
}
