import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import matter from 'gray-matter'
import { attachWritingWallMetadata } from '@electron/lib/writing-wall-metadata'
import { diffStale, loadCatalog, updateEntry } from '@electron/lib/writing-catalog'
import { scanRoot } from '@electron/lib/writing-tree'

let lib = ''

beforeEach(() => {
  lib = fs.mkdtempSync(path.join(os.tmpdir(), 'writing-wall-meta-'))
  fs.mkdirSync(path.join(lib, 'writing', '研究'), { recursive: true })
  fs.writeFileSync(path.join(lib, 'writing', '研究', 'a.md'), matter.stringify('中文 two', { title: 'A' }))
})

afterEach(() => {
  vi.restoreAllMocks()
  fs.rmSync(lib, { recursive: true, force: true })
})

describe('attachWritingWallMetadata', () => {
  it('缓存字数且不让 AI 摘要误判为已更新', () => {
    const filePath = path.join(lib, 'writing', '研究', 'a.md')
    const mtimeMs = fs.statSync(filePath).mtimeMs
    updateEntry(lib, 'writing', 'writing/研究/a.md', { title: 'A', summary: '已有摘要', mtimeMs })

    const first = attachWritingWallMetadata(lib, 'writing', scanRoot(lib, 'writing'))
    expect(first[0].children?.[0]).toMatchObject({ wordCount: 3, mtimeMs })
    expect(loadCatalog(lib, 'writing').entries['writing/研究/a.md']).toMatchObject({ wordCount: 3, wallMtimeMs: mtimeMs, summary: '已有摘要' })

    updateEntry(lib, 'writing', 'writing/研究/a.md', { title: 'A', summary: '更新摘要', mtimeMs })
    expect(loadCatalog(lib, 'writing').entries['writing/研究/a.md'].wordCount).toBe(3)

    const readSpy = vi.spyOn(fs, 'readFileSync')
    attachWritingWallMetadata(lib, 'writing', scanRoot(lib, 'writing'))
    expect(readSpy.mock.calls.filter(call => String(call[0]) === filePath)).toHaveLength(0)

    fs.writeFileSync(filePath, matter.stringify('中文 two words', { title: 'A' }))
    const changed = attachWritingWallMetadata(lib, 'writing', scanRoot(lib, 'writing'))
    expect(changed[0].children?.[0].wordCount).toBe(4)
  })

  it('没有摘要 mtime 的新文件仍进入摘要 diff', () => {
    attachWritingWallMetadata(lib, 'writing', scanRoot(lib, 'writing'))
    expect(diffStale(lib, 'writing')).toContain('writing/研究/a.md')
  })

  it('非 Markdown 只附带修改时间，不计算字数', () => {
    fs.writeFileSync(path.join(lib, 'writing', '研究', 'b.pdf'), 'pdf')
    const nodes = attachWritingWallMetadata(lib, 'writing', scanRoot(lib, 'writing'))
    const pdf = nodes[0].children?.find(node => node.name === 'b.pdf')
    expect(pdf?.mtimeMs).toEqual(expect.any(Number))
    expect(pdf?.wordCount).toBeUndefined()
  })

  it('只把根目录 .covers 内的 SVG 暴露为安全 data URL', () => {
    const filePath = path.join(lib, 'writing', '研究', 'a.md')
    fs.mkdirSync(path.join(lib, 'writing', '.covers'), { recursive: true })
    fs.writeFileSync(path.join(lib, 'writing', '.covers', 'safe.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>')
    fs.writeFileSync(filePath, matter.stringify('正文', { title: 'A', cover: 'writing/.covers/safe.svg' }))

    const nodes = attachWritingWallMetadata(lib, 'writing', scanRoot(lib, 'writing'))
    expect(nodes[0].children?.[0].coverUrl).toMatch(/^data:image\/svg\+xml;base64,/)
  })
})
