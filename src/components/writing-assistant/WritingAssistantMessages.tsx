import { useEffect, useMemo, useRef } from 'react'
import { useStore } from '@/store'
import type { WritingToolActivity } from '@shared/index'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { createAssistantMdComponents } from '@/lib/assistant-md-components'

/** `type:path/to/file.md` → 文件名短名（`file.md`），避免长目录撑破 UI。 */
function shortIdLabel(id: string): string {
  const afterColon = id.includes(':') ? id.slice(id.indexOf(':') + 1) : id
  const parts = afterColon.split('/')
  return parts[parts.length - 1] || afterColon
}

/** `type:path/to/file.md` → 相对路径（`path/to/file.md`，去掉 type 前缀），用于 tooltip。 */
function relativeIdPath(id: string): string {
  return id.includes(':') ? id.slice(id.indexOf(':') + 1) : id
}

function ReasoningBlock({ reasoning, streaming }: { reasoning: string; streaming: boolean }) {
  return (
    <details open={streaming} className="mb-2">
      <summary className="text-xs text-parchment/50 cursor-pointer select-none">
        思考过程
      </summary>
      <div className="text-xs text-parchment/50 whitespace-pre-wrap mt-1 pl-2 border-l border-parchment/20">
        {reasoning}
      </div>
    </details>
  )
}

function ToolActivityBlock({ activity, streaming }: { activity: WritingToolActivity[]; streaming: boolean }) {
  if (!activity || activity.length === 0) return null

  const readIds: string[] = []
  const queries: string[] = []
  let failed: string | null = null
  for (const a of activity) {
    if (a.phase === 'error' && a.error) failed = a.error
    if (a.tool === 'read_local') {
      for (const id of a.ids ?? []) {
        if (!readIds.includes(id)) readIds.push(id)
      }
    } else if (a.query && !queries.includes(a.query)) {
      queries.push(a.query)
    }
  }

  const active = streaming && activity[activity.length - 1]?.phase === 'start'
  const parts: string[] = []
  if (readIds.length > 0) parts.push(active ? '正在读取资料…' : `读取 ${readIds.length} 份资料`)
  if (queries.length > 0) parts.push(active ? '正在搜索…' : `联网搜索 ${queries.length} 次`)
  const summary = failed ? `工具调用失败` : parts.join(' · ') || '工具调用'

  return (
    <details className="mb-2 text-xs" open={active}>
      <summary className={`cursor-pointer select-none inline-flex items-center gap-1.5 ${failed ? 'text-wine' : 'text-parchment/45'} hover:text-parchment/70 transition-colors`}>
        <span className={active ? 'inline-block animate-pulse' : ''}>{active ? '⏳' : failed ? '⚠️' : '📖'}</span>
        {summary}
      </summary>
      <div className="mt-1.5 pl-2 border-l border-parchment/15 text-parchment/45 space-y-0.5 max-h-32 overflow-y-auto">
        {readIds.map((id) => (
          <div key={id} className="truncate" title={relativeIdPath(id)}>
            {shortIdLabel(id)}
          </div>
        ))}
        {queries.map((q) => (
          <div key={q} className="truncate" title={q}>🔍 {q}</div>
        ))}
        {failed && <div className="text-wine/80">{failed}</div>}
      </div>
    </details>
  )
}

export function WritingAssistantMessages() {
  const assistant = useStore((s) => s.writingAssistant)
  const error = useStore((s) => s.writingAssistant?.error ?? null)
  const retryWritingAssistantMessage = useStore((s) => s.retryWritingAssistantMessage)
  const writingUIFontSize = useStore((s) => s.writingUIFontSize)
  const mdComponents = useMemo(() => createAssistantMdComponents(writingUIFontSize), [writingUIFontSize])
  const scrollRef = useRef<HTMLDivElement>(null)
  const pinnedRef = useRef(true)
  const lastCountRef = useRef(0)

  const messages = assistant?.messages ?? []
  const streaming = assistant?.streaming ?? false

  // 只有新增消息或用户仍贴着底部时才自动滚动：流式输出不再锁死到底部，
  // 用户上翻查看前序内容不会被每段 chunk 拽回底部。
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const count = messages.length
    const newMessage = count !== lastCountRef.current
    lastCountRef.current = count
    if (newMessage || pinnedRef.current) {
      el.scrollTop = el.scrollHeight
    }
  }, [messages])

  const handleScroll = () => {
    const el = scrollRef.current
    if (!el) return
    pinnedRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48
  }

  const isEmpty = messages.length === 0

  return (
    <div
      ref={scrollRef}
      onScroll={handleScroll}
      data-testid="writing-assistant-messages"
      className="flex-1 overflow-y-auto p-3 space-y-3"
    >
      {isEmpty && (
        <div className="text-parchment/40 text-xs text-center mt-8">
          发送消息开始对话
        </div>
      )}

      {messages.map((msg, i) => {
        const isAssistant = msg.role === 'assistant'
        const isLastAssistant = isAssistant && i === messages.length - 1

        if (!isAssistant) {
          // User message: right-aligned bubble
          return (
            <div key={i} className="flex justify-end">
              <div className="bg-ember/10 rounded-lg max-w-[85%] px-3 py-2">
                <div className="text-sm text-parchment/90 whitespace-pre-wrap">
                  {msg.content}
                </div>
              </div>
            </div>
          )
        }

        // Assistant message: left-aligned, full width, no bubble
        return (
          <div key={i} className="flex justify-start">
            <div className="w-full">
              <ToolActivityBlock
                activity={msg.toolActivity ?? []}
                streaming={isLastAssistant && streaming}
              />
              {msg.reasoning && (
                <ReasoningBlock
                  reasoning={msg.reasoning}
                  streaming={isLastAssistant && streaming}
                />
              )}
              {msg.content ? (
                <Markdown
                  remarkPlugins={[remarkGfm]}
                  components={mdComponents}
                >
                  {msg.content}
                </Markdown>
              ) : (
                isLastAssistant && streaming && (
                  <div className="text-sm text-parchment/50">…</div>
                )
              )}
            </div>
          </div>
        )
      })}

      {streaming && messages.length > 0 && (
        <div className="text-xs text-parchment/50 animate-pulse">思考中…</div>
      )}

      {error && !streaming && messages.length > 0 && (() => {
        const lastMsg = messages[messages.length - 1]
        const showError = (lastMsg?.role === 'assistant' && lastMsg.content.trim() === '')
          || lastMsg?.role === 'user'
        if (!showError) return null
        return (
          <div className="text-xs text-ember/80 px-3 pb-2">
            回复失败
            <button
              className="ml-2 underline hover:text-ember"
              onClick={() => retryWritingAssistantMessage()}
            >
              重试
            </button>
          </div>
        )
      })()}
    </div>
  )
}
