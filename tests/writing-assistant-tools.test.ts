import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { resolveSourcePath } from '../electron/lib/writing-assistant/tools'
import type { AppConfig } from '../electron/env'

function tmpLib(): { dir: string; cfg: AppConfig } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wa-tools-'))
  fs.mkdirSync(path.join(dir, 'writing', '日记'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'repository'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'writing', '日记', '8.9.md'), '# 正文')
  fs.writeFileSync(path.join(dir, 'repository', '旧随笔.md'), '# 旧')
  const cfg = { apiKey: 'sk-test', baseUrl: 'https://x', model: 'm', libraryPath: dir } as AppConfig
  return { dir, cfg }
}

describe('resolveSourcePath (S2 双重前缀修复)', () => {
  it('resolves catalog-style id with redundant prefix', () => {
    const { dir, cfg } = tmpLib()
    const p = resolveSourcePath(cfg.libraryPath, 'writing', 'writing/日记/8.9.md')
    expect(p).toBe(path.join(dir, 'writing', '日记', '8.9.md'))
    expect(fs.existsSync(p!)).toBe(true)
  })

  it('resolves clean id without prefix', () => {
    const { dir, cfg } = tmpLib()
    const p = resolveSourcePath(cfg.libraryPath, 'writing', '日记/8.9.md')
    expect(p).toBe(path.join(dir, 'writing', '日记', '8.9.md'))
    expect(fs.existsSync(p!)).toBe(true)
  })

  it('resolves repository with redundant prefix', () => {
    const { dir, cfg } = tmpLib()
    const p = resolveSourcePath(cfg.libraryPath, 'repository', 'repository/旧随笔.md')
    expect(p).toBe(path.join(dir, 'repository', '旧随笔.md'))
    expect(fs.existsSync(p!)).toBe(true)
  })
})
