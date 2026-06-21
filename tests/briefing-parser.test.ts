import { describe, expect, it } from 'vitest'
import { parseBriefingMarkdown } from '@/lib/parse-briefing-markdown'

describe('parseBriefingMarkdown', () => {
  it('splits H2 sections', () => {
    const raw = `## 今日航标\nEval-driven dev is default.\n\n## Builder 动态\n@karpathy: data quality beats quantity.`
    const { sections, sources } = parseBriefingMarkdown(raw)
    expect(sections).toHaveLength(2)
    expect(sections[0].title).toBe('今日航标')
    expect(sections[1].title).toBe('Builder 动态')
    expect(sources).toHaveLength(0)
  })

  it('collects sources under 原始来源', () => {
    const raw = `## 原始来源\n### @karpathy\n- tweet a\n- tweet b\n### Latent Space\n- episode 1`
    const { sections, sources } = parseBriefingMarkdown(raw)
    expect(sections).toHaveLength(0)
    expect(sources).toHaveLength(2)
    expect(sources[0].title).toBe('@karpathy')
    expect(sources[0].items).toEqual(['- tweet a', '- tweet b'])
  })
})
