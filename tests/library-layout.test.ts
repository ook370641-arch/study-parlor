// tests/library-layout.test.ts
import { describe, expect, it } from 'vitest'
import path from 'node:path'
import { SOCRATIC_ROOT, topicDir } from '@electron/lib/library-layout'

describe('library-layout', () => {
  it('SOCRATIC_ROOT is 苏格拉底对话', () => {
    expect(SOCRATIC_ROOT).toBe('苏格拉底对话')
  })

  it('topicDir joins lib, SOCRATIC_ROOT and dirName', () => {
    expect(topicDir('/tmp/lib', 'Agent')).toBe(path.join('/tmp/lib', '苏格拉底对话', 'Agent'))
  })
})
