import { useEffect, useState } from 'react'
import { useStore } from '@/store'
import { SurfaceBackground } from '@/components/SurfaceBackground'
import { BriefingListColumn } from '@/components/BriefingListColumn'
import { BriefingReaderControls } from '@/components/briefing/BriefingReaderControls'
import { BriefingSourceSidebar } from '@/components/BriefingSourceSidebar'
import { AnthropicBlogPanel } from '@/components/anthropic/AnthropicBlogPanel'
import { BookPanel } from '@/components/books/BookPanel'
import { WritingListColumn } from '@/components/writing/WritingListColumn'
import { WritingBoard } from '@/components/writing/WritingBoard'
import { WritingWall } from '@/components/writing/WritingWall'
import { NoteBoard } from '@/components/notes/NoteBoard'
import { NotesWall } from '@/components/notes/NotesWall'
import { WritingAssistantPanel } from '@/components/writing-assistant/WritingAssistantPanel'
import {
  ACADEMIC_BODY_STYLES,
  NEWSPAPER_BODY_STYLES,
  ACADEMIC_HEADING_STYLES,
  NEWSPAPER_HEADING_STYLES,
  BRIEFING_LIST_STYLES,
  BRIEFING_QUOTE_SIZES,
} from '@/lib/briefing-font-size'
import { writingRootOf } from '@/lib/writing-tree-utils'

export function Briefing() {
  const theme = useStore((s) => s.briefingTheme)
  const fontSize = useStore((s) => s.briefingFontSize)
  const writingUISize = useStore((s) => s.writingUIFontSize)
  const increaseWritingUI = useStore((s) => s.increaseWritingUIFontSize)
  const decreaseWritingUI = useStore((s) => s.decreaseWritingUIFontSize)
  const htmlDeleteMode = useStore((s) => s.htmlDeleteMode)
  const source = useStore((s) => s.briefingSource)
  const writingTab = useStore((s) => s.writingListTab)
  const writingWallVisible = useStore((s) => s.writingWallVisible)
  const writingFilePath = useStore((s) => s.writingFile?.path)
  const immersive = useStore((s) => s.immersiveMode)
  const exitImmersiveMode = useStore((s) => s.exitImmersiveMode)
  const [dateColumnCollapsed, setDateColumnCollapsed] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  // 切换来源 / 文章 / 章节 / 写作文件时退出沉浸（沉浸状态不跨阅读对象保留）
  const readingKey = useStore((s) => s.briefingSource === 'book'
    ? `book:${s.activeChapter?.path ?? ''}`
    : s.briefingSource === 'writing'
      ? `writing:${s.writingFile?.path ?? ''}`
      : `blog:${s.anthropicReaderFilePath ?? ''}`)
  useEffect(() => {
    if (useStore.getState().immersiveMode) useStore.getState().exitImmersiveMode()
  }, [readingKey])

  useEffect(() => {
    if (!immersive) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') exitImmersiveMode()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [immersive, exitImmersiveMode])

  const isAcademic = theme !== 'newspaper'
  const bodyStyle = isAcademic
    ? ACADEMIC_BODY_STYLES[fontSize]
    : NEWSPAPER_BODY_STYLES[fontSize]
  const headingStyle = isAcademic
    ? ACADEMIC_HEADING_STYLES[fontSize]
    : NEWSPAPER_HEADING_STYLES[fontSize]

  // --briefing-* CSS 变量仍被保留来源消费（AnthropicArticleRow 列表标题、GuideSidebar 导读
  // 字号锚定、markdown.css 正文、Quote 语录），页面级 pageStyle 必须保留。
  const pageStyle = {
    '--briefing-body-size': bodyStyle.size,
    '--briefing-body-weight': String(bodyStyle.weight),
    '--briefing-heading-size': headingStyle.size,
    '--briefing-heading-weight': String(headingStyle.weight),
    '--briefing-list-title-size': BRIEFING_LIST_STYLES[fontSize].title,
    '--briefing-list-meta-size': BRIEFING_LIST_STYLES[fontSize].meta,
    '--briefing-quote-size': BRIEFING_QUOTE_SIZES[fontSize],
  } as React.CSSProperties

  return (
    <div
      data-testid="briefing-page"
      className={`relative h-full flex overflow-hidden ${isAcademic ? 'gap-2 p-2' : 'bg-white'}`}
      style={pageStyle}
    >
      {isAcademic && <SurfaceBackground surface="briefing" />}
      {isAcademic && (
        <div
          data-testid="briefing-dark-overlay"
          className="fixed inset-0 z-[1] bg-[#0c0806]/[0.72] pointer-events-none"
          aria-hidden="true"
        />
      )}

      {!immersive && (
        <BriefingSourceSidebar
          theme={theme}
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed((c) => !c)}
        />
      )}

      <div
        data-testid="briefing-content-shell"
        className="flex-1 flex flex-col min-w-0"
      >
        <div className="flex-1 flex min-h-0">
          {source === 'writing' && !immersive && (
            <BriefingListColumn
              collapsed={dateColumnCollapsed}
              onToggle={() => setDateColumnCollapsed((c) => !c)}
              theme={theme}
              width={64}
              title="文章"
            >
              <WritingListColumn theme={theme} collapsed={dateColumnCollapsed} />
            </BriefingListColumn>
          )}

          <div className="flex-1 flex flex-col min-w-0">
            {source === 'writing' ? (
              <main className="relative z-[5] flex-1 min-h-0">
                <BriefingReaderControls
                  theme={theme}
                  fontSize={writingUISize}
                  onDecrease={() => void decreaseWritingUI()}
                  onIncrease={() => void increaseWritingUI()}
                  swapTestId="briefing-swap-painting-button"
                  fontTestIdPrefix="writing-ui"
                  disabled={htmlDeleteMode}
                  disabledTitle="删除模式下不可调整字号"
                  label="界面字号"
                />
                {(() => {
                  const openRoot = writingFilePath ? writingRootOf(writingFilePath) : null
                  const tabRoot = writingTab === 'articles' ? 'writing' : writingTab === 'repository' ? 'repository' : 'notes'
                  const hasMatchingDocument = openRoot === tabRoot
                  if (tabRoot === 'notes') return hasMatchingDocument ? <NoteBoard /> : <NotesWall />
                  return hasMatchingDocument && !writingWallVisible[tabRoot]
                    ? <WritingBoard />
                    : <WritingWall root={tabRoot} theme={theme} />
                })()}
              </main>
            ) : source === 'book' ? (
              <BookPanel theme={theme} />
            ) : (
              <AnthropicBlogPanel theme={theme} />
            )}
          </div>
        </div>
      </div>

      {source === 'writing' && (
        <WritingAssistantPanel />
      )}
    </div>
  )
}
