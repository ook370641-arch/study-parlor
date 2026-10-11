import { describe, it, expect } from 'vitest'
import type { WritingTreeNode, WritingResult, WritingErrorCode, WritingSourceType } from '../src/types'

describe('writing types', () => {
  it('WritingTreeNode 结构可用', () => {
    const node: WritingTreeNode = { name: 'a.md', path: 'writing/a.md', kind: 'file' }
    expect(node.kind).toBe('file')
  })
  it('WritingResult 可判别', () => {
    const r: WritingResult<number> = { ok: false, code: 'WRITING_NOT_FOUND', message: 'x' }
    expect(r.ok).toBe(false)
  })
  it('来源类型全集', () => {
    const t: WritingSourceType[] = ['study', 'blog', 'repository', 'writing', 'web', 'group']
    expect(t).toHaveLength(6)
  })
  it('错误码全集', () => {
    const c: WritingErrorCode[] = ['WRITING_IO_ERROR', 'WRITING_PATH_FORBIDDEN', 'WRITING_NOT_FOUND', 'WRITING_NAME_CONFLICT']
    expect(c).toHaveLength(4)
  })
})
