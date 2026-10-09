import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { TrendChart } from '../src/components/fitness/TrendChart'
import { fitnessColors } from '../src/lib/fitness-theme'

beforeEach(() => cleanup())

const PTS = [
  { date: '2026-09-03', value: 55, label: '55 × 8' },
  { date: '2026-09-28', value: 60, label: '60 × 8' },
  { date: '2026-10-27', value: 62.5, label: '62.5 × 8' },
]

describe('TrendChart', () => {
  it('0 点 → 空态文案', () => {
    render(<TrendChart points={[]} colors={fitnessColors('academic')} />)
    expect(screen.getByTestId('fitness-trend-empty')).toBeTruthy()
  })
  it('1 点 → 有圆点无折线', () => {
    const { container } = render(<TrendChart points={[PTS[0]]} colors={fitnessColors('academic')} />)
    expect(container.querySelectorAll('circle').length).toBe(1)
    expect(container.querySelectorAll('polyline').length).toBe(0)
  })
  it('3 点 → 折线 + 3 圆点 + 日期标注', () => {
    const { container } = render(<TrendChart points={PTS} colors={fitnessColors('academic')} />)
    expect(container.querySelectorAll('polyline').length).toBe(1)
    expect(container.querySelectorAll('circle').length).toBe(3)
    expect(screen.getByText('9/28')).toBeTruthy()
  })
  it('点可点击回调日期；activeDate 点带光晕', () => {
    let picked = ''
    render(<TrendChart points={PTS} colors={fitnessColors('academic')} activeDate="2026-09-28" onSelectDate={(d) => { picked = d }} />)
    fireEvent.click(screen.getByTestId('fitness-trend-point-2026-10-27'))
    expect(picked).toBe('2026-10-27')
    const active = screen.getByTestId('fitness-trend-point-2026-09-28')
    expect(active.getAttribute('stroke')).toBeTruthy()
  })
  it('min==max 不除零', () => {
    const { container } = render(<TrendChart points={[{ date: '2026-09-03', value: 60, label: '60' }, { date: '2026-09-04', value: 60, label: '60' }]} colors={fitnessColors('academic')} />)
    expect(container.querySelectorAll('circle').length).toBe(2)
  })
})
