import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { useStore } from '../src/store'
import { FitnessWeightView } from '../src/components/fitness/FitnessWeightView'
import { DEFAULT_FITNESS_DATA } from '../src/lib/fitness'
import type { FitnessData } from '@shared/index'

function seed(): FitnessData {
  const d = structuredClone(DEFAULT_FITNESS_DATA)
  d.records = [
    { id: 'r1', date: '2026-09-03', routineId: 'push', entries: [
      { exerciseId: 'ex-bench', name: '平板卧推', sets: [{ weight: 55, reps: 8 }, { weight: 55, reps: 8 }, { weight: 55, reps: 8 }, { weight: 55, reps: 8 }] },
    ] },
    { id: 'r2', date: '2026-09-28', routineId: 'push', entries: [
      { exerciseId: 'ex-bench', name: '平板卧推', sets: [{ weight: 60, reps: 8 }, { weight: 60, reps: 8 }, { weight: 57.5, reps: 9 }, { weight: 55, reps: 10 }] },
    ] },
    { id: 'r3', date: '2026-09-30', routineId: 'pull', entries: [
      { exerciseId: 'ex-row', name: '杠铃划船', sets: [{ weight: 50, reps: 10 }] },
    ] },
  ]
  return d
}

beforeEach(() => { cleanup(); useStore.setState({ fitnessData: seed() }) })

describe('FitnessWeightView 落地态', () => {
  it('默认显示最新一笔记录（pull 9/30），其余序列淡显最近一次', () => {
    render(<FitnessWeightView theme="academic" onSwitch={() => {}} />)
    expect(screen.getByText('9月30日')).toBeTruthy()
    expect(screen.getAllByText('杠铃划船').length).toBeGreaterThan(0)
    // 推序列对照列显示其最近一次
    expect(screen.getAllByText('平板卧推').length).toBeGreaterThan(0)
  })
  it('快照标签列渲染全部记录，点击切换查看', () => {
    render(<FitnessWeightView theme="academic" onSwitch={() => {}} />)
    fireEvent.click(screen.getByTestId('fitness-record-chip-r1'))
    expect(screen.getByText('9月3日')).toBeTruthy()
  })
  it('空记录 → 空态引导', () => {
    useStore.setState({ fitnessData: structuredClone(DEFAULT_FITNESS_DATA) })
    render(<FitnessWeightView theme="academic" onSwitch={() => {}} />)
    expect(screen.getByTestId('fitness-empty')).toBeTruthy()
  })
  it('删除此记录 → 确认对话框 → 确认后以正确 id 调 deleteFitnessRecord', async () => {
    const del = vi.fn().mockResolvedValue(undefined)
    useStore.setState({ deleteFitnessRecord: del })
    render(<FitnessWeightView theme="academic" onSwitch={() => {}} />)
    // 默认查看最新一笔 r3
    fireEvent.click(screen.getByTestId('fitness-record-delete'))
    expect(screen.getByTestId('confirm-dialog')).toBeTruthy()
    fireEvent.click(screen.getByTestId('confirm-dialog-confirm'))
    await waitFor(() => expect(del).toHaveBeenCalledWith('r3'))
  })
})

describe('FitnessWeightView 记录态', () => {
  it('点记录当下 → 进入记录态并预填上次值', () => {
    render(<FitnessWeightView theme="academic" onSwitch={() => {}} />)
    fireEvent.click(screen.getByTestId('fitness-record-button'))
    // 今天无 schedule 命中时回退最近记录序列（pull）；切到 push 看预填
    fireEvent.click(screen.getByTestId('fitness-routine-tab-push'))
    const w0 = screen.getByTestId('fitness-set-weight-ex-bench-0') as HTMLInputElement
    expect(w0.value).toBe('60')
    // 4 组 = 4 格
    expect(screen.getByTestId('fitness-set-weight-ex-bench-3')).toBeTruthy()
  })
  it('取消回到落地态', () => {
    render(<FitnessWeightView theme="academic" onSwitch={() => {}} />)
    fireEvent.click(screen.getByTestId('fitness-record-button'))
    fireEvent.click(screen.getByTestId('fitness-record-cancel'))
    expect(screen.getByTestId('fitness-record-button')).toBeTruthy()
  })
})
