import { useState } from 'react'
import { useStore } from '@/store'

export function WritingAssistantInput() {
  const [input, setInput] = useState('')
  const writingFile = useStore((s) => s.writingFile)
  const streaming = useStore((s) => s.writingAssistant?.streaming ?? false)
  const searchEnabled = useStore((s) => s.assistantSearchEnabled)
  const thinkingEffort = useStore((s) => s.assistantThinkingEffort)
  const setSearchEnabled = useStore((s) => s.setAssistantSearchEnabled)
  const setThinkingEffort = useStore((s) => s.setAssistantThinkingEffort)
  const snapshotLit = useStore((s) => s.writingAssistantSnapshotLit)
  const setSnapshotLit = useStore((s) => s.setWritingAssistantSnapshotLit)
  const sendMessage = useStore((s) => s.sendWritingAssistantMessage)
  const abort = useStore((s) => s.abortWritingAssistant)

  const noArticle = !writingFile

  const handleSend = () => {
    const text = input.trim()
    if (!text || streaming) return
    sendMessage(text)
    setInput('')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const cycleThinkingEffort = () => {
    if (streaming) return
    const next = thinkingEffort === 'off' ? 'high' : thinkingEffort === 'high' ? 'max' : 'off'
    setThinkingEffort(next)
  }

  return (
    <div className="p-2 border-t border-parchment/10 shrink-0 space-y-1.5">
      {/* Controls row */}
      <div className="flex items-center gap-1.5">
        <button
          data-testid="writing-assistant-search-btn"
          className={`px-1.5 py-1 rounded text-sm transition-colors duration-200 disabled:opacity-30 disabled:cursor-not-allowed ${
            searchEnabled ? 'text-sky-400' : 'text-parchment/40'
          }`}
          onClick={() => setSearchEnabled(!searchEnabled)}
          disabled={streaming}
          aria-pressed={searchEnabled}
          aria-label={searchEnabled ? '搜索已开启' : '搜索已关闭'}
          title={searchEnabled ? '搜索已开启 — 发送时将联网搜索' : '搜索已关闭 — 点击开启联网搜索'}
        >
          🔍
        </button>
        <button
          data-testid="writing-assistant-thinking-btn"
          className={`relative px-1.5 py-1 rounded text-sm transition-colors duration-200 disabled:opacity-30 disabled:cursor-not-allowed ${
            thinkingEffort !== 'off' ? 'text-sky-400' : 'text-parchment/40'
          }`}
          onClick={cycleThinkingEffort}
          disabled={streaming}
          aria-label={`思考深度：${thinkingEffort === 'off' ? '关闭' : thinkingEffort === 'high' ? '高' : '最大'}`}
          title={`思考深度：${thinkingEffort === 'off' ? '关闭' : thinkingEffort === 'high' ? '高' : '最大'} — 点击切换`}
        >
          🧠
          {thinkingEffort === 'max' && (
            <span className="absolute -top-0.5 -right-0.5 text-[8px] text-sky-400 font-bold leading-none">
              MAX
            </span>
          )}
        </button>
        <button
          data-testid="writing-assistant-snapshot-btn"
          className={`px-1.5 py-1 rounded text-sm transition-colors duration-200 disabled:opacity-30 disabled:cursor-not-allowed ${
            snapshotLit ? 'text-sky-400' : 'text-parchment/40'
          }`}
          onClick={() => setSnapshotLit(!snapshotLit)}
          disabled={streaming}
          aria-pressed={snapshotLit}
          aria-label={snapshotLit ? '正文快照已点亮' : '正文快照关闭'}
          title={snapshotLit ? '正文快照已点亮 — 每轮发送当前文章全文' : '正文快照关闭 — 点亮后每轮把当前文章全文发给助手'}
        >
          📄
        </button>
      </div>

      {/* Input row */}
      <div className="flex items-end gap-1.5">
        <textarea
          data-testid="writing-assistant-input"
          className="flex-1 bg-transparent border border-parchment/20 rounded px-3 py-2 text-sm text-parchment resize-none placeholder:text-parchment/40 outline-none focus:border-ember/50"
          placeholder={noArticle ? "请先选择或新建一篇文章" : "问点什么…"}
          rows={2}
          value={noArticle ? "" : input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={noArticle || streaming}
        />
        {streaming ? (
          <button
            data-testid="writing-assistant-stop-btn"
            className="text-xs text-ember hover:text-ember/80 whitespace-nowrap px-2 py-1 shrink-0"
            onClick={abort}
          >
            ■
          </button>
        ) : (
          <button
            data-testid="writing-assistant-send-btn"
            className="text-xs text-parchment/80 hover:text-ember whitespace-nowrap px-2 py-1 shrink-0 disabled:opacity-30"
            onClick={handleSend}
            disabled={noArticle || input.trim().length === 0}
          >
            ↑
          </button>
        )}
      </div>
    </div>
  )
}
