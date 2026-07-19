import { useRef, useState } from 'react'
import { useStore } from '@/store'
import { ResizeHandles } from './ResizeHandles'

const MIN_W = 260
const MIN_H = 180
const DEFAULT_W = 340
const DEFAULT_H = 260

export function ChatWindow() {
  const session = useStore((s) => s.assistantSession)
  const sendAssistantMessage = useStore((s) => s.sendAssistantMessage)
  const retryAssistantMessage = useStore((s) => s.retryAssistantMessage)
  const abortAssistantStream = useStore((s) => s.abortAssistantStream)
  const toggleAssistantOpen = useStore((s) => s.toggleAssistantOpen)
  const searchEnabled = useStore((s) => s.assistantSearchEnabled)
  const socraticMode = useStore((s) => s.assistantSocraticMode)
  const thinkingEffort = useStore((s) => s.assistantThinkingEffort)
  const toggleAssistantSearch = useStore((s) => s.toggleAssistantSearch)
  const toggleAssistantSocratic = useStore((s) => s.toggleAssistantSocratic)
  const cycleAssistantThinkingEffort = useStore((s) => s.cycleAssistantThinkingEffort)

  const [input, setInput] = useState('')
  const [size, setSize] = useState({ width: DEFAULT_W, height: DEFAULT_H })
  const [position, setPosition] = useState<{ x?: number; y?: number }>({})
  const dragging = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  if (!session || !session.isOpen) return null

  const handleSend = () => {
    const text = input.trim()
    if (!text && !session.pendingSelection) return
    sendAssistantMessage(text)
    setInput('')
    // scroll to bottom after render
    setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }), 50)
  }

  const handleDragStart = (e: React.PointerEvent) => {
    const el = (e.target as HTMLElement).closest('[data-chat-window]') as HTMLElement | null
    if (!el) return
    const rect = el.getBoundingClientRect()
    dragging.current = {
      startX: e.clientX,
      startY: e.clientY,
      originX: rect.left,
      originY: rect.top,
    }
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)

    const onMove = (ev: PointerEvent) => {
      if (!dragging.current) return
      const rawX = dragging.current.originX + (ev.clientX - dragging.current.startX)
      const rawY = dragging.current.originY + (ev.clientY - dragging.current.startY)
      // 夹取位置，保证标题栏（唯一拖拽把手）始终可达：
      // top 不允许为负，否则把手滑到原生标题栏上方，窗口永远无法再拖回
      setPosition({
        x: Math.min(Math.max(rawX, -(rect.width - 80)), window.innerWidth - 80),
        y: Math.min(Math.max(rawY, 0), window.innerHeight - 40),
      })
    }
    const onUp = () => {
      ;(e.target as HTMLElement).releasePointerCapture(e.pointerId)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      dragging.current = null
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const hasMessages = session.messages.length > 0
  const lastMsg = session.messages.at(-1)
  const showError = session.chatError && !session.streaming && lastMsg?.role === 'assistant' && lastMsg.content.trim() === ''

  return (
    <div
      data-chat-window
      data-testid="article-assistant-chat-window"
      className="fixed z-50 flex flex-col border border-parchment/20 bg-[#1a1512] shadow-2xl rounded-sm"
      style={{
        width: Math.max(MIN_W, size.width),
        height: Math.max(MIN_H, size.height),
        right: position.x === undefined ? 24 : undefined,
        bottom: position.y === undefined ? 24 : undefined,
        left: position.x,
        top: position.y,
      }}
    >
      {/* Title bar - draggable */}
      <div
        className="h-9 flex items-center justify-between px-3 border-b border-parchment/10 cursor-move select-none shrink-0"
        onPointerDown={handleDragStart}
      >
        <span className="text-[11px] tracking-[0.2em] text-parchment/80 font-serif">旁注 · MARGIN</span>
        <button
          className="text-parchment/60 hover:text-ember text-sm leading-none px-1"
          onClick={toggleAssistantOpen}
          aria-label="关闭"
        >
          ✕
        </button>
      </div>

      {/* Messages area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3 text-sm">
        {!hasMessages && !session.pendingSelection && (
          <div className="text-parchment/40 text-xs text-center mt-8">
            选中文章内容后点击旁注 tab，或直接输入问题
          </div>
        )}

        {session.pendingSelection && (
          <div className="text-xs border-l-2 border-ember bg-ember/10 p-2 text-parchment/80 rounded-r">
            <div className="opacity-60 mb-1">你选中了：</div>
            "{session.pendingSelection}"
          </div>
        )}

        {session.messages.map((m, i) => (
          <div key={i}>
            <div className={`text-[11px] tracking-wider mb-0.5 ${m.role === 'user' ? 'text-ember' : 'text-parchment/50'}`}>
              {m.role === 'user' ? '你' : '旁注'}
            </div>
            <div className={`leading-relaxed whitespace-pre-wrap ${m.role === 'user' ? 'text-parchment/80' : 'text-parchment/90'}`}>
              {m.content || (m.role === 'assistant' && session.streaming ? '…' : '')}
            </div>
            {m.searchSources && m.searchSources.length > 0 && (
              <div className="text-[11px] text-parchment/50 mt-1">
                已搜索 {m.searchSources.length} 个来源
              </div>
            )}
          </div>
        ))}

        {session.streaming && !session.searchLoading && (
          <div className="text-xs text-parchment/50 animate-pulse">思考中…</div>
        )}
        {session.searchLoading && session.streaming && (
          <div className="text-xs text-parchment/50 animate-pulse">搜索并思考中…</div>
        )}

        {showError && (
          <div className="text-xs text-ember/80">
            回复失败
            <button
              className="ml-2 underline hover:text-ember"
              onClick={() => retryAssistantMessage()}
            >
              重试
            </button>
          </div>
        )}
      </div>

      {/* Input area */}
      <div className="p-2 border-t border-parchment/10 flex items-center gap-1.5 shrink-0">
        <button
          data-testid="article-assistant-search-btn"
          className={`px-1.5 py-1 rounded text-sm transition-colors duration-200 disabled:opacity-30 disabled:cursor-not-allowed ${
            searchEnabled ? 'text-sky-400' : 'text-parchment/40 hover:text-parchment/70'
          }`}
          onClick={toggleAssistantSearch}
          disabled={session.streaming || session.searchLoading}
          aria-pressed={searchEnabled}
          aria-label={searchEnabled ? '搜索已开启' : '搜索已关闭'}
          title={searchEnabled ? '搜索已开启 — 发送时将联网搜索' : '搜索已关闭 — 点击开启联网搜索'}
        >
          {session.searchLoading ? (
            <span className="inline-block w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin align-middle" />
          ) : (
            '🔍'
          )}
        </button>
        <button
          data-testid="article-assistant-socratic-btn"
          className={`px-1.5 py-1 rounded text-sm transition-colors duration-200 disabled:opacity-30 disabled:cursor-not-allowed ${
            socraticMode ? 'text-sky-400' : 'text-parchment/40 hover:text-parchment/70'
          }`}
          onClick={toggleAssistantSocratic}
          disabled={session.streaming || session.searchLoading}
          aria-pressed={socraticMode}
          aria-label={socraticMode ? '苏格拉底模式已开启' : '苏格拉底模式已关闭'}
          title="苏格拉底学习模式：关闭后只做信息检索，不再质询"
        >
          🎓
        </button>
        <button
          data-testid="article-assistant-thinking-btn"
          className={`relative px-1.5 py-1 rounded text-sm transition-colors duration-200 disabled:opacity-30 disabled:cursor-not-allowed ${
            thinkingEffort !== 'off' ? 'text-sky-400' : 'text-parchment/40 hover:text-parchment/70'
          }`}
          onClick={cycleAssistantThinkingEffort}
          disabled={session.streaming || session.searchLoading}
          aria-label={`深度思考：${thinkingEffort === 'off' ? '关闭' : thinkingEffort === 'high' ? '高' : '最高'}`}
          title={`深度思考：${thinkingEffort === 'off' ? '关闭' : thinkingEffort === 'high' ? '高' : '最高（MAX）'} — 点击切换`}
        >
          🧠
          {thinkingEffort === 'max' && (
            <span className="absolute -top-1 -right-1 text-[8px] leading-none font-bold">MAX</span>
          )}
        </button>
        <input
          data-testid="article-assistant-input"
          className="flex-1 bg-[#0c0806] border border-parchment/20 rounded px-2 py-1 text-sm text-parchment/90 placeholder:text-parchment/40 outline-none focus:border-ember/50"
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
        {session.streaming ? (
          <button
            data-testid="article-assistant-stop-btn"
            className="text-xs text-ember hover:text-ember/80 whitespace-nowrap px-1"
            onClick={abortAssistantStream}
          >
            停止
          </button>
        ) : (
          <button
            data-testid="article-assistant-send-btn"
            className="text-xs text-parchment/80 hover:text-ember whitespace-nowrap px-1"
            onClick={() => handleSend()}
          >
            发送
          </button>
        )}
      </div>

      <ResizeHandles
        onResize={(delta) =>
          setSize({ width: Math.max(MIN_W, delta.width), height: Math.max(MIN_H, delta.height) })
        }
      />
    </div>
  )
}
