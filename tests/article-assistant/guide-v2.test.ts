import { describe, it, expect } from 'vitest'
import {
  parseGuidePlan,
  assignMaterials,
  countStreamedChunks,
  isValidGuideV2,
  buildGuidePlanPrompt,
  buildGuideV2UserPrompt,
} from '../../electron/lib/guide-v2'

describe('parseGuidePlan', () => {
  const entryCount = 14

  it('parses valid plan and keeps query->entries mapping', () => {
    const raw = '{"queries":[{"query":"Andrej Karpathy background","entries":[1],"reason":"人物履历"},{"query":"AI agent CRM landscape","entries":[7,9]}]}'
    const plan = parseGuidePlan(raw, entryCount)
    expect(plan).toHaveLength(2)
    expect(plan[0]).toMatchObject({ query: 'Andrej Karpathy background', entries: [1] })
    expect(plan[1].entries).toEqual([7, 9])
  })

  it('drops queries with out-of-range or empty entries', () => {
    const raw = '{"queries":[{"query":"ok","entries":[1,99]},{"query":"bad","entries":[99]},{"query":"empty","entries":[]}]}'
    const plan = parseGuidePlan(raw, entryCount)
    expect(plan).toHaveLength(1)
    expect(plan[0].entries).toEqual([1])
  })

  it('dedupes entries within one query', () => {
    const raw = '{"queries":[{"query":"x","entries":[2,2,3]}]}'
    expect(parseGuidePlan(raw, entryCount)[0].entries).toEqual([2, 3])
  })

  it('returns empty array for malformed JSON and wrong shapes', () => {
    expect(parseGuidePlan('not json at all', entryCount)).toEqual([])
    expect(parseGuidePlan('{"foo":1}', entryCount)).toEqual([])
    expect(parseGuidePlan('{"queries":"nope"}', entryCount)).toEqual([])
  })

  it('tolerates markdown fences around the JSON', () => {
    const raw = '```json\n{"queries":[{"query":"x","entries":[1]}]}\n```'
    expect(parseGuidePlan(raw, entryCount)).toHaveLength(1)
  })
})

describe('assignMaterials', () => {
  it('assigns each query result to its entries; shared query lands in both folders', () => {
    const queries = [
      { query: 'a', entries: [1] },
      { query: 'b', entries: [2, 3] },
    ]
    const m1 = [{ title: 'T1', url: 'https://a', snippet: 's1' }]
    const m2 = [{ title: 'T2', url: 'https://b', snippet: 's2' }]
    const folders = assignMaterials(queries, [m1, m2])
    expect(folders.get(1)).toEqual(m1)
    expect(folders.get(2)).toEqual(m2)
    expect(folders.get(3)).toEqual(m2)
  })

  it('failed query (null) leaves folders empty; entry without any query absent', () => {
    const queries = [{ query: 'a', entries: [1] }]
    const folders = assignMaterials(queries, [null])
    expect(folders.get(1)).toBeUndefined()
    expect(folders.size).toBe(0)
  })

  it('dedupes by url when two queries serve the same entry', () => {
    const queries = [{ query: 'a', entries: [1] }, { query: 'b', entries: [1] }]
    const shared = { title: 'S', url: 'https://same', snippet: 'x' }
    const folders = assignMaterials(queries, [[shared], [shared, { title: 'O', url: 'https://other', snippet: 'y' }]])
    expect(folders.get(1)).toHaveLength(2)
  })
})

describe('countStreamedChunks', () => {
  it('counts "heading" keys in accumulated partial JSON', () => {
    expect(countStreamedChunks('{"background":"x","chunks":[{"heading":"A","context":"…')).toBe(1)
    expect(countStreamedChunks('')).toBe(0)
    // 正文里提到 heading 一词但没有 JSON 键形态时不计
    expect(countStreamedChunks('the heading of this section')).toBe(0)
  })
})

describe('isValidGuideV2', () => {
  const valid = {
    background: 'bg',
    chunks: [
      { heading: 'H', context: '背景铺陈', terms: [{ term: 't', translation: 'x', explanation: 'e' }] },
      { heading: 'H2', context: '背景2', terms: [] },
    ],
  }
  it('accepts a valid v2 guide', () => {
    expect(isValidGuideV2(valid)).toBe(true)
  })
  it('rejects v1 shape (summary instead of context)', () => {
    const v1 = { background: 'bg', chunks: [{ heading: 'H', summary: 's', terms: [] }] }
    expect(isValidGuideV2(v1)).toBe(false)
  })
  it('rejects empty context, empty chunks, missing background', () => {
    expect(isValidGuideV2({ background: 'b', chunks: [{ heading: 'H', context: '  ', terms: [] }] })).toBe(false)
    expect(isValidGuideV2({ background: 'b', chunks: [] })).toBe(false)
    expect(isValidGuideV2({ chunks: valid.chunks })).toBe(false)
  })
})

describe('prompts', () => {
  it('buildGuidePlanPrompt states entry count and JSON-only output', () => {
    const p = buildGuidePlanPrompt('## A\nx\n## B\ny', '夜航简报')
    expect(p).toContain('§1–§2')
    expect(p).toContain('"queries"')
    expect(p).toContain('"entries"')
    expect(p).toMatch(/不要 markdown|禁.*markdown|只输出 JSON/)
    expect(p).toContain('## A')
  })

  it('buildGuideV2UserPrompt marks entries without materials explicitly', () => {
    const materials = new Map([[2, [{ title: 'T', url: 'https://x', snippet: 's' }]]])
    const p = buildGuideV2UserPrompt({ articleContent: '## A\nx\n## B\ny', articleTitle: '夜航简报', materials, entryCount: 2 })
    expect(p).toContain('### §1')
    expect(p).toContain('无外部资料')
    expect(p).toContain('### §2')
    expect(p).toContain('https://x')
  })
})
