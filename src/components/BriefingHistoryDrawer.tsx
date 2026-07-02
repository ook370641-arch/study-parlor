import { useEffect } from 'react'

export type BriefingHistoryItem = {
  date: string
  filePath: string
}

type Props = {
  open: boolean
  onClose: () => void
  currentDate?: string
  history: BriefingHistoryItem[]
  loading: boolean
  error?: string | null
  onSelect: (date: string) => void
}

function formatDrawerDate(date: string): string {
  return date.slice(5)
}

export function BriefingHistoryDrawer({ open, onClose, currentDate, history, loading, error, onSelect }: Props) {
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [open])

  if (!open) return null

  return (
    <>
      <div
        className="fixed inset-0 bg-black/40 z-40"
        onClick={onClose}
        aria-hidden="true"
      />
      <div data-testid="briefing-history-drawer" className="fixed right-0 top-0 h-full w-60 bg-ink/95 border-l border-slate/40 z-50 p-4 flex flex-col shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold text-parchment">往期简报</h2>
          <button
            onClick={onClose}
            className="text-slate hover:text-parchment transition-colors"
            aria-label="关闭"
          >
            ✕
          </button>
        </div>

        {loading && (
          <div className="text-xs text-slate py-2">加载中...</div>
        )}

        {!loading && error && (
          <div className="text-xs text-wine py-2">{error}</div>
        )}

        <div className="flex-1 overflow-y-auto space-y-1">
          {history.map(item => {
            const isCurrent = item.date === currentDate
            return (
              <button
                key={item.date}
                onClick={() => {
                  onSelect(item.date)
                  onClose()
                }}
                className={`w-full text-left px-3 py-2 rounded text-sm transition-colors ${
                  isCurrent
                    ? 'bg-ember/20 text-ember border border-ember/40'
                    : 'text-parchment/70 hover:bg-slate/20 hover:text-parchment'
                }`}
              >
                {formatDrawerDate(item.date)}
              </button>
            )
          })}

          {!loading && history.length === 0 && (
            <div className="text-xs text-slate py-2">暂无往期简报</div>
          )}
        </div>
      </div>
    </>
  )
}
