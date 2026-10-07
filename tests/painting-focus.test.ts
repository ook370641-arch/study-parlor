// tests/painting-focus.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { applyFocusToIndex, FOCUS_RE } from '@electron/lib/painting-focus'

let dir: string
let indexPath: string

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'painting-focus-'))
  indexPath = path.join(dir, 'index.json')
  fs.writeFileSync(indexPath, JSON.stringify([
    { id: 'p1', file: 'a.jpg', painter: '莫奈', title: '睡莲' },
    { id: 'p2', file: 'b.jpg', painter: '梵高', title: '星夜', focus: '40% 60%' },
  ], null, 2))
})

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

describe('applyFocusToIndex', () => {
  it('写入非默认 focus', () => {
    const r = applyFocusToIndex(indexPath, 'p1', '62% 30%')
    expect(r).toEqual({ ok: true })
    const index = JSON.parse(fs.readFileSync(indexPath, 'utf-8'))
    expect(index[0].focus).toBe('62% 30%')
    expect(index[1].focus).toBe('40% 60%') // 其他条目不动
  })

  it('默认 focus 删除字段（与 curation-crop 约定一致）', () => {
    const r = applyFocusToIndex(indexPath, 'p2', '50% 50%')
    expect(r).toEqual({ ok: true })
    const index = JSON.parse(fs.readFileSync(indexPath, 'utf-8'))
    expect('focus' in index[1]).toBe(false)
  })

  it('非法 focus 拒绝且不写盘', () => {
    const before = fs.readFileSync(indexPath, 'utf-8')
    const r = applyFocusToIndex(indexPath, 'p1', 'abc')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe('INVALID_FOCUS')
    expect(fs.readFileSync(indexPath, 'utf-8')).toBe(before)
  })

  it('未知 id 报 UNKNOWN_PAINTING', () => {
    const r = applyFocusToIndex(indexPath, 'nope', '50% 30%')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe('UNKNOWN_PAINTING')
  })

  it('index.json 不存在报 INDEX_UNREADABLE', () => {
    const r = applyFocusToIndex(path.join(dir, 'missing.json'), 'p1', '50% 30%')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe('INDEX_UNREADABLE')
  })

  it('FOCUS_RE 与 curation-crop 一致', () => {
    expect(FOCUS_RE.test('50% 30%')).toBe(true)
    expect(FOCUS_RE.test('0% 100%')).toBe(true)
    expect(FOCUS_RE.test('50%30%')).toBe(false)
    expect(FOCUS_RE.test('50%')).toBe(false)
  })
})
