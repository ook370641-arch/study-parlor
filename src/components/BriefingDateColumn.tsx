import { useState } from 'react'
import { useStore } from '@/store'

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
  /** 提供时显示 🗑 进入选择删除模式；确认时回传选中的条目 */
  onDelete?: (items: BriefingHistoryItem[]) => void
}

function formatLabel(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  if ([y, m, d].some((n) => Number.isNaN(n))) return date
  return `${m}月${d}日`
}

export function BriefingDateColumn({ collapsed, history, currentDate, today, onSelect, onReceiveToday, theme, todayLabel = '查收日报', onDelete }: Props) {
  const isAcademic = theme !== 'newspaper'
  const source = useStore((s) => s.briefingSource)
  const jobBlue = isAcademic && source === 'job-briefing'
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const itemBase = isAcademic
    ? 'text-parchment/70 hover:bg-parchment/10 hover:text-parchment'
    : 'text-[#6b5d52] hover:bg-black/5 hover:text-[#1a1a1a]'
  const activeItem = isAcademic
    ? jobBlue
      ? 'bg-[#7fa8d9]/20 text-[#7fa8d9] border border-[#7fa8d9]/40'
      : 'bg-ember/20 text-ember border border-ember/40'
    : 'bg-[#1a1a1a] text-white'

  // Today is always rendered as the synthetic top entry, so drop any history
  // record for today. Otherwise a generated-today briefing appears both as the
  // synthetic entry and in `history`, producing a duplicate React key.
  const past = history.filter((h) => h.date !== today)
  const entries = [{ date: today, filePath: '', isToday: true }, ...past.map((h) => ({ ...h, isToday: false }))]

  const exitSelectMode = () => {
    setSelectMode(false)
    setSelected(new Set())
  }

  const toggleSelected = (filePath: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(filePath)) next.delete(filePath)
      else next.add(filePath)
      return next
    })
  }

  if (collapsed) {
    const latest = past[0]
    return (
      <div className="flex flex-col items-center py-3 px-1 gap-3">
        <button
          data-testid="briefing-date-today-mini"
          onClick={onReceiveToday}
          title={todayLabel}
          className={`w-8 h-8 rounded flex items-center justify-center ${isAcademic ? (jobBlue ? 'bg-[#7fa8d9]/20 text-[#7fa8d9]' : 'bg-ember/20 text-ember') : 'bg-[#1a1a1a] text-white'}`}
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

  // 选择删除模式：列出全部历史（含今天，只要文件存在），勾选后统一删除。
  if (selectMode) {
    const selectedItems = history.filter((h) => selected.has(h.filePath))
    return (
      <div className="p-2 space-y-1" data-testid="briefing-date-column">
        {history.length === 0 && (
          <div className={`px-3 py-2 text-xs ${isAcademic ? 'text-parchment/40' : 'text-[#6b5d52]'}`}>
            暂无可删除的简报
          </div>
        )}
        {history.map((h) => (
          <label
            key={h.date}
            className={`flex items-center gap-2 w-full text-left px-3 py-2 rounded text-sm cursor-pointer ${itemBase}`}
          >
            <input
              type="checkbox"
              data-testid={`briefing-delete-check-${h.date}`}
              checked={selected.has(h.filePath)}
              onChange={() => toggleSelected(h.filePath)}
              className="accent-ember shrink-0"
            />
            <span>{formatLabel(h.date)}{h.date === today ? '（今天）' : ''}</span>
          </label>
        ))}
        <div className="flex gap-2 pt-2">
          <button
            data-testid="briefing-delete-confirm"
            disabled={selectedItems.length === 0}
            onClick={() => {
              onDelete?.(selectedItems)
              exitSelectMode()
            }}
            className="flex-1 px-3 py-1.5 rounded text-xs bg-[#8a3a3a] text-parchment disabled:opacity-40 hover:bg-[#9a4444]"
          >
            删除所选({selectedItems.length})
          </button>
          <button
            data-testid="briefing-delete-cancel"
            onClick={exitSelectMode}
            className={`px-3 py-1.5 rounded text-xs ${isAcademic ? 'text-parchment/60 hover:text-parchment' : 'text-[#6b5d52] hover:text-[#1a1a1a]'}`}
          >
            取消
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="p-2 space-y-1" data-testid="briefing-date-column">
      {onDelete && history.length > 0 && (
        <div className="flex justify-end pb-1">
          <button
            data-testid="briefing-delete-mode-toggle"
            onClick={() => setSelectMode(true)}
            title="选择删除简报"
            aria-label="选择删除简报"
            className={`text-sm ${isAcademic ? 'text-parchment/40 hover:text-parchment/80' : 'text-[#6b5d52]/60 hover:text-[#6b5d52]'}`}
          >
            🗑
          </button>
        </div>
      )}
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
