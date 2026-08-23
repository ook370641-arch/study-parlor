import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import {
  collectionPath, loadCollection, saveCollection,
  addManualEntry, removeEntry, applyRecommend,
} from '../electron/lib/blog-collection'
import type { BlogCollectionFile, BlogRecommendBatch } from '../src/types'

let dir: string
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blog-col-')) })
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }) })

const empty = (): BlogCollectionFile => ({ version: 1, entries: [], dismissed: [], history: [] })

describe('loadCollection', () => {
  it('缺文件返回空集合', () => {
    expect(loadCollection(dir)).toEqual(empty())
  })
  it('version 不符时重置为空', () => {
    fs.mkdirSync(path.join(dir, 'Anthropic博客'), { recursive: true })
    fs.writeFileSync(collectionPath(dir), JSON.stringify({ version: 99, entries: [], dismissed: [], history: [] }))
    expect(loadCollection(dir)).toEqual(empty())
  })
  it('损坏 JSON 回退 .bak', () => {
    fs.mkdirSync(path.join(dir, 'Anthropic博客'), { recursive: true })
    const p = collectionPath(dir)
    const good = { version: 1, entries: [{ sourceUrl: 'u1', filePath: 'a.md', title: 't', addedAt: 'x', origin: 'manual' }], dismissed: [], history: [] }
    saveCollection(dir, good as BlogCollectionFile)
    fs.copyFileSync(p, p + '.bak')
    fs.writeFileSync(p, '{"broken')
    expect(loadCollection(dir).entries).toHaveLength(1)
  })
})

describe('addManualEntry', () => {
  it('添加手动条目并去重', () => {
    const c = empty()
    const c2 = addManualEntry(c, { sourceUrl: 'u1', filePath: 'a.md', title: 't' })
    expect(c2.entries).toHaveLength(1)
    expect(c2.entries[0].origin).toBe('manual')
    const c3 = addManualEntry(c2, { sourceUrl: 'u1', filePath: 'a.md', title: 't' })
    expect(c3.entries).toHaveLength(1)
  })
  it('手动收藏 dismissed URL 会将其剔除', () => {
    const c: BlogCollectionFile = { ...empty(), dismissed: ['u1'] }
    const c2 = addManualEntry(c, { sourceUrl: 'u1', filePath: 'a.md', title: 't' })
    expect(c2.dismissed).toEqual([])
  })
})

describe('removeEntry', () => {
  it('移除推荐条目记 dismissed；移除手动不记', () => {
    const c: BlogCollectionFile = {
      ...empty(),
      entries: [
        { sourceUrl: 'u1', filePath: 'a.md', title: 't', addedAt: 'x', origin: 'recommend', reason: 'r' },
        { sourceUrl: 'u2', filePath: 'b.md', title: 't', addedAt: 'x', origin: 'manual' },
      ],
    }
    const c2 = removeEntry(c, 'u1')
    expect(c2.dismissed).toEqual(['u1'])
    const c3 = removeEntry(c, 'u2')
    expect(c3.dismissed).toEqual([])
    expect(c3.entries).toHaveLength(1)
  })
})

describe('applyRecommend', () => {
  it('推荐批次替换 recommend 条目，保留 manual', () => {
    const c: BlogCollectionFile = {
      ...empty(),
      entries: [
        { sourceUrl: 'u1', filePath: 'a.md', title: 't', addedAt: 'x', origin: 'manual' },
        { sourceUrl: 'u2', filePath: 'b.md', title: 't', addedAt: 'x', origin: 'recommend', reason: 'old' },
      ],
    }
    const batch: BlogRecommendBatch = { batch: 1, generatedAt: 'g', profile: 'p', gaps: ['g1'], queries: ['q'], searchUsed: true }
    const picks = [{ sourceUrl: 'u3', filePath: 'c.md', title: 't', addedAt: 'x', origin: 'recommend' as const, reason: 'new', gap: 'g1', batch: 1 }]
    const c2 = applyRecommend(c, batch, picks)
    expect(c2.entries.map(e => e.sourceUrl).sort()).toEqual(['u1', 'u3'])
    expect(c2.history[0]).toEqual(batch)
  })
  it('历史批次追加最新在前，超 20 批滚动丢弃最旧', () => {
    const c: BlogCollectionFile = { ...empty(), history: Array.from({ length: 20 }, (_, i) => ({ batch: 19 - i, generatedAt: 'g', profile: 'p', gaps: [], queries: [], searchUsed: false })) }
    const batch: BlogRecommendBatch = { batch: 20, generatedAt: 'g', profile: 'p', gaps: [], queries: [], searchUsed: false }
    const c2 = applyRecommend(c, batch, [])
    expect(c2.history).toHaveLength(20)
    expect(c2.history[0].batch).toBe(20)
    expect(c2.history[19].batch).toBe(1)
  })
})
