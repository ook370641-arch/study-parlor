interface ArchiveLoadingOverlayProps {
  onBack?: () => void
}

export function ArchiveLoadingOverlay({ onBack }: ArchiveLoadingOverlayProps) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6"
         style={{ backgroundColor: 'rgba(42, 31, 26, 0.95)' }}>
      {onBack && (
        <button
          onClick={onBack}
          aria-label="返回"
          className="absolute top-4 left-4 text-2xl leading-none text-parchment/70 hover:text-parchment transition-colors px-2 py-1"
        >
          ←
        </button>
      )}

      <div className="w-12 h-12 rounded-full border-2 animate-spin"
           style={{
             borderColor: 'rgba(232, 213, 183, 0.13)',
             borderTopColor: '#d97757'
           }}
      />

      <div className="font-serif text-lg tracking-widest" style={{ color: '#e8d5b7' }}>
        正在凝结记忆
      </div>

      <div className="w-52 h-0.5 overflow-hidden" style={{ backgroundColor: 'rgba(232, 213, 183, 0.13)' }}>
        <div className="h-full w-3/5 animate-pulse" style={{ backgroundColor: '#d97757' }} />
      </div>
    </div>
  )
}
