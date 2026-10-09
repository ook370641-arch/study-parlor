import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { loadFitness, writeFitness, fitnessFile } from '../electron/lib/fitness-store'

let dir: string
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fitness-test-')) })
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }) })

describe('fitness-store', () => {
  it('文件缺失 → 初始化默认并落盘', () => {
    const d = loadFitness(dir)
    expect(d.routines.map((r) => r.id)).toEqual(['push', 'pull', 'legs'])
    expect(fs.existsSync(fitnessFile(dir))).toBe(true)
  })
  it('写入 → 读取 roundtrip', () => {
    const d = loadFitness(dir)
    d.records.push({ id: 'r1', date: '2026-10-08', routineId: 'push', entries: [] })
    writeFitness(dir, d)
    expect(loadFitness(dir).records.length).toBe(1)
  })
  it('JSON 损坏 → 回退默认不抛异常', () => {
    fs.writeFileSync(fitnessFile(dir), '{not json', 'utf8')
    const d = loadFitness(dir)
    expect(d.version).toBe(1)
    expect(d.records).toEqual([])
  })
  it('字段非法 → normalize 兜底', () => {
    fs.writeFileSync(fitnessFile(dir), JSON.stringify({ version: 1, records: [{ bad: 1 }], routines: 42 }), 'utf8')
    const d = loadFitness(dir)
    expect(d.records).toEqual([])
    expect(d.routines.length).toBe(3)
  })
})
