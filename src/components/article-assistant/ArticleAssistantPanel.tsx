import { useEffect, useRef, useState } from 'react'
import { useStore } from '@/store'
import { GuideSidebar } from './GuideSidebar'
import { ChatWindow } from './ChatWindow'
import { ArticleDivider } from './ArticleDivider'

interface Props {
  articleType: 'briefing' | 'anthropic-article'
  parentPath: string
  articleTitle?: string
  articleContent: string
  showGuide?: boolean
  autoGenerateGuide?: boolean
  theme?: 'academic' | 'newspaper'
}

export function ArticleAssistantPanel({ articleType, parentPath, articleTitle, articleContent, showGuide = true, autoGenerateGuide, theme = 'academic' }: Props) {
  const contextId = useStore((s) => s.assistantSession?.contextId ?? null)
  const isOpen = useStore((s) => s.assistantSession?.isOpen ?? false)
  const hasPendingSelection = useStore((s) => !!s.assistantSession?.pendingSelection)
  const openAssistantSession = useStore((s) => s.openAssistantSession)
  const persistAssistantState = useStore((s) => s.persistAssistantState)
  const setAssistantSelection = useStore((s) => s.setAssistantSelection)
  const toggleAssistantOpen = useStore((s) => s.toggleAssistantOpen)
  const guideWidth = useStore((s) => s.articleAssistantGuideWidth)
  const guideCollapsed = useStore((s) => s.articleAssistantGuideCollapsed)
  const setArticleAssistantGuideWidth = useStore((s) => s.setArticleAssistantGuideWidth)
  const setArticleAssistantGuideCollapsed = useStore((s) => s.setArticleAssistantGuideCollapsed)
  const containerRef = useRef<HTMLDivElement>(null)
  const prevPath = useRef<string | null>(null)
  const [resizing, setResizing] = useState(false)

  // Open session when parentPath changes (or on first mount)
  useEffect(() => {
    if (prevPath.current !== parentPath) {
      const prev = prevPath.current
      prevPath.current = parentPath
      // Persist the previous session before switching, but keep it in memory/disk so it can be restored
      if (prev && useStore.getState().assistantSession) {
        persistAssistantState()
      }
      openAssistantSession({ contextId: parentPath, contextType: articleType, articleTitle, articleContent, autoGenerateGuide })
    }
    return () => {
      // Persist but do NOT close/clear the session, so switching back restores it from memory + disk.
      persistAssistantState()
    }
  }, [parentPath]) // intentionally narrow deps — only remount on path change

  // Listen for text selection in the document
  useEffect(() => {
    const onMouseUp = () => {
      // Small delay to let the selection settle
      setTimeout(() => {
        const sel = window.getSelection()?.toString().trim()
        if (sel && sel.length > 0) {
          setAssistantSelection(sel)
        }
      }, 0)
    }
    document.addEventListener('mouseup', onMouseUp)
    return () => document.removeEventListener('mouseup', onMouseUp)
  }, [setAssistantSelection])

  // Don't render until session is ready for this parentPath
  if (!contextId || contextId !== parentPath) return null

  const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1000
  const sidebarWidth = !showGuide || guideCollapsed ? 0 : Math.max(200, Math.min(guideWidth, viewportWidth * 0.45))

  return (
    <div ref={containerRef} data-testid="article-assistant-panel" className="relative z-[5] flex h-full shrink-0">
      {showGuide && (
        <>
          <ArticleDivider
            collapsed={guideCollapsed}
            onToggleCollapse={() => setArticleAssistantGuideCollapsed(!guideCollapsed)}
            onResize={(width) => {
              const maxWidth = (typeof window !== 'undefined' ? window.innerWidth : 1000) * 0.45
              if (width < 40) {
                setArticleAssistantGuideCollapsed(true)
              } else {
                setArticleAssistantGuideCollapsed(false)
                setArticleAssistantGuideWidth(Math.min(width, maxWidth))
              }
            }}
            onResizeStart={() => setResizing(true)}
            onResizeEnd={() => setResizing(false)}
            theme={theme}
          />
          <div className={`h-full overflow-hidden ${resizing ? '' : 'transition-[width] duration-150 ease-out'}`} style={{ width: sidebarWidth }}>
            <GuideSidebar theme={theme} />
          </div>
        </>
      )}
      {/* Vertical tab to toggle chat window */}
      <button
        data-testid="article-assistant-tab"
        onClick={toggleAssistantOpen}
        className="absolute top-24 z-40 w-6 h-28 bg-ink/80 border border-parchment/20 border-r-0 rounded-l flex items-center justify-center hover:bg-ink/90 transition-colors"
        style={{ right: sidebarWidth }}
        title={isOpen ? '关闭旁注' : '打开旁注'}
      >
        <span
          className="text-[10px] tracking-widest text-parchment/70 select-none"
          style={{ writingMode: 'vertical-rl' }}
        >
          旁注
        </span>
        {hasPendingSelection && !isOpen && (
          <span className="absolute top-1 right-0.5 w-2 h-2 rounded-full bg-ember" />
        )}
      </button>
      <ChatWindow />
    </div>
  )
}
