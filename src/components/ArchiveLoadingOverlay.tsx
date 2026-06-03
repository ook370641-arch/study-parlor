export function ArchiveLoadingOverlay() {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6"
         style={{ backgroundColor: 'rgba(42, 31, 26, 0.95)' }}>
      <div className="w-12 h-12 rounded-full border-2 animate-spin"
           style={{
             borderColor: 'rgba(232, 213, 183, 0.13)',
             borderTopColor: '#d97757'
           }}
      />

      <div className="font-serif text-lg tracking-widest" style={{ color: '#e8d5b7' }}>
        归档中
      </div>

      <div className="font-sans text-sm" style={{ color: 'rgba(232, 213, 183, 0.4)' }}>
        纸页在暗中自行归类
      </div>

      <div className="w-52 h-0.5 overflow-hidden" style={{ backgroundColor: 'rgba(232, 213, 183, 0.13)' }}>
        <div className="h-full w-3/5 animate-pulse" style={{ backgroundColor: '#d97757' }} />
      </div>
    </div>
  )
}
