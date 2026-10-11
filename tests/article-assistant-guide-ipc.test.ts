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
  runBlogGuideV2: vi.fn(() => new Promise(() => {})),
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
    const parent = path.join(dir, 'writing', 'a.md')
    const { filePath } = (await handlers['articleAssistant:writeGuide'](fakeEvent, {
      parentPath: parent,
      parentType: 'writing',
      guide: { background: 'bg', chunks: [{ heading: 'H', context: '铺陈', terms: [] }] },
    } as never)) as { filePath: string }
    expect(fs.readFileSync(filePath, 'utf8')).toContain('guide_version: 2')
  })

  it('writeGuide：writing 纯 summary（v1 格式）不写 guide_version', async () => {
    const parent = path.join(dir, 'article.md')
    const { filePath } = (await handlers['articleAssistant:writeGuide'](fakeEvent, {
      parentPath: parent,
      parentType: 'writing',
      guide: { background: 'bg', chunks: [{ heading: 'H', summary: '摘要', terms: [] }] },
    } as never)) as { filePath: string }
    expect(fs.readFileSync(filePath, 'utf8')).not.toContain('guide_version')
  })

  it('v2 导读 write→read→rewrite 往返后 guide_version 不降级（持久化回归）', async () => {
    // 回归：readGuide 后 persistAssistantState 重写时 isV2 判 false，
    // 文件被降级为无 guide_version → 下次打开 isGuideCacheCurrent 失效 → 重复自动生成。
    const parent = path.join(dir, 'Anthropic博客', 'a.md')
    await handlers['articleAssistant:writeGuide'](fakeEvent, {
      parentPath: parent,
      parentType: 'anthropic-article',
      guide: { background: 'bg', chunks: [{ heading: 'H', summary: '摘要', terms: [] }] },
    } as never)
    const file = (await handlers['articleAssistant:readGuide'](fakeEvent, {
      parentPath: parent,
      parentType: 'anthropic-article',
    } as never)) as { guide: { chunks: { summary?: string }[] }; guideVersion?: number }
    expect(file.guideVersion).toBe(2)
    expect(file.guide.chunks[0].summary).toBe('摘要')
    const { filePath } = (await handlers['articleAssistant:writeGuide'](fakeEvent, {
      parentPath: parent,
      parentType: 'anthropic-article',
      guide: file.guide,
    } as never)) as { filePath: string }
    expect(fs.readFileSync(filePath, 'utf8')).toContain('guide_version: 2')
  })
})

describe('generateGuide routing', () => {
  let dir: string
  const fakeEvent = { sender: { isDestroyed: () => false, send: vi.fn() } }

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'guide-route-'))
    registerArticleAssistantIpc({ libraryPath: dir } as unknown as AppConfig)
  })
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }) })

  it('anthropic-article 走 blog v2 管线', async () => {
    const { runBlogGuideV2 } = await import('../electron/lib/guide-v2-pipeline')
    const blogGuide = { background: 'bg', chunks: [{ heading: 'H', summary: 'S', terms: [] }] }
    vi.mocked(runBlogGuideV2).mockResolvedValueOnce(blogGuide as never)
    const result = await handlers['articleAssistant:generateGuide'](fakeEvent as never, {
      articleContent: '## H\nx',
      articleType: 'anthropic-article',
      articleTitle: 'T',
    } as never)
    expect(runBlogGuideV2).toHaveBeenCalledOnce()
    expect(result).toEqual(blogGuide)
  })

  it('E2E_GUIDE_BAD_JSON=1 时 anthropic-article mock 在 writing 进度后抛 GUIDE_JSON_ERROR', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'guide-bad-json-'))
    process.env.E2E_CONFIG_DIR = tmp
    process.env.E2E_GUIDE_BAD_JSON = '1'
    try {
      const err = await handlers['articleAssistant:generateGuide'](fakeEvent as never, {
        articleContent: '## H\nx',
        articleType: 'anthropic-article',
        articleTitle: 'T',
      } as never).then(
        () => null,
        (e: Error & { code?: string }) => e
      )
      expect(err).not.toBeNull()
      expect(err!.code).toBe('GUIDE_JSON_ERROR')
      // mock 进度事件确实先于抛错发出（writing 阶段）
      const sends = (fakeEvent.sender.send as ReturnType<typeof vi.fn>).mock.calls
      expect(sends.some((c) => c[0] === 'articleAssistant:guideProgress' && c[1]?.stage === 'writing')).toBe(true)
    } finally {
      delete process.env.E2E_CONFIG_DIR
      delete process.env.E2E_GUIDE_BAD_JSON
      fs.rmSync(tmp, { recursive: true, force: true })
      ;(fakeEvent.sender.send as ReturnType<typeof vi.fn>).mockClear()
    }
  })
})

describe('writeGuide version', () => {
  it('anthropic-article + summary-only 导读也写 guide_version: 2', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-guide-'))
    registerArticleAssistantIpc({ libraryPath: tmp } as unknown as AppConfig)
    fs.mkdirSync(path.join(tmp, 'Anthropic博客', '2026-08'), { recursive: true })
    fs.writeFileSync(path.join(tmp, 'Anthropic博客', '2026-08', 'a.md'), 'x')
    const result = await handlers['articleAssistant:writeGuide'](null as never, {
      parentPath: 'Anthropic博客/2026-08/a.md',
      parentType: 'anthropic-article',
      guide: { background: 'bg', chunks: [{ heading: 'H', summary: 'S', terms: [] }] },
    } as never) as { filePath: string }
    const raw = fs.readFileSync(result.filePath, 'utf8')
    expect(raw).toContain('guide_version: 2')
    fs.rmSync(tmp, { recursive: true, force: true })
  })
})
