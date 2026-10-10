// src/components/fitness/FitnessBodyView.tsx —— 尺寸面：记一次表单 + 历史表格 + 趋势
import { useMemo, useState } from 'react'
import { useStore } from '@/store'
import type { BriefingTheme, BodyMetric } from '@shared/index'
import { fitnessColors } from '@/lib/fitness-theme'
import { BODY_METRIC_DEFS, bodyTrendPoints, todayStr, type BodyMetricKey } from '@/lib/fitness'
import { TrendChart } from './TrendChart'
import { FitnessFaceHeader, type FitnessFace } from './FitnessFaceHeader'

export function FitnessBodyView({ theme, onSwitch }: {
  theme: BriefingTheme
  onSwitch: (f: FitnessFace) => void
}) {
  const c = fitnessColors(theme)
  const data = useStore((s) => s.fitnessData)
  const saveBodyMetric = useStore((s) => s.saveBodyMetric)
  const deleteBodyMetric = useStore((s) => s.deleteBodyMetric)
  const [form, setForm] = useState<Record<string, string>>({})
  const [metric, setMetric] = useState<BodyMetricKey>('weight')

  const sorted = useMemo(
    () => [...(data?.bodyMetrics ?? [])].sort((a, b) => (a.date > b.date ? -1 : 1)),
    [data],
  )
  const availableMetrics = BODY_METRIC_DEFS.filter((d) => sorted.some((m) => typeof m[d.key] === 'number'))
  const activeMetric = availableMetrics.some((d) => d.key === metric) ? metric : (availableMetrics[0]?.key ?? 'weight')
  const points = useMemo(() => (data ? bodyTrendPoints(data, activeMetric) : []), [data, activeMetric])

  if (!data) return null

  const save = async () => {
    const m: BodyMetric = { date: todayStr() }
    for (const def of BODY_METRIC_DEFS) {
      const v = parseFloat(form[def.key] ?? '')
      if (Number.isFinite(v) && v > 0) m[def.key] = v
    }
    if (Object.keys(m).length === 1) return // 只有 date = 全空
    await saveBodyMetric(m)
    setForm({})
  }

  return (
    <div style={{ color: c.text, fontFamily: 'Georgia, "Songti SC", "SimSun", serif', fontSize: 12 }}>
      <FitnessFaceHeader theme={theme} face="body" onSwitch={onSwitch} right={
        <span style={{ color: c.faint, fontSize: 10 }}>全部选填 · 同日再记覆盖</span>
      } />
      <div style={{ display: 'grid', gridTemplateColumns: '230px 1fr' }}>
        <div style={{ padding: '12px 16px', borderRight: `1px solid ${c.hairline}` }}>
          <div style={{ color: c.dim, fontSize: 11, letterSpacing: 2, marginBottom: 8 }}>记一次 · {todayStr().slice(5).replace('-', '/')}</div>
          {BODY_METRIC_DEFS.map((def) => (
            <div key={def.key} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 7, fontSize: 11 }}>
              <span style={{ color: c.dim, width: 40 }}>{def.label}</span>
              <input data-testid={`fitness-body-input-${def.key}`} value={form[def.key] ?? ''}
                inputMode="decimal" placeholder="—"
                onChange={(e) => setForm({ ...form, [def.key]: e.target.value })}
                style={{
                  width: 56, background: c.cellBg, border: `1px solid ${c.hairline}`, borderRadius: 4,
                  color: c.text, textAlign: 'center', padding: '3px 0', fontSize: 11, outline: 'none', fontFamily: 'inherit',
                }} />
              <span style={{ color: c.faint }}>{def.unit}</span>
            </div>
          ))}
          <button type="button" data-testid="fitness-body-save" onClick={() => void save()}
            style={{ marginTop: 6, border: `1px solid ${c.amber}`, color: c.amber, borderRadius: 14, padding: '4px 16px', fontSize: 11, background: 'none', cursor: 'pointer' }}>存</button>
        </div>
        <div style={{ padding: '12px 16px' }}>
          {sorted.length === 0 ? (
            <div data-testid="fitness-body-empty" style={{ color: c.faint, fontSize: 11, padding: '20px 0' }}>还没有尺寸记录</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10.5 }}>
              <thead>
                <tr>
                  {['日期', ...BODY_METRIC_DEFS.map((d) => d.label), ''].map((h, i) => (
                    <th key={i} style={{ padding: '3px 6px', textAlign: i === 0 ? 'left' : 'right', color: c.faint, fontWeight: 'normal', fontSize: 9.5, borderBottom: `1px solid ${c.hairline}` }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map((m) => (
                  <tr key={m.date} data-testid={`fitness-body-row-${m.date}`}>
                    <td style={{ padding: '3px 6px', color: c.dim, borderBottom: `1px solid ${c.hairline}` }}>{m.date.slice(5).replace('-', '/')}</td>
                    {BODY_METRIC_DEFS.map((d) => (
                      <td key={d.key} style={{ padding: '3px 6px', textAlign: 'right', borderBottom: `1px solid ${c.hairline}` }}>
                        {typeof m[d.key] === 'number' ? m[d.key] : <span style={{ color: c.faint }}>—</span>}
                      </td>
                    ))}
                    <td style={{ padding: '3px 6px', textAlign: 'right', borderBottom: `1px solid ${c.hairline}` }}>
                      <button type="button" data-testid={`fitness-body-delete-${m.date}`} onClick={() => void deleteBodyMetric(m.date)}
                        style={{ background: 'none', border: 'none', color: c.faint, cursor: 'pointer', fontSize: 10, padding: 0 }}>×</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '10px 0 4px', flexWrap: 'wrap' }}>
            <span style={{ color: c.faint, fontSize: 10 }}>趋势</span>
            {availableMetrics.map((d) => (
              <button key={d.key} type="button" data-testid={`fitness-body-metric-${d.key}`} onClick={() => setMetric(d.key)}
                style={{
                  fontSize: 10, padding: '2px 10px', borderRadius: 10, cursor: 'pointer', background: 'none',
                  border: `1px solid ${d.key === activeMetric ? c.amber : c.hairline}`,
                  color: d.key === activeMetric ? c.amber : c.dim,
                }}>{d.label}</button>
            ))}
          </div>
          <TrendChart points={points} colors={c} unit={BODY_METRIC_DEFS.find((d) => d.key === activeMetric)?.unit} />
        </div>
      </div>
    </div>
  )
}
