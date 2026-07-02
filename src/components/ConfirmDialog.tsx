import { useEffect, useCallback } from 'react'

type ConfirmDialogProps = {
  open: boolean
  title: string
  icon: 'warning' | 'trash'
  children: React.ReactNode
  confirmLabel: string
  confirmVariant: 'danger' | 'primary'
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  open,
  title,
  icon,
  children,
  confirmLabel,
  confirmVariant,
  onConfirm,
  onCancel
}: ConfirmDialogProps) {
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onCancel()
    if (e.key === 'Enter') onConfirm()
  }, [onConfirm, onCancel])

  useEffect(() => {
    if (!open) return
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, handleKeyDown])

  if (!open) return null

  const iconMap = {
    warning: '⚠',
    trash: '\u{1F5D1}'
  }

  return (
    <div
      data-testid="confirm-dialog"
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(20,15,12,0.85)' }}
      onClick={onCancel}
    >
      <div
        className="bg-ink border border-slate/50 rounded-lg p-7 max-w-md w-[90%]"
        style={{ boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-2xl mb-3" style={{ color: '#8a3a3a' }}>
          {iconMap[icon]}
        </div>
        <h3 className="font-serif text-lg font-semibold text-parchment mb-3">
          {title}
        </h3>
        <div className="text-sm leading-relaxed mb-6" style={{ color: 'rgba(232,213,183,0.6)' }}>
          {children}
        </div>
        <div className="flex gap-3 justify-end">
          <button
            data-testid="confirm-dialog-cancel"
            onClick={onCancel}
            className="px-4 py-2 text-sm rounded border font-sans transition-colors"
            style={{
              background: 'transparent',
              borderColor: 'rgba(58,90,106,0.5)',
              color: 'rgba(232,213,183,0.7)'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'rgba(232,213,183,0.5)'
              e.currentTarget.style.color = '#e8d5b7'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'rgba(58,90,106,0.5)'
              e.currentTarget.style.color = 'rgba(232,213,183,0.7)'
            }}
          >
            {confirmVariant === 'danger' ? '你还没有准备好' : '维持现状'}
          </button>
          <button
            data-testid="confirm-dialog-confirm"
            onClick={onConfirm}
            className="px-4 py-2 text-sm rounded font-sans transition-all"
            style={{
              background: confirmVariant === 'danger' ? '#8a3a3a' : '#d97757',
              color: '#e8d5b7',
              boxShadow: confirmVariant === 'danger'
                ? '2px 2px 0 0 #6a2a2a'
                : '2px 2px 0 0 #3a5a6a'
            }}
            onMouseDown={(e) => {
              e.currentTarget.style.transform = 'translate(1px, 1px)'
              e.currentTarget.style.boxShadow = confirmVariant === 'danger'
                ? '1px 1px 0 0 #6a2a2a'
                : '1px 1px 0 0 #3a5a6a'
            }}
            onMouseUp={(e) => {
              e.currentTarget.style.transform = 'translate(0, 0)'
              e.currentTarget.style.boxShadow = confirmVariant === 'danger'
                ? '2px 2px 0 0 #6a2a2a'
                : '2px 2px 0 0 #3a5a6a'
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
