import { useEffect } from 'react'
import { useStore } from '@/store'
import { WritingEditor } from './WritingEditor'
import { WritingToolbar } from './WritingToolbar'
import { ACADEMIC_BODY_STYLES } from '@/lib/briefing-font-size'
import type { WritingTone } from '@shared/index'

const TONE_COLORS: Record<WritingTone, string> = {
  parchment: '#e8d5b7',
  plain: '#f5f5f4',
  ink: '#9c9490',
}

export function WritingBoard() {
  const file = useStore(s => s.writingFile)
  const fontSize = useStore(s => s.writingFontSize)
  const tone = useStore(s => s.writingTone)
  const updateWritingBody = useStore(s => s.updateWritingBody)
  const saveWritingFile = useStore(s => s.saveWritingFile)

  // Autosave: debounce 1.5s after body change
  useEffect(() => {
    if (!file?.dirty) return
    const t = setTimeout(() => saveWritingFile(), 1500)
    return () => clearTimeout(t)
  }, [file?.body, file?.dirty])

  // Ctrl+S immediate save
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        saveWritingFile()
      }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])

  if (!file) {
    return (
      <div className="flex items-center justify-center h-full text-parchment/40 text-sm">
        选择一篇文章开始写作，或点击 ＋ 新建
      </div>
    )
  }

  const size = ACADEMIC_BODY_STYLES[fontSize]
  const color = TONE_COLORS[tone]

  return (
    <div className="flex flex-col h-full"
      style={{
        ['--writing-body-size' as string]: size.size,
        ['--writing-body-weight' as string]: size.weight,
        ['--writing-tone-color' as string]: color,
      }}>
      <WritingToolbar />
      {/* Save status indicator */}
      <div className="flex justify-end px-3 py-0.5 border-b border-parchment/10 shrink-0 text-[10px]">
        {file.saving === 'saving' ? <span className="text-parchment/50">保存中…</span>
         : file.saving === 'saved' ? <span className="text-emerald-400/70">已保存 ✓</span>
         : file.saving === 'error' ? <span className="text-red-400/70">保存失败</span>
         : null}
      </div>
      {/* Editor area */}
      <div className="flex-1 overflow-y-auto px-8 py-6"
        style={{ fontSize: 'var(--writing-body-size)', fontWeight: 'var(--writing-body-weight)', color: 'var(--writing-tone-color)' }}>
        <WritingEditor
          initial={file.body}
          onChange={(md) => updateWritingBody(md)}
        />
      </div>
    </div>
  )
}
