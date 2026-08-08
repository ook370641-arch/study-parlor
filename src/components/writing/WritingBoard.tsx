import { useEffect } from 'react'
import { useStore } from '@/store'
import { WritingEditor } from './WritingEditor'
import { WritingToolbar } from './WritingToolbar'
import { WRITING_BODY_FROM_UI, WRITING_UI_QUOTE_SIZES } from '@/lib/briefing-font-size'
import { Quote } from '@/components/Quote'
import { PaintingPlate } from '@/components/briefing/PaintingPlate'

export function WritingBoard() {
  const file = useStore(s => s.writingFile)
  const writingUISize = useStore(s => s.writingUIFontSize)
  const briefingTheme = useStore(s => s.briefingTheme)
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
      <div data-testid="writing-board-empty" className="flex items-center justify-center h-full text-parchment/40 text-sm">
        选择一篇文章开始写作，或点击 ＋ 新建
      </div>
    )
  }

  const body = WRITING_BODY_FROM_UI[writingUISize]
  // 默认色跟主题走:报纸黑、学术暖米(spec A3)
  const color = briefingTheme === 'newspaper' ? '#1a1a1a' : '#e8d5b7'

  return (
    <div className="flex flex-col h-full arrive-item"
      style={{
        ['--writing-body-size' as string]: body.size,
        ['--writing-body-weight' as string]: body.weight,
        ['--writing-tone-color' as string]: color,
        ['--writing-ui-quote-size' as string]: WRITING_UI_QUOTE_SIZES[writingUISize],
      }}>
      <WritingToolbar />
      {/* Save status indicator */}
      <div data-testid="writing-save-status" className="flex justify-end px-3 py-0.5 border-b border-parchment/10 shrink-0 text-[10px]">
        {file.saving === 'saving' ? <span className="text-parchment/50">保存中…</span>
         : file.saving === 'saved' ? <span className="text-emerald-400/70">已保存 ✓</span>
         : file.saving === 'error' ? <span className="text-red-400/70">保存失败</span>
         : null}
      </div>
      {/* Editor area */}
      <div data-testid="writing-editor" className="flex-1 min-h-0 overflow-y-auto px-8 py-6"
        style={{ fontSize: 'var(--writing-body-size)', fontWeight: 'var(--writing-body-weight)', color: 'var(--writing-tone-color)' }}>
        {briefingTheme !== 'newspaper' && <PaintingPlate />}
        <div className="flex justify-center mb-4">
          <Quote surface="writing" />
        </div>
        <WritingEditor
          key={file.path}
          initial={file.body}
          onChange={(md) => updateWritingBody(md)}
        />
      </div>
    </div>
  )
}
