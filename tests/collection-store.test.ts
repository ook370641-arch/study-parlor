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

  it('addEntry 同 (filePath, chunkIndex) 去重返回 duplicate', () => {
    addCollectionEntry(dir, makeEntry())
    expect(addCollectionEntry(dir, makeEntry({ id: 'c-2' }))).toBe('duplicate')
    expect(readCollection(dir).entries).toHaveLength(1)
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

  it('损坏 JSON 走 .bak 备份并返回空集合', () => {
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
