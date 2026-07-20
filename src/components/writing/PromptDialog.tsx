import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

interface PromptDialogProps {
  title: string
  defaultValue?: string
  onSubmit: (value: string) => void
  onCancel: () => void
}

export function PromptDialog({ title, defaultValue = '', onSubmit, onCancel }: PromptDialogProps) {
  const [value, setValue] = useState(defaultValue)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  const submit = () => {
    const v = value.trim()
    if (!v) return
    onSubmit(v)
  }

  // Portal to body: escapes ancestor stacking contexts (transform/flex columns)
  // that would otherwise trap the fixed overlay beneath sibling panels.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onCancel}>
      <div
        className="bg-ink border border-parchment/20 rounded-lg shadow-xl p-4 w-72"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-sm text-parchment mb-3">{title}</div>
        <input
          ref={inputRef}
          data-testid="writing-prompt-input"
          className="w-full bg-parchment/5 border border-parchment/20 rounded px-2 py-1.5 text-sm text-parchment outline-none focus:border-ember/60"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit()
            if (e.key === 'Escape') onCancel()
          }}
        />
        <div className="flex justify-end gap-2 mt-3 text-xs">
          <button
            data-testid="writing-prompt-cancel"
            className="px-3 py-1.5 rounded text-parchment/60 hover:text-parchment hover:bg-parchment/10"
            onClick={onCancel}
          >
            取消
          </button>
          <button
            data-testid="writing-prompt-confirm"
            className="px-3 py-1.5 rounded bg-ember/80 text-ink hover:bg-ember"
            onClick={submit}
          >
            确定
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
