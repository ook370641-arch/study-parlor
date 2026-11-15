import { describe, expect, it } from 'vitest'
import { restoreArticlePanelMode } from '@/lib/article-panel-mode'

describe('restoreArticlePanelMode', () => {
  it('keeps guide and companion but never restores an active browser', () => {
    expect(restoreArticlePanelMode({ anthropic: 'browser', book: 'companion' })).toEqual({
      anthropic: 'guide',
      book: 'companion',
    })
  })

  it('falls back to guide for missing values', () => {
    expect(restoreArticlePanelMode(undefined)).toEqual({ anthropic: 'guide', book: 'guide' })
  })
})
