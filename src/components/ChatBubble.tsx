import type { Message } from '@shared/index'

export function ChatBubble({ msg }: { msg: Message }) {
  if (msg.role === 'system') return null
  const isUser = msg.role === 'user'
  const content = msg.content.replace('[[SUGGEST_END]]', '').trim()
  if (!content) return null

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} my-3`}>
      <div className={`max-w-[70%] px-4 py-3 rounded-md whitespace-pre-wrap leading-relaxed
        ${isUser
          ? 'bg-ember/20 border border-ember/40'
          : 'bg-ink/60 border border-slate/40'}`}>
        {content}
      </div>
    </div>
  )
}
