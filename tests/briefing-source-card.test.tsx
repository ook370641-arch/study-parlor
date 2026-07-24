import { describe, expect, it } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { BriefingSourceCard } from '@/components/briefing/BriefingSourceCard'
import { extractFirstLink } from '@/lib/parse-source-link'

describe('extractFirstLink', () => {
  it('extracts markdown link', () => {
    expect(extractFirstLink('[Swyx](https://x.com/swyx)')).toEqual({ text: 'Swyx', url: 'https://x.com/swyx' })
  })
  it('extracts bare url', () => {
    expect(extractFirstLink('Swyx https://x.com/swyx 晚间').url).toBe('https://x.com/swyx')
  })
  it('returns null url when no link', () => {
    expect(extractFirstLink('纯文本')).toEqual({ text: '纯文本', url: null })
  })
})

describe('BriefingSourceCard', () => {
  it('renders mono card with 原文 ↗ chip for linked items', () => {
    cleanup()
    render(<BriefingSourceCard item="[Swyx (AI Engineer)](https://x.com/swyx)" theme="academic" />)
    const link = screen.getByTestId('briefing-source-card-link')
    expect(link).toHaveAttribute('href', 'https://x.com/swyx')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    expect(screen.getByTestId('briefing-source-card').className).toContain('font-mono')
  })

  it('renders text without chip when item has no link', () => {
    cleanup()
    render(<BriefingSourceCard item="Swyx 播客笔记" theme="academic" />)
    expect(screen.queryByTestId('briefing-source-card-link')).not.toBeInTheDocument()
  })
})
