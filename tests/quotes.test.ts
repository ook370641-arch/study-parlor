import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { quotes, pickRandomQuote } from '../src/lib/quotes'

const QUOTES_MD = path.resolve('docs/superpowers/plans/quotes-collection-draft-2026-06-22.md')

describe('quotes library', () => {
  it('has at least one quote', () => {
    expect(quotes.length).toBeGreaterThan(0)
  })

  it('matches the curated markdown source', () => {
    const md = fs.readFileSync(QUOTES_MD, 'utf-8')
    const mdIds = [...md.matchAll(/^-\s+\*\*([^*\s]+)\*\*\s+(.+)$/gm)].map(m => m[1])
    const quoteIds = quotes.map(q => q.id)

    expect(quoteIds.length).toBe(mdIds.length)
    expect(new Set(quoteIds).size).toBe(mdIds.length)
    for (const id of quoteIds) {
      expect(mdIds).toContain(id)
    }
  })

  it('every quote has required fields', () => {
    for (const q of quotes) {
      expect(q.id).toBeTruthy()
      expect(q.text).toBeTruthy()
      expect(q.author).toBeTruthy()
    }
  })

  it('has unique ids', () => {
    const ids = quotes.map(q => q.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('pickRandomQuote returns a quote from the library', () => {
    const picked = pickRandomQuote()
    expect(picked).not.toBeNull()
    expect(quotes.some(q => q.id === picked!.id)).toBe(true)
  })

  it('pickRandomQuote can exclude a specific id', () => {
    const excludeId = quotes[0].id
    for (let i = 0; i < 50; i++) {
      const picked = pickRandomQuote({ excludeId })
      expect(picked).not.toBeNull()
      expect(picked!.id).not.toBe(excludeId)
    }
  })

  it('pickRandomQuote returns null for empty pool', () => {
    const picked = pickRandomQuote({ pool: [] })
    expect(picked).toBeNull()
  })
})
