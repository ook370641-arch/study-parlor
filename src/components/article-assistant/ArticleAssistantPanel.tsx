import { useEffect, useRef } from 'react'
import { useStore } from '@/store'
import { GuideSidebar } from './GuideSidebar'
import { ChatWindow } from './ChatWindow'

interface Props {
  articleType: 'briefing' | 'anthropic-article'
  parentPath: string
  articleTitle?: string
  articleContent: string
}

export function ArticleAssistantPanel({ articleType, parentPath, articleTitle, articleContent }: Props) {
  const session = useStore((s) => s.assistantSession)
  const openAssistantSession = useStore((s) => s.openAssistantSession)
  const closeAssistantSession = useStore((s) => s.closeAssistantSession)
  const setAssistantSelection = useStore((s) => s.setAssistantSelection)
  const toggleAssistantOpen = useStore((s) => s.toggleAssistantOpen)
  const prevPath = useRef<string | null>(null)

  // Open session when parentPath changes (or on first mount)
  useEffect(() => {
    if (prevPath.current !== parentPath) {
      prevPath.current = parentPath
      // Close old session if switching articles
      if (session && session.contextId !== parentPath) {
        closeAssistantSession()
      }
      openAssistantSession({ contextId: parentPath, contextType: articleType, articleTitle, articleContent })
    }
    return () => {
      // Save on unmount (page navigation)
      closeAssistantSession()
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
  if (!session || session.contextId !== parentPath) return null

  return (
    <>
      <GuideSidebar />
      {/* Vertical tab to toggle chat window */}
      <button
        data-testid="article-assistant-tab"
        onClick={toggleAssistantOpen}
        className="absolute right-80 top-24 z-40 w-6 h-28 bg-ink/80 border border-parchment/20 border-r-0 rounded-l flex items-center justify-center hover:bg-ink/90 transition-colors"
        title={session.isOpen ? '关闭旁注' : '打开旁注'}
      >
        <span
          className="text-[10px] tracking-widest text-parchment/70 select-none"
          style={{ writingMode: 'vertical-rl' }}
        >
          旁注
        </span>
        {session.pendingSelection && !session.isOpen && (
          <span className="absolute top-1 right-0.5 w-2 h-2 rounded-full bg-ember" />
        )}
      </button>
      <ChatWindow />
    </>
  )
}
