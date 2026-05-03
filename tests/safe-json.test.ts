import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { safeReadJson, safeWriteJson } from '@electron/lib/safe-json'

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'sp-'))

describe('safe-json', () => {
  let dir: string
  beforeEach(() => { dir = tmp() })
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }))

  it('returns fallback when file does not exist', () => {
    const out = safeReadJson(path.join(dir, 'state.json'), { fallback: { a: 1 } })
    expect(out).toEqual({ a: 1 })
  })

  it('returns parsed JSON when file is valid', () => {
    const p = path.join(dir, 'state.json')
    fs.writeFileSync(p, JSON.stringify({ a: 2 }))
    const out = safeReadJson(p, { fallback: { a: 1 } })
    expect(out).toEqual({ a: 2 })
  })

  it('falls back to .bak when main file is corrupted', () => {
    const p = path.join(dir, 'state.json')
    fs.writeFileSync(p, '{not-json')
    fs.writeFileSync(p + '.bak', JSON.stringify({ recovered: true }))
    const out = safeReadJson(p, { fallback: { recovered: false } })
    expect(out).toEqual({ recovered: true })
  })

  it('writes atomically and creates .bak from previous version', () => {
    const p = path.join(dir, 'state.json')
    safeWriteJson(p, { v: 1 })
    safeWriteJson(p, { v: 2 })
    expect(JSON.parse(fs.readFileSync(p, 'utf8'))).toEqual({ v: 2 })
    expect(JSON.parse(fs.readFileSync(p + '.bak', 'utf8'))).toEqual({ v: 1 })
  })
})
