import { useEffect } from 'react'
import { useStore } from '@/store'
import { WritingEditor } from '@/components/writing/WritingEditor'
import { HtmlPreview } from '@/components/writing/HtmlPreview'
import { MarkdownRenderer } from '@/components/md/MarkdownRenderer'
import { ACADEMIC_BODY_STYLES, NEWSPAPER_BODY_STYLES } from '@/lib/briefing-font-size'
import type { BriefingTheme } from '@shared/index'

export function ArticleCompanionBoard({ theme = 'academic' }: { theme?: BriefingTheme }) {
  const file = useStore((s) => s.articleCompanion)
  const updateBody = useStore((s) => s.updateArticleCompanionBody)
  const save = useStore((s) => s.saveArticleCompanion)
  const close = useStore((s) => s.closeArticleCompanion)
  // 对照编辑器字号跟随主区正文（briefingFontSize），避免左右两栏字号不一
  const briefingFontSize = useStore((s) => s.briefingFontSize)
  const isAcademic = theme !== 'newspaper'
  const bodyStyle = isAcademic ? ACADEMIC_BODY_STYLES[briefingFontSize] : NEWSPAPER_BODY_STYLES[briefingFontSize]
  // 报纸版式为浅底，面板配色照抄 GuideSidebar 的 newspaper 分支（墨黑正文 + 暖褐次要）
  const cls = isAcademic
    ? { hint: 'text-parchment/40', border: 'border-parchment/10', filename: 'text-parchment/80', muted: 'text-parchment/50', close: 'text-parchment/60 hover:text-ember', body: 'text-parchment/90' }
    : { hint: 'text-[#6b5d52]/60', border: 'border-[#1a1a1a]/10', filename: 'text-[#1a1a1a]', muted: 'text-[#6b5d52]', close: 'text-[#6b5d52] hover:text-[#8a3a3a]', body: 'text-[#1a1a1a]' }

  useEffect(() => {
    if (!file?.dirty) return
    const t = setTimeout(() => void save(), 1500)
    return () => clearTimeout(t)
  }, [file?.body, file?.dirty])

  if (!file) {
    return (
      <div className="flex h-full items-center justify-center px-6">
        <p data-testid="article-companion-empty" className={`text-center ${cls.hint} text-xs leading-relaxed`}>
          在对照模式下点击左侧文章，在此展开对照
        </p>
      </div>
    )
  }

  const base = file.filePath.split(/[\\/]/).pop() || file.filePath

  return (
    <div data-testid="article-companion-board" className="flex flex-col h-full min-h-0">
      <div className={`flex items-center gap-2 px-3 h-9 border-b ${cls.border} shrink-0`}>
        <span className={`truncate text-[11px] min-w-0 font-serif ${cls.filename}`}>{base}</span>
        <span data-testid="article-companion-save-status" className="shrink-0 text-[10px]">
          {file.saving === 'saving' ? <span className={cls.muted}>保存中…</span>
           : file.saving === 'saved' ? <span className="text-emerald-400/70">已保存 ✓</span>
           : file.saving === 'error' ? <span className="text-red-400/70">保存失败</span> : null}
        </span>
        <div className="flex-1" />
        <button data-testid="article-companion-close" className={`${cls.close} text-sm leading-none px-1`} onClick={() => void close()} aria-label="关闭对照">✕</button>
      </div>
      {file.kind === 'md' && !file.readonly ? (
        <div className={`flex-1 min-h-0 overflow-y-auto px-4 py-4 ${cls.body}`}
          // 不设 fontFamily——继承全局默认（Source Han Sans SC），与写作页原生编辑器同一条
          // 继承路径；字号字重仍跟随主区正文（2026-09-16 用户定锚：字体跟写作页，字号跟正文）
          style={{ fontSize: bodyStyle.size, fontWeight: bodyStyle.weight }}>
          <WritingEditor key={file.filePath} initial={file.body} onChange={(md) => updateBody(md)} registerToolbarAction={false} theme={theme} filePath={file.filePath} />
        </div>
      ) : file.kind === 'html' ? (
        <div className="flex-1 min-h-0"><HtmlPreview file={{ path: file.filePath, body: file.body }} /></div>
      ) : (
        <div className={`flex-1 min-h-0 overflow-y-auto px-4 py-4 ${cls.body}`}
          style={{ fontSize: bodyStyle.size, fontWeight: bodyStyle.weight }}>
          <MarkdownRenderer content={file.body} fileName={base} hideHeader briefingStyle={isAcademic ? 'academic' : 'newspaper'} />
        </div>
      )}
    </div>
  )
}
