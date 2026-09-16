import { useEffect } from 'react'
import { useStore } from '@/store'
import { WritingTree } from '@/components/writing/WritingTree'
import { WRITING_UI_STYLES } from '@/lib/briefing-font-size'
import type { BriefingTheme } from '@shared/index'

// 博客对照挑选器：对照 tab 下点来源栏「写作」后，替换左栏文章列表展示。
// 主区阅读器保持不动；点文件 = 放入该栏目对照槽（onPickFile 由各面板分派）。
// 写作/仓库两个根平铺展示（两个根都可挑，免 tab 切换）。挑选器只做挑选，
// 不提供新建/重命名/删除（WritingTree 挑选模式已隐藏行内操作）。
export function CompanionWritingPicker({ theme = 'academic', onPickFile }: {
  theme?: BriefingTheme
  onPickFile: (path: string) => void
}) {
  const loadWritingTree = useStore(s => s.loadWritingTree)
  const writingUISize = useStore(s => s.writingUIFontSize)
  const isAcademic = theme !== 'newspaper'

  useEffect(() => { void loadWritingTree() }, [loadWritingTree])

  const noop = () => {}
  const sectionCls = `px-3 pt-3 pb-1 text-[10px] tracking-[0.2em] font-serif ${isAcademic ? 'text-parchment/40' : 'text-[#6b5d52]/60'}`

  // WritingTree 行样式读 --writing-ui-size，与写作页左栏同一来源
  return (
    <div data-testid="companion-writing-picker" className="flex flex-col h-full min-h-0"
      style={{ ['--writing-ui-size' as string]: WRITING_UI_STYLES[writingUISize] }}>
      <p className={`px-3 pt-3 text-[11px] leading-relaxed shrink-0 ${isAcademic ? 'text-parchment/50' : 'text-[#6b5d52]'}`}>
        选择一篇文章放入对照
      </p>
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain pb-3">
        <p className={sectionCls}>文章</p>
        <WritingTree
          root="writing"
          theme={theme}
          inlineNew={null}
          onStartInlineNew={noop}
          onInlineNewChange={noop}
          onInlineNewSubmit={noop}
          onInlineNewCancel={noop}
          onPickFile={onPickFile}
        />
        <p className={sectionCls}>仓库</p>
        <WritingTree
          root="repository"
          theme={theme}
          inlineNew={null}
          onStartInlineNew={noop}
          onInlineNewChange={noop}
          onInlineNewSubmit={noop}
          onInlineNewCancel={noop}
          onPickFile={onPickFile}
        />
      </div>
    </div>
  )
}
