import { useEffect, useRef, useState } from 'react'
import { useStore } from '@/store'
import { ANNOTATION_NOTE_SIZES, ANNOTATION_UI_SIZES } from '@/lib/briefing-font-size'
import { ResizeHandles } from './ResizeHandles'
import { ChatMessageList } from './ChatMessageList'

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
  const setAssistantSelection = useStore((s) => s.setAssistantSelection)
  const briefingFontSize = useStore((s) => s.briefingFontSize)
  const bodySize = ANNOTATION_NOTE_SIZES[briefingFontSize]
  const uiSmall = ANNOTATION_UI_SIZES[briefingFontSize].small

  const [input, setInput] = useState('')
  const searchError = session?.searchError ?? null
  const [searchErrorDismissed, setSearchErrorDismissed] = useState(false)
  useEffect(() => { if (searchError) setSearchErrorDismissed(false) }, [searchError])
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

    // 拖拽期间只写 transform（不触发 React 重渲），松手时一次性提交 left/top。
    // clamp：标题栏不拖出视口（上 0 / 下 innerHeight-40 / 左右各留 80px 抓取区）。
    const clampPos = (x: number, y: number) => ({
      x: Math.max(-(rect.width - 80), Math.min(x, window.innerWidth - 80)),
      y: Math.max(0, Math.min(y, window.innerHeight - 40)),
    })
    const onMove = (ev: PointerEvent) => {
      if (!dragging.current) return
      const p = clampPos(
        dragging.current.originX + (ev.clientX - dragging.current.startX),
        dragging.current.originY + (ev.clientY - dragging.current.startY)
      )
      el.style.transform = `translate(${p.x - dragging.current.originX}px, ${p.y - dragging.current.originY}px)`
    }
    const onUp = (ev: PointerEvent) => {
      ;(e.target as HTMLElement).releasePointerCapture(e.pointerId)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      if (dragging.current) {
        const p = clampPos(
          dragging.current.originX + (ev.clientX - dragging.current.startX),
          dragging.current.originY + (ev.clientY - dragging.current.startY)
        )
        el.style.transform = ''
        setPosition({ x: p.x, y: p.y })
      }
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
        <span className="tracking-[0.2em] text-parchment/80 font-serif" style={{ fontSize: uiSmall }}>旁注 · MARGIN</span>
        <button
          className="text-parchment/60 hover:text-ember text-sm leading-none px-1"
          onClick={toggleAssistantOpen}
          aria-label="关闭"
        >
          ✕
        </button>
      </div>

      {searchError && !searchErrorDismissed && (
        <div data-testid="assistant-search-error" className="mx-2 mt-2 flex items-center gap-2 rounded border border-ember/40 bg-ember/10 px-2 py-1 text-parchment/80 shrink-0" style={{ fontSize: uiSmall }}>
          <span className="flex-1">网络搜索失败，本次回复未联网</span>
          <button data-testid="assistant-search-error-dismiss" aria-label="关闭搜索失败提示" className="text-parchment/50 hover:text-ember leading-none" onClick={() => setSearchErrorDismissed(true)}>✕</button>
        </div>
      )}

      {/* Messages area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3" style={{ fontSize: bodySize }}>
        {!hasMessages && (
          <div className="text-parchment/40 text-center mt-8" style={{ fontSize: uiSmall }}>
            选中文章内容后点击旁注 tab，或直接输入问题
          </div>
        )}

        <ChatMessageList messages={session.messages} streaming={session.streaming} briefingFontSize={briefingFontSize} />

        {session.streaming && !session.searchLoading && (
          <div className="text-parchment/50 animate-pulse" style={{ fontSize: uiSmall }}>思考中…</div>
        )}
        {session.searchLoading && session.streaming && (
          <div className="text-parchment/50 animate-pulse" style={{ fontSize: uiSmall }}>搜索并思考中…</div>
        )}

        {showError && (
          <div className="text-ember/80" style={{ fontSize: uiSmall }}>
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

      {/* Pending selection chip — 挂在历史对话下方、输入框上方 */}
      {session.pendingSelection && (
        <div
          data-testid="pending-selection"
          className="relative mx-2 mb-1 border-l-2 border-ember bg-ember/10 p-2 pr-6 text-parchment/80 rounded-r shrink-0"
          style={{ fontSize: uiSmall }}
        >
          <div className="opacity-60 mb-1">你选中了：</div>
          "{session.pendingSelection}"
          <button
            data-testid="selection-cancel-btn"
            aria-label="取消选中"
            className="absolute top-1 right-1 text-parchment/50 hover:text-ember leading-none"
            onClick={() => setAssistantSelection('')}
          >
            ✕
          </button>
        </div>
      )}

      {/* Input area：input(min-w-0) 可收缩，发送(shrink-0) 常驻，
          三控件在小窗(<320px)整体隐藏（size.width 是组件内 state，
          Tailwind 视口断点无效，必须用阈值类名）。 */}
      <div className="p-2 border-t border-parchment/10 flex items-center gap-1.5 shrink-0">
        <input
          data-testid="article-assistant-input"
          className="flex-1 min-w-0 bg-[#0c0806] border border-parchment/20 rounded px-2 py-1 text-parchment/90 placeholder:text-parchment/40 outline-none focus:border-ember/50"
          style={{ fontSize: bodySize }}
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
        <div
          data-testid="assistant-extras"
          className={`items-center gap-1.5 ${size.width < 320 ? 'hidden' : 'flex'}`}
        >
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
        </div>
        {session.streaming ? (
          <button
            data-testid="article-assistant-stop-btn"
            className="shrink-0 text-ember hover:text-ember/80 whitespace-nowrap px-1"
            style={{ fontSize: uiSmall }}
            onClick={abortAssistantStream}
          >
            停止
          </button>
        ) : (
          <button
            data-testid="article-assistant-send-btn"
            className="shrink-0 text-parchment/80 hover:text-ember whitespace-nowrap px-1"
            style={{ fontSize: uiSmall }}
            onClick={() => handleSend()}
          >
            发送
          </button>
        )}
      </div>

      <ResizeHandles
        minWidth={MIN_W}
        minHeight={MIN_H}
        onResize={(next) => {
          setSize({ width: next.width, height: next.height })
          setPosition({ x: next.x, y: next.y })
        }}
      />
    </div>
  )
}
