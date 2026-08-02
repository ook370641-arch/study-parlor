import { memo } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { ArticleAssistantMessage } from '@shared/index'
import { assistantMdComponents } from '@/lib/assistant-md-components'

interface Props {
  messages: ArticleAssistantMessage[]
  streaming: boolean
}

export const ChatMessageList = memo(function ChatMessageList({ messages, streaming }: Props) {
  return (
    <>
      {messages.map((m, i) => (
        <div
          key={i}
          data-testid="chat-message"
          data-role={m.role}
          className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
        >
          <div
            className={`max-w-[85%] leading-relaxed rounded px-2 py-1 ${
              m.role === 'user' ? 'bg-ember/10 text-parchment/80 whitespace-pre-wrap' : 'text-parchment/90'
            }`}
          >
            {m.role === 'user' && m.selection && (
              <div
                data-testid="chat-message-selection"
                className="text-xs border-l-2 border-parchment/40 bg-parchment/5 p-1.5 mb-1 text-parchment/60 rounded-r"
              >
                "{m.selection}"
              </div>
            )}
            {m.role === 'assistant' && m.reasoning && (
              <details
                data-testid="reasoning-block"
                open={streaming && i === messages.length - 1}
                className="mb-1"
              >
                <summary className="text-[11px] text-parchment/40 cursor-pointer select-none">思考过程</summary>
                <div className="text-xs text-parchment/50 whitespace-pre-wrap mt-1">{m.reasoning}</div>
              </details>
            )}
            {m.role === 'assistant' ? (
              m.content ? (
                <Markdown remarkPlugins={[remarkGfm]} components={assistantMdComponents}>
                  {m.content}
                </Markdown>
              ) : (
                streaming ? '…' : ''
              )
            ) : (
              m.content
            )}
            {m.searchSources && m.searchSources.length > 0 && (
              <div className="text-[11px] text-parchment/50 mt-1">已搜索 {m.searchSources.length} 个来源</div>
            )}
          </div>
        </div>
      ))}
    </>
  )
})
