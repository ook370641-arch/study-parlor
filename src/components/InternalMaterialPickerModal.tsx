import { useState } from 'react'
import { CompanionWritingPicker } from '@/components/article-assistant/CompanionWritingPicker'
import { ipc } from '@/lib/ipc'
import type { BriefingTheme, LocalMaterial } from '@shared/index'

const TEXT_MATERIAL_EXTENSIONS = new Set(['md', 'markdown', 'txt'])
const LOCAL_MATERIAL_MAX_BYTES = 512 * 1024

export function InternalMaterialPickerModal({ theme = 'academic', onSelect, onClose }: {
  theme?: BriefingTheme
  onSelect: (material: LocalMaterial) => void
  onClose: () => void
}) {
  const isAcademic = theme !== 'newspaper'
  const [reading, setReading] = useState(false)
  const [error, setError] = useState('')

  const pick = async (path: string) => {
    if (reading) return
    const extension = path.split('.').pop()?.toLowerCase() ?? ''
    if (!TEXT_MATERIAL_EXTENSIONS.has(extension)) {
      setError('仅支持 Markdown / TXT 资料')
      return
    }
    setReading(true)
    setError('')
    try {
      const result = await ipc.writingRead({ path })
      if (!result.ok) throw new Error(result.message)
      const content = result.value.body
      if (new TextEncoder().encode(content).byteLength > LOCAL_MATERIAL_MAX_BYTES) {
        throw new Error('文件过大，单份资料上限 512KB')
      }
      onSelect({ name: path.split('/').pop() ?? path, content })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setReading(false)
    }
  }

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center ${isAcademic ? 'bg-ink/80' : 'bg-black/20'}`}
      onClick={event => { event.stopPropagation(); onClose() }}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="从学习库选择资料"
        data-testid="internal-material-picker"
        className={`flex h-[65vh] w-[560px] max-w-[90vw] flex-col overflow-hidden rounded-xl border shadow-2xl ${isAcademic ? 'border-slate/25 bg-[#211915] text-parchment' : 'border-[#1a1a1a]/15 bg-[#f7f3ed] text-[#2a1f1a]'}`}
        onClick={event => event.stopPropagation()}
      >
        <div className={`flex shrink-0 items-center border-b px-5 py-4 ${isAcademic ? 'border-parchment/10' : 'border-[#1a1a1a]/10'}`}>
          <div>
            <h2 className="font-serif text-base">从学习库选择资料</h2>
            <p className={`mt-1 text-xs ${isAcademic ? 'text-parchment/45' : 'text-[#777]'}`}>选中后直接作为本次学习的内部资料</p>
          </div>
          <button type="button" aria-label="关闭资料选择" onClick={onClose} className={`ml-auto px-2 text-lg ${isAcademic ? 'text-parchment/50 hover:text-parchment' : 'text-[#777] hover:text-[#1a1a1a]'}`}>✕</button>
        </div>
        {error && <div role="alert" className="shrink-0 bg-red-500/10 px-5 py-2 text-xs text-red-400">{error}</div>}
        <div className="relative min-h-0 flex-1">
          <CompanionWritingPicker
            theme={theme}
            writingLabel="资料"
            emptyHint="从笔记、仓库或资料中选择一篇，正文会注入本次学习上下文"
            onPickFile={path => { void pick(path) }}
          />
          {reading && <div className={`absolute inset-0 flex items-center justify-center text-sm ${isAcademic ? 'bg-ink/60 text-parchment/80' : 'bg-white/60 text-[#555]'}`}>读取中…</div>}
        </div>
      </div>
    </div>
  )
}
