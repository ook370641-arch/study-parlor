import type { Message } from '@shared/index'

export function ChatBubble({ msg }: { msg: Message }) {
  if (msg.role === 'system') return null
  const isUser = msg.role === 'user'
  // 归档触发问句 "需要存档吗?" 是自然语,对用户可见 —— 让用户在聊天里直接看到
  // LLM 何时问的归档,banner 才不会显得"凭空冒出来"。前端只 trim,不剥。
  const content = msg.content.trim()
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
