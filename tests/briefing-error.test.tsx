import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { BriefingError } from '@/components/BriefingError'

describe('BriefingError', () => {
  it('shows FEED_EMPTY message without retry', () => {
    render(<BriefingError code="FEED_EMPTY" onRetry={vi.fn()} />)
    expect(screen.getByText('今日海面平静，暂无新信号。')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('shows NETWORK_ERROR message with retry button', () => {
    const onRetry = vi.fn()
    render(<BriefingError code="NETWORK_ERROR" onRetry={onRetry} />)
    fireEvent.click(screen.getByRole('button', { name: '重试' }))
    expect(onRetry).toHaveBeenCalledOnce()
  })

  it('falls back to generic message for unknown errors', () => {
    render(<BriefingError code="UNKNOWN_CODE" onRetry={vi.fn()} />)
    expect(screen.getByText('简报生成失败，请重试。')).toBeInTheDocument()
  })
})
