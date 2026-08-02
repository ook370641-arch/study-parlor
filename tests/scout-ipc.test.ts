import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

describe('registerScoutIpc', () => {
  let handleMock: ReturnType<typeof vi.fn>
  let root: string

  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    handleMock = vi.fn()
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'scout-ipc-'))
  })

  afterEach(() => {
    vi.restoreAllMocks()
    try { fs.rmSync(root, { recursive: true, force: true }) } catch { /* cleanup best-effort */ }
  })

  async function setup() {
    vi.doMock('electron', () => ({
      ipcMain: { handle: handleMock },
      app: { on: vi.fn() },
      BrowserWindow: vi.fn(),
    }))

    // Mock deps that are imported by scout.ts but not exercised by CRUD handlers
    vi.doMock('@electron/lib/kimi', () => ({
      chatStream: vi.fn(),
    }))
    vi.doMock('@electron/lib/scout/loop', () => ({
      runScoutTurn: vi.fn(),
    }))
    vi.doMock('@electron/lib/scout/tools', () => ({
      executeScoutTool: vi.fn(),
      clearPrecheckCache: vi.fn(),
    }))
    vi.doMock('@electron/lib/credentials', () => ({
      getSearchApiKey: vi.fn().mockResolvedValue(null),
      hasSearchApiKey: vi.fn().mockResolvedValue(false),
    }))
    vi.doMock('@electron/lib/search', () => ({
      searchWeb: vi.fn(),
    }))

    const mod = await import('@electron/ipc/scout')
    return { registerScoutIpc: mod.registerScoutIpc }
  }

  function getHandler(name: string): (...args: any[]) => any {
    const call = handleMock.mock.calls.find(([n]: [string]) => n === name)
    if (!call) throw new Error(`Handler "${name}" not registered`)
    return call[1]
  }

  it('registers all 9 IPC handlers', async () => {
    const { registerScoutIpc } = await setup()
    registerScoutIpc({ apiKey: 'sk-test', baseUrl: 'https://test', model: 'test', libraryPath: root })

    const names = handleMock.mock.calls.map(([n]: [string]) => n)
    expect(names).toContain('scout:sendMessage')
    expect(names).toContain('scout:abort')
    expect(names).toContain('scout:listConversations')
    expect(names).toContain('scout:createConversation')
    expect(names).toContain('scout:getConversation')
    expect(names).toContain('scout:renameConversation')
    expect(names).toContain('scout:deleteConversation')
    expect(names).toContain('scout:listArticles')
    expect(names).toContain('scout:deleteArticle')
  })

  it('对话 CRUD 全链路', async () => {
    const { registerScoutIpc } = await setup()
    registerScoutIpc({ apiKey: 'sk-test', baseUrl: 'https://test', model: 'test', libraryPath: root })

    // createConversation
    const conv = await getHandler('scout:createConversation')()
    expect(conv.messages).toEqual([])
    expect(conv.id).toBeTruthy()
    expect(typeof conv.title).toBe('string')

    // listConversations
    const list = await getHandler('scout:listConversations')()
    expect(list).toHaveLength(1)
    expect(list[0].id).toBe(conv.id)

    // renameConversation
    const rn = await getHandler('scout:renameConversation')(null, { id: conv.id, title: '新名字' })
    expect(rn).toEqual({ ok: true })

    // getConversation
    const got = await getHandler('scout:getConversation')(null, { id: conv.id })
    expect(got!.title).toBe('新名字')

    // deleteConversation
    const del = await getHandler('scout:deleteConversation')(null, { id: conv.id })
    expect(del).toEqual({ ok: true })
    expect(await getHandler('scout:listConversations')()).toHaveLength(0)
  })

  it('scout:listArticles 空库返回空数组', async () => {
    const { registerScoutIpc } = await setup()
    registerScoutIpc({ apiKey: 'sk-test', baseUrl: 'https://test', model: 'test', libraryPath: root })

    expect(await getHandler('scout:listArticles')()).toEqual([])
  })

  it('scout:deleteArticle 拒绝库外路径', async () => {
    const { registerScoutIpc } = await setup()
    registerScoutIpc({ apiKey: 'sk-test', baseUrl: 'https://test', model: 'test', libraryPath: root })

    const result = await getHandler('scout:deleteArticle')(null, { filePath: 'C:/Windows/evil.md' })
    expect(result.ok).toBe(false)
  })

  it('scout:abort 对不存在对话不抛错', async () => {
    const { registerScoutIpc } = await setup()
    registerScoutIpc({ apiKey: 'sk-test', baseUrl: 'https://test', model: 'test', libraryPath: root })

    const result = await getHandler('scout:abort')(null, { conversationId: 'nope' })
    expect(result).toBeUndefined()
  })

  it('scout:renameConversation 对不存在 id 返回错误', async () => {
    const { registerScoutIpc } = await setup()
    registerScoutIpc({ apiKey: 'sk-test', baseUrl: 'https://test', model: 'test', libraryPath: root })

    const r = await getHandler('scout:renameConversation')(null, { id: 'nonexistent', title: 'x' })
    expect(r.ok).toBe(false)
  })

  it('scout:deleteConversation 对不存在 id 返回错误', async () => {
    const { registerScoutIpc } = await setup()
    registerScoutIpc({ apiKey: 'sk-test', baseUrl: 'https://test', model: 'test', libraryPath: root })

    const r = await getHandler('scout:deleteConversation')(null, { id: 'nonexistent' })
    expect(r.ok).toBe(false)
  })
})
