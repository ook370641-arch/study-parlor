import { describe, it, expect } from 'vitest'
import {
  firstWritingFilePath,
  displayWritingName,
  normalizeWritingFileName,
  diaryPrefillName,
  sortedInsertIndexForFile,
  sortNodesByOrder,
  writingErrorText,
  writingPreviewKindOf,
} from '@/lib/writing-tree-utils'
import type { WritingTreeNode, WritingRoot } from '@shared/index'

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

const f = (name: string, path?: string): WritingTreeNode => ({ name, path: path ?? `writing/${name}`, kind: 'file' })
const d = (name: string, children: WritingTreeNode[] = []): WritingTreeNode => ({ name, path: `writing/${name}`, kind: 'dir', children })
const aug9 = new Date(2026, 7, 9) // 2026-08-09

describe('displayWritingName', () => {
  it('文件去 .md 后缀；目录名原样', () => {
    expect(displayWritingName(f('8.9.md'))).toBe('8.9')
    expect(displayWritingName(f('八月随笔.md'))).toBe('八月随笔')
    expect(displayWritingName(d('随笔'))).toBe('随笔')
  })

  it('html 文件去 .html 后缀（大小写不敏感）；其他非 md 后缀保留', () => {
    expect(displayWritingName(f('月度报告.html'))).toBe('月度报告')
    expect(displayWritingName(f('归档.HTML'))).toBe('归档')
    expect(displayWritingName(f('报表.xlsx'))).toBe('报表.xlsx')
    expect(displayWritingName(f('论文.pdf'))).toBe('论文.pdf')
  })
})

describe('normalizeWritingFileName', () => {
  it('文件补 .md，已带则不重复；目录原样', () => {
    expect(normalizeWritingFileName('八月夜话', true)).toBe('八月夜话.md')
    expect(normalizeWritingFileName('八月夜话.md', true)).toBe('八月夜话.md')
    expect(normalizeWritingFileName('随笔', false)).toBe('随笔')
  })
})

describe('diaryPrefillName', () => {
  it('writing 根级日记分组返回当天 M.D', () => {
    expect(diaryPrefillName('writing' as WritingRoot, '日记', [], aug9)).toBe('8.9')
  })
  it('该分组已存在当天文件则返回空串', () => {
    expect(diaryPrefillName('writing' as WritingRoot, '日记', [f('8.9.md')], aug9)).toBe('')
  })
  it('repository 根或非日记分组或日记子分组不预填', () => {
    expect(diaryPrefillName('repository' as WritingRoot, '日记', [], aug9)).toBe('')
    expect(diaryPrefillName('writing' as WritingRoot, '随笔', [], aug9)).toBe('')
    expect(diaryPrefillName('writing' as WritingRoot, '日记/2026', [], aug9)).toBe('')
  })
})

describe('sortedInsertIndexForFile', () => {
  it('新建文章恒落在容器末尾（无序文件也末尾）', () => {
    const children = [f('7.5.md'), f('8.5.md')]
    expect(sortedInsertIndexForFile(children, undefined, '8.9')).toBe(2)
    expect(sortedInsertIndexForFile(children, undefined, '7.1')).toBe(2)
  })
  it('有 order 时同样末尾', () => {
    const children = [f('a.md', 'writing/a.md'), f('b.md', 'writing/b.md'), f('c.md', 'writing/c.md')]
    expect(sortedInsertIndexForFile(children, ['writing/a.md', 'writing/b.md'], 'x')).toBe(3)
  })
  it('空值返回末尾', () => {
    expect(sortedInsertIndexForFile([f('a.md')], undefined, '')).toBe(1)
    expect(sortedInsertIndexForFile([f('a.md')], undefined, '   ')).toBe(1)
  })
})

describe('writingErrorText', () => {
  it('映射到中文文案', () => {
    expect(writingErrorText('WRITING_NAME_CONFLICT')).toBe('同名文件已存在')
    expect(writingErrorText('WRITING_PATH_FORBIDDEN')).toBe('名称无效')
    expect(writingErrorText('WRITING_NOT_FOUND')).toBe('文件不存在')
    expect(writingErrorText('WRITING_IO_ERROR')).toBe('写入失败，请重试')
  })
})

describe('sortNodesByOrder', () => {
  const dirNode = (name: string, path: string): WritingTreeNode => ({ name, path, kind: 'dir', children: [] })
  it('目录永远在文章前：有序目录在前、无序目录次之、有序文件、无序文件', () => {
    const nodes = [
      f('b.md', 'writing/b.md'),  // 无序文件
      dirNode('随笔', 'writing/随笔'),                 // 无序目录
      f('a.md', 'writing/a.md'),  // 有序文件
      dirNode('日记', 'writing/日记'),                 // 有序目录
    ]
    const sorted = sortNodesByOrder(nodes, ['writing/日记', 'writing/a.md'])
    expect(sorted.map(n => n.path)).toEqual(['writing/日记', 'writing/随笔', 'writing/a.md', 'writing/b.md'])
  })
  it('无 order 时保持扫描序（目录在前、文件按序）', () => {
    const nodes = [
      f('b.md', 'writing/b.md'),
      dirNode('随笔', 'writing/随笔'),
      f('a.md', 'writing/a.md'),
    ]
    expect(sortNodesByOrder(nodes, undefined).map(n => n.path)).toEqual(['writing/随笔', 'writing/b.md', 'writing/a.md'])
  })
})

describe('writingPreviewKindOf', () => {
  it('html 扩展名返回 html（含大写），md 返回 md', () => {
    expect(writingPreviewKindOf('writing/reports/月度报告.html')).toBe('html')
    expect(writingPreviewKindOf('repository/A.HTML')).toBe('html')
    expect(writingPreviewKindOf('writing/a.md')).toBe('md')
  })
})
