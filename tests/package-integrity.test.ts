import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(__dirname, '..')
const OUT_DIR = path.join(ROOT, 'out')
const PROMPTS_DIR = path.join(ROOT, 'electron', 'prompts')

describe('package integrity', () => {
  it('has required build outputs', () => {
    expect(fs.existsSync(path.join(OUT_DIR, 'main', 'index.js'))).toBe(true)
    expect(fs.existsSync(path.join(OUT_DIR, 'preload', 'index.js'))).toBe(true)
    expect(fs.existsSync(path.join(OUT_DIR, 'renderer', 'index.html'))).toBe(true)
  })

  it('has prompt templates readable from expected paths', () => {
    const required = [
      'learner-base.md',
      'mode-progress.md',
      'mode-review.md',
      'difficulty-mid.md',
      'difficulty-high.md',
      'difficulty-low.md'
    ]
    for (const name of required) {
      const filePath = path.join(PROMPTS_DIR, name)
      expect(fs.existsSync(filePath), `${name} should exist`).toBe(true)
      const content = fs.readFileSync(filePath, 'utf-8')
      expect(content.length, `${name} should have >50 bytes`).toBeGreaterThan(50)
    }
  })
})
