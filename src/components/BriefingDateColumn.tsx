export type BriefingHistoryItem = {
  date: string
  filePath: string
}

interface Props {
  collapsed: boolean
  history: BriefingHistoryItem[]
  currentDate?: string
  today: string
  onSelect: (date: string) => void
  onReceiveToday: () => void
  theme: 'academic' | 'newspaper'
  todayLabel?: string
}

function formatLabel(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  if ([y, m, d].some((n) => Number.isNaN(n))) return date
  return `${m}月${d}日`
}

export function BriefingDateColumn({ collapsed, history, currentDate, today, onSelect, onReceiveToday, theme, todayLabel = '查收日报' }: Props) {
  const isAcademic = theme !== 'newspaper'

  const itemBase = isAcademic
    ? 'text-parchment/70 hover:bg-parchment/10 hover:text-parchment'
    : 'text-[#6b5d52] hover:bg-black/5 hover:text-[#1a1a1a]'
  const activeItem = isAcademic
    ? 'bg-ember/20 text-ember border border-ember/40'
    : 'bg-[#1a1a1a] text-white'

  // Today is always rendered as the synthetic top entry, so drop any history
  // record for today. Otherwise a generated-today briefing appears both as the
  // synthetic entry and in `history`, producing a duplicate React key.
  const past = history.filter((h) => h.date !== today)
  const entries = [{ date: today, filePath: '', isToday: true }, ...past.map((h) => ({ ...h, isToday: false }))]

  if (collapsed) {
    const latest = past[0]
    return (
      <div className="flex flex-col items-center py-3 px-1 gap-3">
        <button
          data-testid="briefing-date-today-mini"
          onClick={onReceiveToday}
          title={todayLabel}
          className={`w-8 h-8 rounded flex items-center justify-center ${isAcademic ? 'bg-ember/20 text-ember' : 'bg-[#1a1a1a] text-white'}`}
        >
          今
        </button>
        {latest && (
          <button
            data-testid="briefing-date-latest-mini"
            onClick={() => onSelect(latest.date)}
            title={latest.date}
            className={`text-[10px] writing-vertical-lr ${isAcademic ? 'text-parchment/60' : 'text-[#6b5d52]'}`}
          >
            {formatLabel(latest.date)}
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="p-2 space-y-1" data-testid="briefing-date-column">
      {entries.map((entry) => {
        const isCurrent = entry.date === currentDate
        return (
          <button
            key={entry.date}
            data-testid={`briefing-date-item-${entry.date}`}
            onClick={() => (entry.isToday ? onReceiveToday() : onSelect(entry.date))}
            className={`w-full text-left px-3 py-2 rounded text-sm transition-colors ${isCurrent ? activeItem : itemBase}`}
          >
            {entry.isToday ? todayLabel : formatLabel(entry.date)}
          </button>
        )
      })}
      {past.length === 0 && (
        <div className={`px-3 py-2 text-xs ${isAcademic ? 'text-parchment/40' : 'text-[#6b5d52]'}`}>
          暂无往期简报
        </div>
      )}
    </div>
  )
}
