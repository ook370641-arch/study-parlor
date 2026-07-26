import { useState, KeyboardEvent } from 'react'
import { Button } from '@/components/Button'
import type { BriefingTheme } from '@shared/index'

export function ChatInput({ onSend, disabled, theme }: {
  onSend: (text: string) => void
  disabled?: boolean
  theme?: BriefingTheme
}) {
  const [val, setVal] = useState('')
  const send = () => {
    const t = val.trim()
    if (!t) return
    onSend(t)
    setVal('')
  }
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  const isAcademic = theme !== 'newspaper'

  const inputCls = isAcademic
    ? 'bg-ink/60 backdrop-blur-sm border-slate/40 text-parchment placeholder:text-parchment/30 focus:border-ember'
    : 'bg-white border-[#1a1a1a]/15 text-[#1a1a1a] placeholder:text-[#999] focus:border-[#1a1a1a]'

  return (
    <div className="flex gap-3 items-end">
      <textarea data-testid="chat-input" value={val} onChange={e => setVal(e.target.value)} onKeyDown={onKey}
        rows={2} disabled={disabled}
        placeholder="输入..."
        className={`flex-1 border rounded p-3 resize-none font-serif focus:outline-none ${inputCls}`} />
      <Button data-testid="send-button" onClick={send} disabled={disabled} theme={theme}>递出</Button>
    </div>
  )
}
