import { useEffect, useMemo, useRef } from 'react'
import { useStore } from '@/store'
import type { WritingSource } from '@shared/index'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { createAssistantMdComponents } from '@/lib/assistant-md-components'

const SOURCE_TYPE_LABELS: Record<string, string> = {
  study: '学习',
  blog: '博客',
  digest: '日报',
  job: '求职',
  repository: 'repository',
  writing: '写作',
  web: '网络',
}

function SourceChips({ sources, streaming }: { sources: WritingSource[]; streaming: boolean }) {
  if (!sources || sources.length === 0) return null
  return (
    <div className="flex flex-wrap gap-1 mb-2">
      {sources.map((src) => (
        <span
          key={`${src.type}-${src.id}`}
          data-testid="writing-source-chip"
          className={`inline-flex items-center text-[10px] bg-ember/10 text-ember/80 rounded px-1.5 py-0.5 ${
            streaming ? 'animate-pulse' : ''
          }`}
        >
          [{SOURCE_TYPE_LABELS[src.type] ?? src.type}] {src.label}
        </span>
      ))}
    </div>
  )
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

export function WritingAssistantMessages() {
  const assistant = useStore((s) => s.writingAssistant)
  const error = useStore((s) => s.writingAssistant?.error ?? null)
  const retryWritingAssistantMessage = useStore((s) => s.retryWritingAssistantMessage)
  const briefingFontSize = useStore((s) => s.briefingFontSize)
  const mdComponents = useMemo(() => createAssistantMdComponents(briefingFontSize), [briefingFontSize])
  const scrollRef = useRef<HTMLDivElement>(null)

  const messages = assistant?.messages ?? []
  const streaming = assistant?.streaming ?? false

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [messages])

  const isEmpty = messages.length === 0

  return (
    <div
      ref={scrollRef}
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
              <SourceChips
                sources={msg.sources ?? []}
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
