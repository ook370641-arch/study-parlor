import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useStore } from '@/store'
import { SPRING_SETTLE } from '@/lib/motion-presets'

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
  onDelete?: (items: BriefingHistoryItem[]) => void
  generatedDates?: string[]
  readDates?: string[]
  /** 仅 digest 源传入：精选集置顶入口 */
  collection?: { active: boolean; onOpen: () => void }
}

function formatLabel(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  if ([y, m, d].some((n) => Number.isNaN(n))) return date
  return `${m}月${d}日`
}

export function BriefingDateColumn({ collapsed, history, currentDate, today, onSelect, onReceiveToday, theme, todayLabel = '查收日报', onDelete, generatedDates = [], readDates = [], collection }: Props) {
  const isAcademic = theme !== 'newspaper'
  const source = useStore((s) => s.briefingSource)
  const jobBlue = isAcademic && source === 'job-briefing'
  // Flame accent: source-color identity — amber (digest), star-blue (job), ink (newspaper)
  const flameAccent = !isAcademic ? '26, 26, 26'       // Newspaper: ink
    : jobBlue ? '127, 168, 217'                         // Job: star-blue
    : '217, 151, 87'                                    // Digest: amber
  const [menu, setMenu] = useState<{ x: number; y: number; item: BriefingHistoryItem } | null>(null)

  useEffect(() => {
    if (!menu) return
    const h = () => setMenu(null)
    document.addEventListener('click', h)
    return () => document.removeEventListener('click', h)
  }, [menu])

  const itemBase = isAcademic
    ? 'text-parchment/70 hover:bg-parchment/10 hover:text-parchment'
    : 'text-[#6b5d52] hover:bg-black/5 hover:text-[#1a1a1a]'
  const activeItem = isAcademic
    ? jobBlue
      ? 'bg-[#7fa8d9]/20 text-[#7fa8d9] border border-[#7fa8d9]/40'
      : 'bg-ember/20 text-ember border border-ember/40'
    : 'bg-[#1a1a1a] text-white'

  const past = history.filter((h) => h.date !== today)
  const entries = [{ date: today, filePath: '', isToday: true }, ...past.map((h) => ({ ...h, isToday: false }))]

  if (collapsed) {
    const latest = past[0]
    return (
      <div className="flex flex-col items-center py-3 px-1 gap-3">
        {collection && (
          <button data-testid="briefing-collection-mini" onClick={collection.onOpen} title="精选集"
            className={`w-8 h-8 rounded flex items-center justify-center ${isAcademic ? (collection.active ? 'bg-ember/20 text-ember' : 'text-parchment/60 hover:text-ember') : (collection.active ? 'bg-[#1a1a1a] text-white' : 'text-[#6b5d52] hover:text-[#1a1a1a]')}`}>
            ✦
          </button>
        )}
        <button data-testid="briefing-date-today-mini" onClick={onReceiveToday} title={todayLabel}
          className={`w-8 h-8 rounded flex items-center justify-center ${isAcademic ? (jobBlue ? 'bg-[#7fa8d9]/20 text-[#7fa8d9]' : 'bg-ember/20 text-ember') : 'bg-[#1a1a1a] text-white'}`}>
          今
        </button>
        {latest && (
          <button data-testid="briefing-date-latest-mini" onClick={() => onSelect(latest.date)} title={latest.date}
            className={`text-[10px] writing-vertical-lr ${isAcademic ? 'text-parchment/60' : 'text-[#6b5d52]'}`}>
            {formatLabel(latest.date)}
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="p-2 space-y-1" data-testid="briefing-date-column">
      {collection && (
        <button
          data-testid="briefing-collection-entry"
          onClick={collection.onOpen}
          className={`w-full text-left px-2 py-2 rounded transition-all duration-300 flex items-center gap-2 ${
            collection.active ? activeItem : itemBase
          }`}
          style={{ fontSize: 'var(--briefing-list-title-size)' }}
        >
          <span className="inline-block w-[7px] h-[7px] shrink-0" />
          ✦ 精选集
        </button>
      )}
      {entries.map((entry) => {
        const isCurrent = entry.date === currentDate
        return (
          <button key={entry.date} data-testid={`briefing-date-item-${entry.date}`}
            onClick={() => (entry.isToday ? onReceiveToday() : onSelect(entry.date))}
            onContextMenu={(e) => {
              const item = history.find((h) => h.date === entry.date)
              if (!item) return
              e.preventDefault()
              setMenu({ x: e.clientX, y: e.clientY, item })
            }}
            className={`w-full text-left px-2 py-2 rounded transition-all duration-300 flex items-center gap-2 ${isCurrent ? activeItem : itemBase} ${readDates.includes(entry.date) ? 'opacity-60' : ''}`}
            style={{
              fontSize: 'var(--briefing-list-title-size)',
              ...(isCurrent ? { transform: 'translateX(4px)', transitionTimingFunction: SPRING_SETTLE } : {}),
            }}>
            <span
              data-testid={`briefing-date-flame-${entry.date}`}
              data-state={
                readDates.includes(entry.date) ? 'spent'
                : generatedDates.includes(entry.date) ? 'lit'
                : 'unlit'
              }
              className="inline-block w-[7px] h-[7px] rounded-full border shrink-0 transition-all duration-500"
              style={{
                background: readDates.includes(entry.date) ? `rgba(${flameAccent}, 0.28)`
                  : generatedDates.includes(entry.date) ? `rgb(${flameAccent})`
                  : 'transparent',
                borderColor: generatedDates.includes(entry.date) && !readDates.includes(entry.date) ? `rgb(${flameAccent})`
                  : readDates.includes(entry.date) ? `rgba(${flameAccent}, 0.3)`
                  : `rgba(${flameAccent}, 0.8)`,
                boxShadow: generatedDates.includes(entry.date) && !readDates.includes(entry.date)
                  ? `0 0 8px 2px rgba(${flameAccent}, 0.55)` : 'none',
              }}
            />
            {entry.isToday ? todayLabel : formatLabel(entry.date)}
          </button>
        )
      })}
      {past.length === 0 && (
        <div className={`px-3 py-2 text-xs ${isAcademic ? 'text-parchment/40' : 'text-[#6b5d52]'}`}>暂无往期简报</div>
      )}
      {menu && createPortal(
        <div data-testid="briefing-date-menu" className="fixed z-50 bg-ink border border-parchment/20 rounded shadow-lg py-1 text-xs"
          style={{ left: menu.x, top: menu.y }}>
          <button type="button" data-testid="briefing-date-delete"
            onClick={() => { const item = menu.item; setMenu(null); onDelete?.([item]) }}
            className="block w-full text-left px-3 py-1.5 hover:bg-parchment/10 text-red-400">
            删除
          </button>
        </div>,
        document.body
      )}
    </div>
  )
}
