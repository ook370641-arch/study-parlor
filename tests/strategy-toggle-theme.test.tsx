import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

vi.mock('@/lib/ipc', () => ({
  ipc: { patchState: vi.fn().mockResolvedValue(undefined) },
}))

import { useStore } from '@/store'
import { StrategyToggle } from '@/components/StrategyToggle'

beforeEach(() => {
  cleanup()
  useStore.setState({
    briefingTheme: 'academic',
    inspirationStrategy: 'v2',
  })
})

describe('StrategyToggle theme', () => {
  it('renders without crashing in academic mode', () => {
    render(<StrategyToggle />)
    expect(screen.getByTestId('strategy-toggle')).toBeInTheDocument()
  })

  it('renders without crashing in newspaper mode', () => {
    useStore.setState({ briefingTheme: 'newspaper' })
    render(<StrategyToggle />)
    expect(screen.getByTestId('strategy-toggle')).toBeInTheDocument()
  })

  it('renders a button inside the toggle', () => {
    render(<StrategyToggle />)
    expect(screen.getByRole('button')).toBeInTheDocument()
  })
})
