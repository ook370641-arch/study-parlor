import { useEffect, useRef, useState } from 'react'
import { useStore } from '@/store'
import { ArticleDivider } from '@/components/article-assistant/ArticleDivider'
import { ChatMessageList } from '@/components/article-assistant/ChatMessageList'

interface Props {
  articlePath: string
  articleTitle?: string
  articleContent: string
}

export function JobAssistantPanel({ articlePath, articleTitle, articleContent }: Props) {
  const session = useStore((s) => s.assistantSession)
  const openAssistantSession = useStore((s) => s.openAssistantSession)
  const persistAssistantState = useStore((s) => s.persistAssistantState)
  const sendAssistantMessage = useStore((s) => s.sendAssistantMessage)
  const retryAssistantMessage = useStore((s) => s.retryAssistantMessage)
  const abortAssistantStream = useStore((s) => s.abortAssistantStream)
  const searchEnabled = useStore((s) => s.assistantSearchEnabled)
  const socraticMode = useStore((s) => s.assistantSocraticMode)
  const thinkingEffort = useStore((s) => s.assistantThinkingEffort)
  const toggleAssistantSearch = useStore((s) => s.toggleAssistantSearch)
  const toggleAssistantSocratic = useStore((s) => s.toggleAssistantSocratic)
  const cycleAssistantThinkingEffort = useStore((s) => s.cycleAssistantThinkingEffort)
  const setAssistantSelection = useStore((s) => s.setAssistantSelection)

  const [open, setOpen] = useState(false)
  const [width, setWidth] = useState(320)
  const [closing, setClosing] = useState(false)
  const closeTimer = useRef<number | null>(null)
  const [input, setInput] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const prevPath = useRef<string | null>(null)

  useEffect(() => () => { if (closeTimer.current) clearTimeout(closeTimer.current) }, [])
  useEffect(() => { if (open) setClosing(false) }, [open])

  // Initialize assistantSession on mount / path change
  useEffect(() => {
    if (prevPath.current !== articlePath) {
      const prev = prevPath.current
      prevPath.current = articlePath
      if (prev && useStore.getState().assistantSession) {
        persistAssistantState()
      }
      openAssistantSession({
        contextId: articlePath,
        contextType: 'briefing',
        articleTitle,
        articleContent,
      })
    }
    return () => {
      persistAssistantState()
    }
  }, [articlePath])

  const requestClose = () => {
    if (closing) return
    setClosing(true)
    closeTimer.current = window.setTimeout(() => setOpen(false), 200)
  }

  const handleSend = () => {
    const text = input.trim()
    if (!text && !session?.pendingSelection) return
    sendAssistantMessage(text)
    setInput('')
    setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }), 50)
  }

  const hasMessages = (session?.messages.length ?? 0) > 0
  const streaming = session?.streaming ?? false
  const lastMsg = session?.messages.at(-1)
  const showError = session?.chatError && !streaming && lastMsg?.role === 'assistant' && lastMsg.content.trim() === ''

  return (
    <div data-testid="job-assistant-panel" className={`relative z-[5] flex h-full shrink-0 ${!open ? '' : (closing ? 'panel-depart' : 'panel-arise')}`}>
      <ArticleDivider
        collapsed={!open}
        onToggleCollapse={() => {
          if (open) {
            requestClose()
          } else {
            setOpen(true)
          }
        }}
        onResize={(w) => {
          const maxWidth = window.innerWidth * 0.45
          if (w < 40) {
            if (open) requestClose()
          } else {
            if (!open) setOpen(true)
            setWidth(Math.max(200, Math.min(w, maxWidth)))
          }
        }}
        theme="academic"
      />
      {open && (
        <div className="h-full overflow-hidden" style={{ width }}>
          <div className="h-full flex flex-col min-w-0 border-l border-parchment/20 bg-[#1a1512]">
            {/* Header */}
            <div className="h-9 flex items-center justify-between px-3 border-b border-parchment/10 shrink-0">
              <span className="text-[11px] tracking-[0.2em] text-parchment/80 font-serif">AI 求职助手</span>
              <button
                data-testid="job-assistant-close-btn"
                className="text-parchment/60 hover:text-ember text-sm leading-none px-1"
                onClick={() => requestClose()}
                aria-label="关闭"
              >
                ✕
              </button>
            </div>

            {/* Messages */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3 text-sm">
              {!hasMessages && (
                <div className="text-parchment/40 text-xs text-center mt-8">
                  选中简报内容后打开面板，或直接输入问题
                </div>
              )}
              <ChatMessageList messages={session?.messages ?? []} streaming={streaming} />
              {streaming && !session?.searchLoading && (
                <div className="text-xs text-parchment/50 animate-pulse">思考中…</div>
              )}
              {session?.searchLoading && streaming && (
                <div className="text-xs text-parchment/50 animate-pulse">搜索并思考中…</div>
              )}
              {showError && (
                <div className="text-xs text-ember/80">
                  回复失败
                  <button className="ml-2 underline hover:text-ember" onClick={() => retryAssistantMessage()}>重试</button>
                </div>
              )}
            </div>

            {/* Pending selection chip */}
            {session?.pendingSelection && (
              <div className="relative mx-2 mb-1 text-xs border-l-2 border-ember bg-ember/10 p-2 pr-6 text-parchment/80 rounded-r shrink-0">
                <div className="opacity-60 mb-1">你选中了：</div>
                "{session.pendingSelection}"
                <button
                  aria-label="取消选中"
                  className="absolute top-1 right-1 text-parchment/50 hover:text-ember leading-none"
                  onClick={() => setAssistantSelection('')}
                >✕</button>
              </div>
            )}

            {/* Input area */}
            <div className="p-2 border-t border-parchment/10 flex items-center gap-1.5 shrink-0">
              <input
                data-testid="job-assistant-input"
                className="flex-1 min-w-0 bg-[#0c0806] border border-parchment/20 rounded px-2 py-1 text-sm text-parchment/90 placeholder:text-parchment/40 outline-none focus:border-ember/50"
                placeholder="问点什么……"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    handleSend()
                  }
                }}
              />
              <button
                data-testid="job-assistant-search-btn"
                className={`px-1.5 py-1 rounded text-sm transition-colors disabled:opacity-30 ${
                  searchEnabled ? 'text-sky-400' : 'text-parchment/40 hover:text-parchment/70'
                }`}
                onClick={toggleAssistantSearch}
                disabled={streaming || (session?.searchLoading ?? false)}
                aria-pressed={searchEnabled}
                title={searchEnabled ? '搜索已开启' : '搜索已关闭'}
              >🔍</button>
              <button
                data-testid="job-assistant-socratic-btn"
                className={`px-1.5 py-1 rounded text-sm transition-colors disabled:opacity-30 ${
                  socraticMode ? 'text-sky-400' : 'text-parchment/40 hover:text-parchment/70'
                }`}
                onClick={toggleAssistantSocratic}
                disabled={streaming || (session?.searchLoading ?? false)}
                aria-pressed={socraticMode}
                title="苏格拉底学习模式"
              >🎓</button>
              <button
                data-testid="job-assistant-thinking-btn"
                className={`relative px-1.5 py-1 rounded text-sm transition-colors disabled:opacity-30 ${
                  thinkingEffort !== 'off' ? 'text-sky-400' : 'text-parchment/40 hover:text-parchment/70'
                }`}
                onClick={cycleAssistantThinkingEffort}
                disabled={streaming || (session?.searchLoading ?? false)}
                title={`深度思考：${thinkingEffort === 'off' ? '关闭' : thinkingEffort === 'high' ? '高' : '最大'}`}
              >
                🧠
                {thinkingEffort === 'max' && (
                  <span className="absolute -top-1 -right-1 text-[8px] leading-none font-bold">MAX</span>
                )}
              </button>
              {streaming ? (
                <button
                  data-testid="job-assistant-stop-btn"
                  className="shrink-0 text-xs text-ember hover:text-ember/80 whitespace-nowrap px-1"
                  onClick={abortAssistantStream}
                >停止</button>
              ) : (
                <button
                  data-testid="job-assistant-send-btn"
                  className="shrink-0 text-xs text-parchment/80 hover:text-ember whitespace-nowrap px-1"
                  onClick={handleSend}
                >发送</button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
