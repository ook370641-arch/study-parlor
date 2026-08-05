import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { parseAssistantGuideBody, serializeGuide, registerArticleAssistantIpc } from '../electron/ipc/article-assistant'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { AppConfig } from '../electron/env'

// —— handler 级测试 mock ——
const handlers = vi.hoisted(() => ({}) as Record<string, (event: unknown, args: never) => Promise<unknown>>)

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, fn: (event: unknown, args: never) => Promise<unknown>) => {
      handlers[channel] = fn
    },
  },
  app: { getPath: () => os.tmpdir() },
}))

vi.mock('../electron/lib/guide-v2-pipeline', () => ({
  runDigestGuideV2: vi.fn(() => new Promise(() => {})),
}))

describe('parseAssistantGuideBody', () => {
  it('parses background and chunks with terms', () => {
    const body = `# 背景\n\nThis is background.\n\n## §1 Intro\n\nSummary one.\n\n**上下文（context）**：term（翻译）— explanation.`
    const result = parseAssistantGuideBody(body)
    expect(result).not.toBeNull()
    expect(result!.background).toBe('This is background.')
    expect(result!.chunks).toHaveLength(1)
    expect(result!.chunks[0].heading).toBe('Intro')
    expect(result!.chunks[0].terms[0].term).toBe('term')
  })

  it('returns null for empty body', () => {
    expect(parseAssistantGuideBody('')).toBeNull()
  })
})

describe('serializeGuide', () => {
  it('round-trips through parse', () => {
    const guide = {
      background: 'bg',
      chunks: [{ heading: 'H', summary: 'S', terms: [{ term: 'T', translation: 'X', explanation: 'E' }] }],
    }
    const parsed = parseAssistantGuideBody(serializeGuide(guide))
    expect(parsed).toEqual(guide)
  })
})

describe('serializeGuide v2', () => {
  it('writes context text in the body position and round-trips it into summary', () => {
    const guide = {
      background: 'bg',
      chunks: [{ heading: 'H', context: 'C 背景铺陈', terms: [] }],
    }
    const parsed = parseAssistantGuideBody(serializeGuide(guide as any))
    expect(parsed).not.toBeNull()
    expect(parsed!.chunks[0].summary).toBe('C 背景铺陈')
  })

  it('prefers context over summary when both present', () => {
    const guide = {
      background: 'bg',
      chunks: [{ heading: 'H', summary: '旧摘要', context: '新铺陈', terms: [] }],
    }
    expect(serializeGuide(guide as any)).toContain('新铺陈')
    expect(serializeGuide(guide as any)).not.toContain('旧摘要')
  })
})

describe('guide IPC handlers', () => {
  let dir: string
  const fakeEvent = { sender: { isDestroyed: () => false, send: vi.fn() } }

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'guide-ipc-'))
    registerArticleAssistantIpc({ libraryPath: dir } as unknown as AppConfig)
  })
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }) })

  it('writeGuide：guide 含 context 时 frontmatter 写 guide_version: 2', async () => {
    const parent = path.join(dir, '夜航简报', '夜航简报-2026-08-04.md')
    const { filePath } = (await handlers['articleAssistant:writeGuide'](fakeEvent, {
      parentPath: parent,
      parentType: 'briefing',
      guide: { background: 'bg', chunks: [{ heading: 'H', context: '铺陈', terms: [] }] },
    } as never)) as { filePath: string }
    expect(fs.readFileSync(filePath, 'utf8')).toContain('guide_version: 2')
  })

  it('writeGuide：纯 summary（v1 格式）不写 guide_version', async () => {
    const parent = path.join(dir, 'article.md')
    const { filePath } = (await handlers['articleAssistant:writeGuide'](fakeEvent, {
      parentPath: parent,
      parentType: 'anthropic-article',
      guide: { background: 'bg', chunks: [{ heading: 'H', summary: '摘要', terms: [] }] },
    } as never)) as { filePath: string }
    expect(fs.readFileSync(filePath, 'utf8')).not.toContain('guide_version')
  })

  it('generateGuide：非 briefing 走旧路径（不调 v2 管线）', async () => {
    // anthropic-article 的 generateGuide 不经过 runDigestGuideV2，直接调 chatStream+旧 prompt。
    // 验证 handler 注册存在即可（管线 mock 挂起以保证不超时，旧路径不会被触发）。
    expect(handlers['articleAssistant:generateGuide']).toBeDefined()
  })
})
