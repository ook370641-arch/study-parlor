import { useEffect } from 'react'
import { useStore } from '@/store'
import { WritingEditor } from './WritingEditor'
import { ReadonlyPreview } from './ReadonlyPreview'
import { HtmlPreview } from './HtmlPreview'
import { displayWritingName } from '@/lib/writing-tree-utils'
import { WRITING_BODY_FROM_UI, WRITING_UI_QUOTE_SIZES } from '@/lib/briefing-font-size'

// 对照文宿主：右栏槽位的「对照」模式内容区。
// md → 可编辑 Milkdown（registerToolbarAction={false}，不注册全局 toolbar 单槽）；
// html → iframe 只读预览；其余非 md → 只读预览（分派结构照抄 WritingBoard）。
export function CompanionBoard() {
  const file = useStore(s => s.companionFile)
  const writingUISize = useStore(s => s.writingUIFontSize)
  const briefingTheme = useStore(s => s.briefingTheme)
  const updateCompanionBody = useStore(s => s.updateCompanionBody)
  const saveCompanionFile = useStore(s => s.saveCompanionFile)
  const closeCompanion = useStore(s => s.closeCompanion)

  // Autosave: debounce 1.5s after body change（复刻 WritingBoard 主文模式）
  useEffect(() => {
    if (!file?.dirty) return
    const t = setTimeout(() => saveCompanionFile(), 1500)
    return () => clearTimeout(t)
  }, [file?.body, file?.dirty])

  // 样式变量块照抄 WritingBoard：对照栏与主区排版一致
  const body = WRITING_BODY_FROM_UI[writingUISize]
  // 默认色跟主题走:报纸黑、学术暖米(spec A3)
  const color = briefingTheme === 'newspaper' ? '#1a1a1a' : '#e8d5b7'
  const styleVars = {
    ['--writing-body-size' as string]: body.size,
    ['--writing-body-weight' as string]: body.weight,
    ['--writing-tone-color' as string]: color,
    ['--writing-ui-quote-size' as string]: WRITING_UI_QUOTE_SIZES[writingUISize],
  }

  if (!file) {
    return (
      <div className="flex h-full items-center justify-center px-6" style={styleVars}>
        <p data-testid="companion-empty" className="text-center text-parchment/40 text-xs leading-relaxed">
          点击左侧文件树中的一篇文章，在此展开对照
        </p>
      </div>
    )
  }

  // 头部显示名：取路径末段并去 .md 后缀（兼容 / 与 \）
  const base = file.path.split(/[\\/]/).pop() || file.path
  const display = displayWritingName({ name: base, kind: 'file' })

  return (
    <div data-testid="companion-board" className="flex flex-col h-full min-h-0" style={styleVars}>
      {/* 头部信息行：对照文文件名 + 保存状态（文案复刻主文）+ ✕ 关闭 */}
      <div className="flex items-center gap-2 px-3 h-9 border-b border-parchment/10 shrink-0">
        <span
          data-testid="companion-filename"
          className="truncate text-[11px] min-w-0 font-serif"
          style={{ color: 'var(--writing-tone-color)' }}>
          {display}
        </span>
        <span data-testid="companion-save-status" className="shrink-0 text-[10px]">
          {file.saving === 'saving' ? <span className="text-parchment/50">保存中…</span>
           : file.saving === 'saved' ? <span className="text-emerald-400/70">已保存 ✓</span>
           : file.saving === 'error' ? <span className="text-red-400/70">保存失败</span>
           : null}
        </span>
        <div className="flex-1" />
        <button
          data-testid="companion-close"
          className="text-parchment/60 hover:text-ember text-sm leading-none px-1"
          onClick={() => closeCompanion()}
          aria-label="关闭对照"
        >
          ✕
        </button>
      </div>
      {file.kind === 'md' ? (
        <div
          data-testid="companion-editor"
          className="flex-1 min-h-0 overflow-y-auto px-4 py-4"
          style={{ fontSize: 'var(--writing-body-size)', fontWeight: 'var(--writing-body-weight)', color: 'var(--writing-tone-color)' }}>
          <WritingEditor
            key={file.path}
            initial={file.body}
            onChange={(md) => updateCompanionBody(md)}
            registerToolbarAction={false}
            theme={briefingTheme}
          />
        </div>
      ) : file.kind === 'html' ? (
        <div className="flex-1 min-h-0">
          <HtmlPreview file={{ path: file.path, body: file.body, previewError: file.previewError }} />
        </div>
      ) : (
        <div className="flex-1 min-h-0">
          <ReadonlyPreview file={{
            path: file.path,
            body: file.body,
            kind: file.kind,
            truncated: file.truncated,
            previewError: file.previewError,
          }} />
        </div>
      )}
    </div>
  )
}
