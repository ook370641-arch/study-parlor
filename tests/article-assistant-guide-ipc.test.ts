import { describe, it, expect } from 'vitest'
import { parseAssistantGuideBody, serializeGuide } from '../electron/ipc/article-assistant'

describe('parseAssistantGuideBody', () => {
  it('parses background and chunks with terms', () => {
    const body = `# 背景\n\nThis is background.\n\n## §1 Intro\n\nSummary one.\n\n**上下文（context）**：term（翻译）— explanation.`
    const result = parseAssistantGuideBody(body)
    expect(result).not.toBeNull()
    expect(result!.background).toBe('This is background.')
    expect(result!.chunks).toHaveLength(1)
    expect(result!.chunks[0].heading).toBe('Intro')
    expect(result!.chunks[0].terms[0].term).toBe('term')
  })

  it('returns null for empty body', () => {
    expect(parseAssistantGuideBody('')).toBeNull()
  })
})

describe('serializeGuide', () => {
  it('round-trips through parse', () => {
    const guide = {
      background: 'bg',
      chunks: [{ heading: 'H', summary: 'S', terms: [{ term: 'T', translation: 'X', explanation: 'E' }] }],
    }
    const parsed = parseAssistantGuideBody(serializeGuide(guide))
    expect(parsed).toEqual(guide)
  })
})

describe('serializeGuide v2', () => {
  it('writes context text in the body position and round-trips it into summary', () => {
    const guide = {
      background: 'bg',
      chunks: [{ heading: 'H', context: 'C 背景铺陈', terms: [] }],
    }
    const parsed = parseAssistantGuideBody(serializeGuide(guide as any))
    expect(parsed).not.toBeNull()
    expect(parsed!.chunks[0].summary).toBe('C 背景铺陈')
  })

  it('prefers context over summary when both present', () => {
    const guide = {
      background: 'bg',
      chunks: [{ heading: 'H', summary: '旧摘要', context: '新铺陈', terms: [] }],
    }
    expect(serializeGuide(guide as any)).toContain('新铺陈')
    expect(serializeGuide(guide as any)).not.toContain('旧摘要')
  })
})
