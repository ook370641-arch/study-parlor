import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { GuideSidebar } from '../src/components/article-assistant/GuideSidebar'

describe('GuideSidebar', () => {
  it('renders without swap button', () => {
    render(<GuideSidebar />)
    expect(screen.queryByTestId('swap-painting-button')).not.toBeInTheDocument()
    expect(screen.queryByTestId('briefing-swap-painting-button')).not.toBeInTheDocument()
  })
})
