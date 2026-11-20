import { describe, expect, it } from 'vitest'
import { buildFableUserPrompt, stripFrontmatter, studyArtifactKey } from '@/lib/study-artifacts'

describe('study artifact helpers', () => {
  it('builds the existing fable prompt combinations', () => {
    expect(buildFableUserPrompt(['寓言', '讽刺'], '主角是图书管理员')).toBe('风格：寓言、讽刺。主角是图书管理员')
    expect(buildFableUserPrompt(['寓言'], '   ')).toBe('风格：寓言')
    expect(buildFableUserPrompt([], '主角是图书管理员')).toBe('主角是图书管理员')
    expect(buildFableUserPrompt([], '   ')).toBeUndefined()
  })

  it('removes frontmatter and creates stable per-session keys', () => {
    expect(stripFrontmatter('---\ntopic: 记忆\n---\n# 正文')).toBe('# 正文')
    expect(studyArtifactKey('memory', 2)).toBe('memory:s2')
  })
})
