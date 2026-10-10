import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { useStore } from '../src/store'
import { FitnessBodyView } from '../src/components/fitness/FitnessBodyView'
import { FitnessPlanView } from '../src/components/fitness/FitnessPlanView'
import { DEFAULT_FITNESS_DATA } from '../src/lib/fitness'
import type { FitnessData, BodyMetric } from '@shared/index'

let savedMetric: BodyMetric | null = null
let savedPlan: { routines: unknown; schedule: unknown } | null = null

beforeEach(() => {
  cleanup()
  savedMetric = null
  savedPlan = null
  const data: FitnessData = structuredClone(DEFAULT_FITNESS_DATA)
  data.bodyMetrics = [
    { date: '2026-09-03', weight: 72 },
    { date: '2026-09-28', weight: 72.5, waist: 84 },
  ]
  useStore.setState({
    fitnessData: data,
    saveBodyMetric: async (m: BodyMetric) => { savedMetric = m },
    deleteBodyMetric: async () => {},
    saveFitnessPlan: async (routines: never, schedule: never) => { savedPlan = { routines, schedule } },
  } as never)
})

describe('FitnessBodyView', () => {
  it('历史表格按日期倒序，缺项显 —', () => {
    render(<FitnessBodyView theme="academic" onSwitch={() => {}} />)
    const rows = screen.getAllByTestId(/^fitness-body-row-/)
    expect(rows[0].getAttribute('data-testid')).toContain('2026-09-28')
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
  })
  it('填体重保存 → 调 saveBodyMetric 带今天日期', async () => {
    render(<FitnessBodyView theme="academic" onSwitch={() => {}} />)
    fireEvent.change(screen.getByTestId('fitness-body-input-weight'), { target: { value: '73' } })
    fireEvent.click(screen.getByTestId('fitness-body-save'))
    expect(savedMetric?.weight).toBe(73)
    expect(savedMetric?.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
  it('全空不保存', () => {
    render(<FitnessBodyView theme="academic" onSwitch={() => {}} />)
    fireEvent.click(screen.getByTestId('fitness-body-save'))
    expect(savedMetric).toBeNull()
  })
})

describe('FitnessPlanView', () => {
  it('渲染三序列与组数；保存调 saveFitnessPlan', async () => {
    render(<FitnessPlanView theme="academic" onBack={() => {}} />)
    expect(screen.getByText('推')).toBeTruthy()
    fireEvent.change(screen.getByTestId('fitness-plan-sets-push-ex-bench'), { target: { value: '5' } })
    fireEvent.click(screen.getByTestId('fitness-plan-save'))
    expect(savedPlan).not.toBeNull()
  })
  it('周安排格子点击循环 休→推→拉→腿→休', () => {
    render(<FitnessPlanView theme="academic" onBack={() => {}} />)
    const cell = screen.getByTestId('fitness-plan-weekday-7') // 周日默认休
    expect(cell.textContent).toContain('休')
    fireEvent.click(cell)
    expect(cell.textContent).toContain('推')
  })
})
