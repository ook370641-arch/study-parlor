import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const PROMPTS_DIR = path.resolve(__dirname, '..', 'electron', 'prompts')

function readPrompt(name: string): string {
  return fs.readFileSync(path.join(PROMPTS_DIR, name), 'utf8')
}

describe('wild-card-v1.md', () => {
  const prompt = readPrompt('wild-card-v1.md')

  it('contains required placeholders', () => {
    expect(prompt).toContain('{{profile_text}}')
    expect(prompt).toContain('{{topic_list}}')
  })

  it('requires JSON output with topic and hook', () => {
    expect(prompt).toContain('"topic"')
    expect(prompt).toContain('"hook"')
    expect(prompt).toMatch(/\{[^}]*topic[^}]*hook[^}]*\}/)
  })

  it('instructs to avoid related topics', () => {
    expect(prompt).toContain('毫不相关')
    expect(prompt).toContain('不要推荐列表中已存在的主题')
  })

  it('handles empty library explicitly', () => {
    expect(prompt).toContain('（学习库为空）')
    expect(prompt).toContain('适合零基础初学者')
  })
})
