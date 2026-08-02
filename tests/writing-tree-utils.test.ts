import { describe, it, expect } from 'vitest'
import { firstWritingFilePath } from '@/lib/writing-tree-utils'
import type { WritingTreeNode } from '@shared/index'

const file = (path: string): WritingTreeNode => ({ name: path.split('/').pop()!, path, kind: 'file' })
const dir = (name: string, children: WritingTreeNode[] = []): WritingTreeNode => ({
  name,
  path: `/lib/${name}`,
  kind: 'dir',
  children,
})

describe('firstWritingFilePath', () => {
  it('returns null for empty/undefined tree', () => {
    expect(firstWritingFilePath(undefined)).toBeNull()
    expect(firstWritingFilePath([])).toBeNull()
  })

  it('returns the top-level file directly', () => {
    const tree = [file('/lib/a.md'), file('/lib/b.md')]
    expect(firstWritingFilePath(tree)).toBe('/lib/a.md')
  })

  it('descends one level into a dir', () => {
    const tree = [dir('g1', [file('/lib/g1/a.md')])]
    expect(firstWritingFilePath(tree)).toBe('/lib/g1/a.md')
  })

  it('descends two/three levels (DFS, tree order)', () => {
    const tree = [dir('g1', [dir('sub', [dir('deep', [file('/lib/g1/sub/deep/a.md')])])])]
    expect(firstWritingFilePath(tree)).toBe('/lib/g1/sub/deep/a.md')
  })

  it('skips empty dirs and dirs containing only dirs, then picks the next top-level node', () => {
    const tree = [
      dir('empty'),
      dir('onlyDirs', [dir('x')]),
      dir('g2', [file('/lib/g2/first.md')]),
      file('/lib/later.md'),
    ]
    expect(firstWritingFilePath(tree)).toBe('/lib/g2/first.md')
  })

  it('prefers depth-first order within a dir over later siblings', () => {
    const tree = [
      dir('g1', [dir('sub', [file('/lib/g1/sub/deep.md')]), file('/lib/g1/shallow.md')]),
    ]
    expect(firstWritingFilePath(tree)).toBe('/lib/g1/sub/deep.md')
  })
})
