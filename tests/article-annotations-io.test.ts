import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const handlers = new Map<string, (...args: any[]) => any>()

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: (...args: any[]) => any) => {
      handlers.set(channel, handler)
    },
  },
}))

import { registerAnnotationsIpc } from '@electron/ipc/annotations'
import type { AppConfig } from '@electron/env'
import type { ArticleAnnotation } from '@shared/index'

const baseAnnotation = {
  id: 'a1',
  selectedText: '选中文字',
  note: '',
  paragraphIndex: 1,
  createdAt: '2026-10-31',
  updatedAt: '2026-10-31',
}

describe('article annotations IO', () => {
  let libraryPath: string
  let articlePath: string

  beforeEach(() => {
    handlers.clear()
    libraryPath = fs.mkdtempSync(path.join(os.tmpdir(), 'article-annotations-'))
    articlePath = path.join(libraryPath, 'article.md')
    fs.writeFileSync(articlePath, '# Article', 'utf8')
    registerAnnotationsIpc({ libraryPath } as AppConfig)
  })

  afterEach(() => {
    fs.rmSync(libraryPath, { recursive: true, force: true })
  })

  async function write(annotations: ArticleAnnotation[]) {
    await handlers.get('annotations:write')!({}, articlePath, annotations)
  }

  async function read(): Promise<ArticleAnnotation[]> {
    return handlers.get('annotations:read')!({}, articlePath)
  }

  function serialized(): string {
    return fs.readFileSync(path.join(libraryPath, 'article.annotations.md'), 'utf8')
  }

  it('round-trips highlights and omits extension fields for notes', async () => {
    const highlight = {
      ...baseAnnotation,
      kind: 'highlight',
      highlightColor: 'green',
    } as ArticleAnnotation
    const note = { ...baseAnnotation, id: 'a2', note: '普通备注' }

    await write([highlight, note])

    expect(await read()).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'a1', kind: 'highlight', highlightColor: 'green', note: '' }),
      expect.objectContaining({ id: 'a2', note: '普通备注' }),
    ]))
    expect(serialized()).toContain('**类型：** highlight')
    expect(serialized()).toContain('**高亮色：** green')
    const noteSection = serialized().split('## a2')[1]
    expect(noteSection).not.toContain('**类型：**')
    expect(noteSection).not.toContain('**高亮色：**')
  })

  it('keeps legacy notes as notes without adding a default kind', async () => {
    await write([{ ...baseAnnotation, note: '旧备注' }])

    const [legacy] = await read()
    expect(legacy).toMatchObject({ note: '旧备注' })
    expect(legacy.kind).toBeUndefined()
    expect(legacy.highlightColor).toBeUndefined()
  })

  it('normalizes unknown highlight colors to gold', async () => {
    await write([{
      ...baseAnnotation,
      kind: 'highlight',
      highlightColor: 'purple',
    } as ArticleAnnotation])

    const [highlight] = await read()
    expect(highlight.kind).toBe('highlight')
    expect(highlight.highlightColor).toBe('gold')
  })
})
