// src/components/fitness/TrendChart.tsx —— 手写 SVG 折线；数据稀疏是常态（2 点也画线）
import type { TrendPoint } from '@/lib/fitness'
import { shortDate } from '@/lib/fitness'
import type { FitnessColors } from '@/lib/fitness-theme'

const W = 720, H = 150, PL = 46, PR = 24, PT = 20, PB = 26

export function TrendChart({ points, colors, activeDate, unit, onSelectDate }: {
  points: TrendPoint[]
  colors: FitnessColors
  activeDate?: string | null
  unit?: string
  onSelectDate?: (date: string) => void
}) {
  if (points.length === 0) {
    return (
      <div data-testid="fitness-trend-empty" style={{ color: colors.faint, fontSize: 11, padding: '18px 0', textAlign: 'center' }}>
        还没有记录，记一笔之后这里会长出折线
      </div>
    )
  }

  const values = points.map((p) => p.value)
  let min = Math.min(...values)
  let max = Math.max(...values)
  if (min === max) { min -= 1; max += 1 }
  const span = max - min
  min -= span * 0.15
  max += span * 0.15

  const x = (i: number) => (points.length === 1 ? (PL + W - PR) / 2 : PL + (i * (W - PL - PR)) / (points.length - 1))
  const y = (v: number) => PT + ((max - v) * (H - PT - PB)) / (max - min)
  const fmtTick = (v: number) => (Math.abs(v) >= 100 ? String(Math.round(v)) : String(Math.round(v * 10) / 10))
  const mid = (min + max) / 2

  return (
    <svg data-testid="fitness-trend-chart" viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 130, display: 'block' }}>
      {[min + span * 0.15, mid, max - span * 0.15].map((v, i) => (
        <g key={i}>
          <line x1={PL} y1={y(v)} x2={W - PR} y2={y(v)} stroke={colors.hairline} strokeWidth={i === 1 ? 0.6 : 1} />
          <text x={PL - 6} y={y(v) + 3} fill={colors.faint} fontSize={9} textAnchor="end">{fmtTick(v)}</text>
        </g>
      ))}
      {unit && <text x={PL - 6} y={10} fill={colors.faint} fontSize={9} textAnchor="end">{unit}</text>}
      {points.length >= 2 && (
        <polyline
          points={points.map((p, i) => `${x(i)},${y(p.value)}`).join(' ')}
          fill="none" stroke={colors.text} strokeWidth={1.2} opacity={0.75}
        />
      )}
      {points.map((p, i) => {
        const active = activeDate === p.date
        return (
          <g key={`${p.date}-${i}`} style={{ cursor: onSelectDate ? 'pointer' : 'default' }}
             onClick={() => onSelectDate?.(p.date)}>
            <circle
              data-testid={`fitness-trend-point-${p.date}`}
              cx={x(i)} cy={y(p.value)} r={active ? 3.6 : 3}
              fill={colors.amber}
              stroke={active ? colors.bg : 'none'} strokeWidth={active ? 2 : 0}
            />
            <text x={x(i)} y={y(p.value) - 9} fill={colors.text} fontSize={9.5} textAnchor="middle">{p.label}</text>
            <text x={x(i)} y={H - 8} fill={active ? colors.text : colors.dim} fontSize={9} textAnchor="middle">{shortDate(p.date)}</text>
          </g>
        )
      })}
    </svg>
  )
}
