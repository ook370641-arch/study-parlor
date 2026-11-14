import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AnthropicArticleMeta, BlogCollectionFile } from '../src/types'

const handlers = vi.hoisted(() => ({}) as Record<string, (event: unknown, args: any) => Promise<any>>)
const importArticleMock = vi.hoisted(() => vi.fn())
const runtime = vi.hoisted(() => ({ articles: [] as AnthropicArticleMeta[] }))

vi.mock('electron', () => ({
  app: { on: vi.fn() },
  ipcMain: {
    handle: (channel: string, handler: (event: unknown, args: any) => Promise<any>) => {
      handlers[channel] = handler
    },
  },
}))

vi.mock('../electron/lib/anthropic-browser', () => ({ cancelCurrentOperation: vi.fn() }))

vi.mock('../electron/lib/anthropic-scraper', () => ({
  IMPORT_DIR: 'Anthropic博客',
  importArticle: importArticleMock,
  discoverArticles: vi.fn(),
  classifyError: (error: unknown) => ({ code: 'LLM_ERROR', message: String(error) }),
}))

vi.mock('../electron/ipc/state', () => ({
  patchState: vi.fn(),
  getCurrentState: () => ({ anthropicBlogCache: { articles: runtime.articles } }),
}))

import { registerAnthropicIpc } from '../electron/ipc/anthropic'
import { saveBlogCache } from '../electron/lib/library-data'
import { saveCollection } from '../electron/lib/blog-collection'
import type { AppConfig } from '../electron/env'

let dir: string

function seedArticles(count = 3): AnthropicArticleMeta[] {
  const root = path.join(dir, 'Anthropic博客', '2026-11')
  fs.mkdirSync(root, { recursive: true })
  const articles = ['a', 'b', 'c'].slice(0, count).map((url, index) => ({
    url,
    title: url.toUpperCase(),
    summary: null,
    publishedAt: `2026-01-0${index + 1}`,
    imageUrl: null,
    isSaved: true,
    filePath: path.join(root, `${url}.md`),
  }))
  runtime.articles = articles
  saveBlogCache(dir, { lastFetchedAt: null, articles, loading: false, error: null }, null)
  return articles
}

function collectionOf(result: any): BlogCollectionFile {
  return result.collection
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blog-ipc-'))
  runtime.articles = []
  importArticleMock.mockReset()
  registerAnthropicIpc({ libraryPath: dir } as AppConfig)
})

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

describe('博客集合 IPC 的顺序生命周期', () => {
  it('收藏与取消收藏都返回规范化顺序，取消后回到已保存首位', async () => {
    const [a, b] = seedArticles(2)
    const added = collectionOf(await handlers['anthropic:collectionAdd'](null, {
      sourceUrl: a.url, filePath: a.filePath!, title: a.title,
    }))
    expect(added.order).toMatchObject({ saved: [b.url], read: [], favorite: [a.url] })

    const removed = collectionOf(await handlers['anthropic:collectionRemove'](null, { sourceUrl: a.url }))
    expect(removed.order).toMatchObject({ saved: [a.url, b.url], read: [], favorite: [] })
  })

  it('已读与取消已读都返回规范化顺序，取消后回到已保存首位', async () => {
    const [a, b] = seedArticles(2)
    const marked = collectionOf(await handlers['anthropic:collectionMarkRead'](null, {
      sourceUrl: a.url, filePath: a.filePath!, title: a.title,
    }))
    expect(marked.order).toMatchObject({ saved: [b.url], read: [a.url], favorite: [] })

    const removed = collectionOf(await handlers['anthropic:collectionRemoveRead'](null, { sourceUrl: a.url }))
    expect(removed.order).toMatchObject({ saved: [a.url, b.url], read: [], favorite: [] })
  })

  it('导入成功使用最新已保存快照，把文章放到已保存首位并返回集合', async () => {
    const [a, b] = seedArticles(2)
    runtime.articles = [{ ...a, isSaved: false, filePath: undefined }, b]
    importArticleMock.mockResolvedValue({ filePath: a.filePath, wasAlreadySaved: false })

    const result = await handlers['anthropic:importArticle'](null, a.url)

    expect(result.ok).toBe(true)
    expect(collectionOf(result).order).toMatchObject({ saved: [a.url, b.url], read: [], favorite: [] })
  })

  it('删除成功从已保存剔除文章，同时保留已读和收藏标记', async () => {
    const [a, b, c] = seedArticles()
    fs.writeFileSync(b.filePath!, 'article')
    saveCollection(dir, {
      version: 1,
      entries: [{ sourceUrl: c.url, filePath: c.filePath!, title: c.title, addedAt: 'x', origin: 'manual' }],
      dismissed: [],
      history: [],
      read: [{ sourceUrl: a.url, filePath: a.filePath!, title: a.title, readAt: 'x' }],
    })

    const result = await handlers['anthropic:deleteArticle'](null, { filePath: b.filePath })

    expect(result.ok).toBe(true)
    expect(collectionOf(result).order).toMatchObject({ saved: [], read: [a.url], favorite: [c.url] })
    expect(collectionOf(result).read).toHaveLength(1)
    expect(collectionOf(result).entries).toHaveLength(1)
  })
})
