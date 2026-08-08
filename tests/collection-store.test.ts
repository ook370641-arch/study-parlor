import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  collectionPathFor,
  readCollection,
  addCollectionEntry,
  removeCollectionEntry,
  appendCollectionQA,
  updateCollectionNote,
  updateCollectionQA,
} from '@electron/lib/collection-store'
import type { BriefingCollectionEntry } from '@shared/index'

let dir: string
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'collection-')) })
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }) })

function makeEntry(overrides: Partial<BriefingCollectionEntry> = {}): BriefingCollectionEntry {
  return {
    id: 'c-1',
    briefingFilePath: path.join(dir, '夜航简报', '夜航简报-2026-08-04.md'),
    briefingDate: '2026-08-04',
    chunkHeading: 'AI Safety',
    chunkIndex: 0,
    chunkBody: '正文快照',
    guide: { summary: '导读摘要', terms: [] },
    qa: [],
    qaMessageCount: 2,
    collectedAt: '2026-08-04T10:00:00.000Z',
    updatedAt: '2026-08-04T10:00:00.000Z',
    ...overrides,
  }
}

describe('collection-store', () => {
  it('文件缺失时返回空集合', () => {
    expect(readCollection(dir)).toEqual({ version: 1, entries: [] })
  })

  it('addEntry 新条目插入到最前', () => {
    addCollectionEntry(dir, makeEntry({ id: 'c-old' }))
    addCollectionEntry(dir, makeEntry({ id: 'c-new', chunkIndex: 1 }))
    const col = readCollection(dir)
    expect(col.entries.map((e) => e.id)).toEqual(['c-new', 'c-old'])
  })

  it('addEntry 同 (filePath, chunkIndex, chunkHeading) 去重返回 duplicate', () => {
    addCollectionEntry(dir, makeEntry())
    expect(addCollectionEntry(dir, makeEntry({ id: 'c-2' }))).toBe('duplicate')
    expect(readCollection(dir).entries).toHaveLength(1)
  })

  it('addEntry 同索引但 heading 不同（源重生成）允许收藏', () => {
    addCollectionEntry(dir, makeEntry())
    expect(addCollectionEntry(dir, makeEntry({ id: 'c-2', chunkHeading: '全新标题' }))).toBe('ok')
    expect(readCollection(dir).entries).toHaveLength(2)
  })

  it('removeEntry 按 id 删除', () => {
    addCollectionEntry(dir, makeEntry({ id: 'c-1' }))
    addCollectionEntry(dir, makeEntry({ id: 'c-2', chunkIndex: 1 }))
    removeCollectionEntry(dir, 'c-1')
    expect(readCollection(dir).entries.map((e) => e.id)).toEqual(['c-2'])
  })

  it('appendQA 追加问答并推进游标', () => {
    addCollectionEntry(dir, makeEntry({ id: 'c-1', qaMessageCount: 2 }))
    appendCollectionQA(dir, 'c-1', [{ role: 'user', content: '追问' }, { role: 'assistant', content: '回答' }], 4)
    const entry = readCollection(dir).entries[0]
    expect(entry.qa).toHaveLength(2)
    expect(entry.qaMessageCount).toBe(4)
    expect(Date.parse(entry.updatedAt)).toBeGreaterThan(Date.parse('2026-08-04T10:00:00.000Z'))
  })

  it('appendQA 游标不前进时幂等跳过', () => {
    addCollectionEntry(dir, makeEntry({ id: 'c-1', qaMessageCount: 4 }))
    appendCollectionQA(dir, 'c-1', [{ role: 'user', content: 'x' }], 4)
    expect(readCollection(dir).entries[0].qa).toHaveLength(0)
  })

  it('appendQA 对不存在的 id 静默跳过', () => {
    addCollectionEntry(dir, makeEntry())
    expect(() => appendCollectionQA(dir, 'nope', [{ role: 'user', content: 'x' }], 9)).not.toThrow()
  })

  it('updateNote 写入备注并更新 updatedAt', () => {
    addCollectionEntry(dir, makeEntry({ id: 'c-1' }))
    updateCollectionNote(dir, 'c-1', '这条值得重读')
    const entry = readCollection(dir).entries[0]
    expect(entry.note).toBe('这条值得重读')
    expect(Date.parse(entry.updatedAt)).toBeGreaterThan(Date.parse('2026-08-04T10:00:00.000Z'))
  })

  it('updateNote 空串清除备注字段', () => {
    addCollectionEntry(dir, makeEntry({ id: 'c-1', note: '旧备注' }))
    updateCollectionNote(dir, 'c-1', '   ')
    expect(readCollection(dir).entries[0].note).toBeUndefined()
  })

  it('updateNote 对不存在的 id 静默跳过', () => {
    addCollectionEntry(dir, makeEntry())
    expect(() => updateCollectionNote(dir, 'nope', 'x')).not.toThrow()
  })

  it('updateQA 整体替换 qa 且不动游标', () => {
    addCollectionEntry(dir, makeEntry({
      id: 'c-1',
      qa: [{ role: 'user', content: '这是什么' }, { role: 'assistant', content: '回答一' }],
      qaMessageCount: 2,
    }))
    updateCollectionQA(dir, 'c-1', [{ role: 'assistant', content: '回答一（删改后）' }])
    const entry = readCollection(dir).entries[0]
    expect(entry.qa).toEqual([{ role: 'assistant', content: '回答一（删改后）' }])
    expect(entry.qaMessageCount).toBe(2)
    expect(Date.parse(entry.updatedAt)).toBeGreaterThan(Date.parse('2026-08-04T10:00:00.000Z'))
  })

  it('updateQA 空数组清空旁注', () => {
    addCollectionEntry(dir, makeEntry({ id: 'c-1', qa: [{ role: 'user', content: 'q' }] }))
    updateCollectionQA(dir, 'c-1', [])
    expect(readCollection(dir).entries[0].qa).toEqual([])
  })

  it('updateQA 对不存在的 id 静默跳过', () => {
    addCollectionEntry(dir, makeEntry())
    expect(() => updateCollectionQA(dir, 'nope', [{ role: 'user', content: 'x' }])).not.toThrow()
  })

  it('主文件损坏后从 .bak 恢复上次写入的数据', () => {
    addCollectionEntry(dir, makeEntry({ id: 'c-good' }))
    addCollectionEntry(dir, makeEntry({ id: 'c-good-2', chunkIndex: 1 }))
    const p = collectionPathFor(dir)
    fs.writeFileSync(p, '{broken', 'utf8')
    const col = readCollection(dir)
    expect(col.entries.map((e) => e.id)).toEqual(['c-good'])
  })

  it('损坏且无 .bak 时返回空集合', () => {
    const p = collectionPathFor(dir)
    fs.mkdirSync(path.dirname(p), { recursive: true })
    fs.writeFileSync(p, '{broken', 'utf8')
    expect(readCollection(dir)).toEqual({ version: 1, entries: [] })
  })

  it('version 不匹配视为空集合', () => {
    const p = collectionPathFor(dir)
    fs.mkdirSync(path.dirname(p), { recursive: true })
    fs.writeFileSync(p, JSON.stringify({ version: 999, entries: [makeEntry()] }), 'utf8')
    expect(readCollection(dir).entries).toEqual([])
  })
})
