import { useEffect, useRef } from 'react'

interface InlineNameInputProps {
  defaultValue?: string
  placeholder?: string
  error?: string
  theme?: 'academic' | 'newspaper'
  dataTestid?: string
  onSubmit: (value: string) => void
  onCancel: () => void
  onValueChange?: (value: string) => void
}

export function InlineNameInput({
  defaultValue = '',
  placeholder = '',
  error,
  theme = 'academic',
  dataTestid,
  onSubmit,
  onCancel,
  onValueChange,
}: InlineNameInputProps) {
  const isAcademic = theme !== 'newspaper'
  const ref = useRef<HTMLInputElement>(null)
  const doneRef = useRef(false)

  useEffect(() => {
    const el = ref.current
    if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length) }
  }, [])

  const commit = () => {
    if (doneRef.current) return
    const value = ref.current?.value.trim() ?? ''
    doneRef.current = true
    if (!value) { onCancel(); return }
    onSubmit(value)
  }

  const cancel = () => {
    if (doneRef.current) return
    doneRef.current = true
    onCancel()
  }

  return (
    <div className="px-2 py-1">
      <input
        ref={ref}
        data-testid={dataTestid}
        className={`w-full px-2 py-0.5 rounded text-xs outline-none border ${
          isAcademic
            ? 'bg-ink border-ember/60 text-parchment placeholder:text-parchment/40'
            : 'bg-white border-[#8a3a3a]/50 text-[#2a1f1a] placeholder:text-[#6b5d52]/50'
        }`}
        defaultValue={defaultValue}
        placeholder={placeholder}
        spellCheck={false}
        onChange={(e) => onValueChange?.(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); commit() }
          else if (e.key === 'Escape') { e.preventDefault(); cancel() }
        }}
        onBlur={commit}
      />
      {error && (
        <div className={`text-[10px] mt-0.5 ${isAcademic ? 'text-red-400' : 'text-red-600'}`}>{error}</div>
      )}
    </div>
  )
}
