import { useState, KeyboardEvent } from 'react'
import { Button } from '@/components/Button'

export function ChatInput({ onSend, disabled }: {
  onSend: (text: string) => void
  disabled?: boolean
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
  return (
    <div className="flex gap-3 items-end">
      <textarea value={val} onChange={e => setVal(e.target.value)} onKeyDown={onKey}
        rows={2} disabled={disabled}
        placeholder="Enter 发送 / Shift+Enter 换行"
        className="flex-1 bg-ink/60 backdrop-blur-sm border border-slate/40 rounded p-3
                   text-parchment placeholder:text-parchment/30
                   focus:outline-none focus:border-ember resize-none
                   font-serif" />
      <Button onClick={send} disabled={disabled}>发送</Button>
    </div>
  )
}
