import { describe, expect, it } from 'vitest'
import { buildListingScript } from '../electron/lib/anthropic-scraper'
import { ANTHROPIC_SOURCES } from '../electron/lib/anthropic-sections'

describe('buildListingScript', () => {
  it('同 URL 的图片链接和标题链接合并，不丢失标题或封面', () => {
    document.body.innerHTML = `
      <article><a href="/research/shared"><img src="/hero.jpg" /></a></article>
      <div><a href="/research/shared"><h2>Shared Engineering</h2><time>Oct 1, 2026</time></a></div>
    `
    const source = ANTHROPIC_SOURCES.find(item => item.key === 'engineering')!
    const cards = eval(buildListingScript(source)) as { url: string; title: string | null; dateText: string | null; imageUrl: string | null }[]
    expect(cards).toHaveLength(1)
    expect(cards[0].title).toBe('Shared Engineering')
    expect(cards[0].dateText).toBe('Oct 1, 2026')
    expect(cards[0].imageUrl).toBe('/hero.jpg')
  })
})
