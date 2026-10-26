import { useState } from 'react'
import { useStore } from '@/store'
import { SurfaceBackground } from '@/components/SurfaceBackground'
import { BriefingListColumn } from '@/components/BriefingListColumn'
import { SwapPaintingButton } from '@/components/SwapPaintingButton'
import { BriefingSourceSidebar } from '@/components/BriefingSourceSidebar'
import { AnthropicBlogPanel } from '@/components/anthropic/AnthropicBlogPanel'
import { WritingListColumn } from '@/components/writing/WritingListColumn'
import { WritingBoard } from '@/components/writing/WritingBoard'
import { NoteBoard } from '@/components/notes/NoteBoard'
import { NotesWall } from '@/components/notes/NotesWall'
import { WritingAssistantPanel } from '@/components/writing-assistant/WritingAssistantPanel'
import { CandlelightLayer } from '@/components/briefing/CandlelightLayer'
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
  const writingFilePath = useStore((s) => s.writingFile?.path)
  const [dateColumnCollapsed, setDateColumnCollapsed] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  const isAcademic = theme !== 'newspaper'
  // 与换画按钮同款（.swap-btn 实底 + backdrop blur），否则背景画作会透进圆钮（2026-10-22 用户反馈）
  const fontSizeBtnCls = isAcademic ? 'swap-btn' : 'swap-btn-newspaper w-9 h-9 flex items-center justify-center'
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

      <BriefingSourceSidebar
        theme={theme}
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((c) => !c)}
      />

      <div
        data-testid="briefing-content-shell"
        className="flex-1 flex flex-col min-w-0"
      >
        <div className="flex-1 flex min-h-0">
          {source === 'writing' && (
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
                <div className="absolute top-4 right-4 z-20 flex items-start gap-1">
                  {isAcademic && (
                    <SwapPaintingButton
                      surface="briefing"
                      data-testid="briefing-swap-painting-button"
                      className="text-parchment/70 hover:text-parchment"
                    />
                  )}
                  <button type="button" data-testid="writing-ui-font-size-decrease"
                    disabled={writingUISize === 'sm' || htmlDeleteMode}
                    onClick={() => void decreaseWritingUI()}
                    className={`text-sm disabled:opacity-20 disabled:cursor-not-allowed ${fontSizeBtnCls}`}
                    title={htmlDeleteMode ? '删除模式下不可调整字号' : '减小界面字号'}>−</button>
                  <button type="button" data-testid="writing-ui-font-size-increase"
                    disabled={writingUISize === '7xl' || htmlDeleteMode}
                    onClick={() => void increaseWritingUI()}
                    className={`text-sm disabled:opacity-20 disabled:cursor-not-allowed ${fontSizeBtnCls}`}
                    title={htmlDeleteMode ? '删除模式下不可调整字号' : '增大界面字号'}>+</button>
                </div>
                {(() => {
                  const openRoot = writingFilePath ? writingRootOf(writingFilePath) : null
                  if (openRoot === 'notes') return <NoteBoard />
                  if (openRoot) return <WritingBoard />
                  // 无打开文件：笔记 tab 落专辑墙
                  return writingTab === 'notes' ? <NotesWall /> : <WritingBoard />
                })()}
              </main>
            ) : (
              <AnthropicBlogPanel theme={theme} />
            )}
          </div>
        </div>
      </div>

      {source === 'writing' && (
        <WritingAssistantPanel />
      )}
      <CandlelightLayer />
    </div>
  )
}
