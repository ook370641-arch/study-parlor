import { useEffect, useRef, useState } from 'react'
import { useStore } from '@/store'
import { ScoutCandidateCards } from './ScoutCandidateCards'
import type { BriefingTheme } from '@shared/index'

export function ScoutChatView({ theme = 'academic' }: { theme?: BriefingTheme }) {
  const activeId = useStore((s) => s.scoutActiveConversationId)
  const messages = useStore((s) => s.scoutMessages)
  const streaming = useStore((s) => s.scoutStreaming)
  const sendMessage = useStore((s) => s.sendScoutMessage)
  const abort = useStore((s) => s.abortScout)
  const [input, setInput] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const userScrolledUpRef = useRef(false)
  const isAcademic = theme !== 'newspaper'
  const muted = isAcademic ? 'text-parchment/50' : 'text-[#6b5d52]'

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onScroll = () => {
      const distance = el.scrollHeight - el.scrollTop - el.clientHeight
      userScrolledUpRef.current = distance > 80
    }
    el.addEventListener('scroll', onScroll)
    return () => el.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    if (!scrollRef.current) return
    const el = scrollRef.current
    if (!userScrolledUpRef.current) {
      el.scrollTo({ top: el.scrollHeight, behavior: streaming ? 'auto' : 'smooth' })
    }
  }, [messages, streaming])

  // Auto-resize textarea height capped at ~6 rows
  useEffect(() => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = 'auto'
    const lineHeight = 20 // Tailwind text-sm py-2 ≈ 20px/line
    ta.style.height = `${Math.min(ta.scrollHeight, lineHeight * 6 + 16)}px`
  }, [input])

  if (!activeId) {
    return (
      <div data-testid="scout-chat-empty" className={`flex-1 flex flex-col items-center justify-center gap-2 text-sm ${muted}`}>
        <p>从左侧选择一个对话，或新建对话开始</p>
        <p className="text-xs opacity-70">给拾贝一个研究主题，或者直接丢一个文章链接</p>
      </div>
    )
  }

  const submit = () => {
    const v = input.trim()
    if (!v) return
    setInput('')
    void sendMessage(v)
  }

  return (
    <div data-testid="scout-chat-view" className="flex-1 flex flex-col min-h-0">
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map((m, i) => (
          <div key={i}>
            <div className="text-[10px] text-parchment/40 mb-0.5">{m.role === 'user' ? '你' : '拾贝'}</div>
            <div
              data-testid={`scout-message-${m.role}`}
              className={`max-w-[80%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
                m.role === 'user'
                  ? isAcademic ? 'ml-auto bg-ember/15 text-parchment' : 'ml-auto bg-[#1a1a1a]/10 text-[#1a1a1a]'
                  : isAcademic ? 'bg-parchment/8 text-parchment/90' : 'bg-white text-[#1a1a1a] border border-[#c9c3b8]'
              }`}
            ><span className="font-serif">{m.content}</span></div>
            {m.role === 'assistant' && m.candidates && (
              <ScoutCandidateCards message={m} theme={theme} />
            )}
          </div>
        ))}
        {streaming && <div className={`text-xs flex items-center gap-2 ${muted}`}>
              <span className="inline-block w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin align-middle" />
              <span className="animate-pulse">拾贝工作中…</span>
            </div>}
      </div>
      <div className={`p-3 border-t flex gap-2 shrink-0 ${isAcademic ? 'border-parchment/15' : 'border-[#c9c3b8]'}`}>
        <textarea
          ref={textareaRef}
          data-testid="scout-chat-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() } }}
          placeholder="给拾贝一个主题，或丢一个链接..."
          rows={2}
          className={`flex-1 resize-none rounded border px-3 py-2 text-sm outline-none min-h-[44px] ${
            isAcademic
              ? 'bg-parchment/10 border-slate/30 text-parchment placeholder:text-parchment/40 focus:border-ember/50'
              : 'bg-white border-[#c9c3b8] text-[#1a1a1a] placeholder:text-[#6b5d52]/60 focus:border-[#1a1a1a]/50'
          }`}
        />
        {streaming ? (
          <button type="button" data-testid="scout-chat-abort" onClick={() => void abort()}
            className={`self-end px-3 py-2 rounded text-sm ${isAcademic ? 'bg-wine/20 text-parchment hover:bg-wine/30' : 'bg-[#8a3a3a]/10 text-[#8a3a3a]'}`}>停止</button>
        ) : (
          <button type="button" data-testid="scout-chat-send" onClick={submit} disabled={!input.trim()}
            className={`self-end px-3 py-2 rounded text-sm disabled:opacity-30 ${isAcademic ? 'bg-ember/20 text-parchment hover:bg-ember/30' : 'bg-[#1a1a1a] text-white'}`}>发送</button>
        )}
      </div>
    </div>
  )
}
