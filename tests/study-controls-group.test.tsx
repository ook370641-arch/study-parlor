import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'

vi.mock('@/lib/ipc', () => ({ ipc: { patchState: vi.fn(), getState: vi.fn() } }))

import { useStore } from '@/store'
import { StudyControlsGroup } from '@/components/StudyControlsGroup'

beforeEach(() => {
  cleanup()
  useStore.setState({
    briefingTheme: 'academic',
    briefingFontSize: 'base',
    writingUIFontSize: 'base',
    currentPaintings: {
      home: { id: 'test', url: '/test.jpg', painter: 'Mark Rothko' as const, title: 'Test' },
      study: { id: 'test', url: '/test.jpg', painter: 'Mark Rothko' as const, title: 'Test' },
      cover: { id: 'test', url: '/test.jpg', painter: 'Mark Rothko' as const, title: 'Test' },
      briefing: { id: 'test', url: '/test.jpg', painter: 'Mark Rothko' as const, title: 'Test' },
    },
  })
})

describe('StudyControlsGroup', () => {
  it('renders both buttons in academic mode', () => {
    render(<StudyControlsGroup surface="home" />)
    expect(screen.getByTestId('study-controls-swap-painting')).toBeInTheDocument()
    expect(screen.getByTestId('study-controls-theme-toggle')).toBeInTheDocument()
  })

  it('hides swap painting button in newspaper mode', () => {
    useStore.setState({ briefingTheme: 'newspaper' })
    render(<StudyControlsGroup surface="home" />)
    expect(screen.queryByTestId('study-controls-swap-painting')).not.toBeInTheDocument()
    expect(screen.getByTestId('study-controls-theme-toggle')).toBeInTheDocument()
  })

  it('toggles theme from academic to newspaper and back', async () => {
    useStore.setState({ briefingTheme: 'academic' })
    render(<StudyControlsGroup surface="home" />)
    const toggle = screen.getByTestId('study-controls-theme-toggle')

    expect(useStore.getState().briefingTheme).toBe('academic')
    fireEvent.click(toggle)
    expect(useStore.getState().briefingTheme).toBe('newspaper')
    fireEvent.click(toggle)
    expect(useStore.getState().briefingTheme).toBe('academic')
  })

  it('shows correct title attribute on theme toggle button', () => {
    useStore.setState({ briefingTheme: 'academic' })
    const { rerender } = render(<StudyControlsGroup surface="home" />)
    expect(screen.getByTestId('study-controls-theme-toggle')).toHaveAttribute('title', '切换报纸版式')

    useStore.setState({ briefingTheme: 'newspaper' })
    rerender(<StudyControlsGroup surface="home" />)
    expect(screen.getByTestId('study-controls-theme-toggle')).toHaveAttribute('title', '切换学术版式')
  })

  it('replaces theme toggle with interface font controls when requested', async () => {
    render(<StudyControlsGroup surface="home" uiFontControls />)

    expect(screen.queryByTestId('study-controls-theme-toggle')).not.toBeInTheDocument()
    expect(screen.getByTestId('study-controls-swap-painting')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('study-controls-font-size-increase'))
    await waitFor(() => expect(useStore.getState().writingUIFontSize).toBe('lg'))
    expect(useStore.getState().briefingFontSize).toBe('base')
    fireEvent.click(screen.getByTestId('study-controls-font-size-decrease'))
    await waitFor(() => expect(useStore.getState().writingUIFontSize).toBe('base'))
  })

  it('disables interface font controls at size limits', () => {
    useStore.setState({ writingUIFontSize: 'sm' })
    const { rerender } = render(<StudyControlsGroup surface="home" uiFontControls />)
    expect(screen.getByTestId('study-controls-font-size-decrease')).toBeDisabled()

    useStore.setState({ writingUIFontSize: '7xl' })
    rerender(<StudyControlsGroup surface="home" uiFontControls />)
    expect(screen.getByTestId('study-controls-font-size-increase')).toBeDisabled()
  })
})
