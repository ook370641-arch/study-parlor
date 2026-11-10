import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import matter from 'gray-matter'
import type { AppConfig } from '../electron/env'
import { createNoteFile, updateNoteMeta } from '../electron/lib/notes'
import { createNotesAiHandlers } from '../electron/ipc/notes'

let libraryPath: string
let config: AppConfig
let notePath: string
let originalRaw: string

function seedSource(): void {
  const sourcePath = path.join(libraryPath, 'Anthropic博客', 'article.md')
  fs.mkdirSync(path.dirname(sourcePath), { recursive: true })
  fs.writeFileSync(sourcePath, '---\nsource_url: https://example.com/article\n---\n来源正文', 'utf8')
}

function makeEvent() {
  return { sender: { send: vi.fn() } }
}

beforeEach(() => {
  libraryPath = fs.mkdtempSync(path.join(os.tmpdir(), 'notes-ai-ipc-'))
  config = { apiKey: 'kimi', baseUrl: 'https://kimi.test/v1', model: 'kimi-test', libraryPath }
  notePath = createNoteFile(libraryPath, { title: '文章', url: 'https://example.com/article', source: 'web', body: '原笔迹' }).path
  originalRaw = fs.readFileSync(path.join(libraryPath, notePath), 'utf8')
  seedSource()
})

afterEach(() => { fs.rmSync(libraryPath, { recursive: true, force: true }) })

function makeDependencies(body = 'AI 正文') {
  let nextId = 0
  return {
    createId: () => `generation-${++nextId}`,
    now: () => '2026-11-05T02:00:00.000Z',
    generateBody: vi.fn(async (_config, _input, onStage) => {
      for (const stage of ['round1', 'round2', 'curating', 'writing'] as const) onStage(stage)
      return body
    }),
  }
}

describe('AI 笔记 IPC 会话', () => {
  it('候选不写文件，确认后一次写入并永久拒绝重复生成', async () => {
    const dependencies = makeDependencies()
    const handlers = createNotesAiHandlers(config, dependencies)
    const event = makeEvent()

    const candidate = await handlers.generate(event, { path: notePath })
    expect(fs.readFileSync(path.join(libraryPath, notePath), 'utf8')).toBe(originalRaw)
    expect(event.sender.send.mock.calls.map(call => call[1].stage)).toEqual(['reading', 'round1', 'round2', 'curating', 'writing'])

    const applied = await handlers.apply({ generationId: candidate.generationId })
    const written = fs.readFileSync(path.join(libraryPath, notePath), 'utf8')
    expect(applied).toEqual({ path: notePath, body: 'AI 正文\n\n---\n\n## 原笔迹\n\n原笔迹\n', aiGeneratedAt: '2026-11-05T02:00:00.000Z' })
    expect(matter(written).data.ai_generated_at).toBe('2026-11-05T02:00:00.000Z')
    await expect(handlers.generate(event, { path: notePath })).rejects.toThrow('ALREADY_GENERATED')
    expect(dependencies.generateBody).toHaveBeenCalledTimes(1)
  })

  it('同路径并发只运行一次，取消候选后可以重试', async () => {
    let resolveGeneration: ((body: string) => void) | undefined
    const dependencies = makeDependencies()
    dependencies.generateBody.mockImplementationOnce(() => new Promise(resolve => { resolveGeneration = resolve }))
    const handlers = createNotesAiHandlers(config, dependencies)
    const event = makeEvent()

    const first = handlers.generate(event, { path: notePath })
    await expect(handlers.generate(event, { path: notePath })).rejects.toThrow('ALREADY_RUNNING')
    resolveGeneration!('AI 正文')
    const candidate = await first
    await handlers.abort({ generationId: candidate.generationId })
    expect(fs.readFileSync(path.join(libraryPath, notePath), 'utf8')).toBe(originalRaw)

    await expect(handlers.generate(event, { path: notePath })).resolves.toMatchObject({ path: notePath, body: 'AI 正文' })
    expect(dependencies.generateBody).toHaveBeenCalledTimes(2)
  })

  it('失败释放锁，原文件保持不变', async () => {
    const dependencies = makeDependencies()
    dependencies.generateBody.mockRejectedValueOnce(new Error('failed'))
    const handlers = createNotesAiHandlers(config, dependencies)

    await expect(handlers.generate(makeEvent(), { path: notePath })).rejects.toThrow('failed')
    await expect(handlers.generate(makeEvent(), { path: notePath })).resolves.toMatchObject({ body: 'AI 正文' })
    expect(fs.readFileSync(path.join(libraryPath, notePath), 'utf8')).toBe(originalRaw)
  })

  it('写入冲突保留候选且不覆盖新编辑，恢复原文件后可重试同一候选', async () => {
    const dependencies = makeDependencies()
    const handlers = createNotesAiHandlers(config, dependencies)
    const candidate = await handlers.generate(makeEvent(), { path: notePath })
    fs.writeFileSync(path.join(libraryPath, notePath), `${originalRaw}\n新编辑`, 'utf8')

    await expect(handlers.apply({ generationId: candidate.generationId })).rejects.toThrow('NOTE_CHANGED')
    expect(fs.readFileSync(path.join(libraryPath, notePath), 'utf8')).toBe(`${originalRaw}\n新编辑`)
    fs.writeFileSync(path.join(libraryPath, notePath), originalRaw, 'utf8')
    await expect(handlers.apply({ generationId: candidate.generationId })).resolves.toMatchObject({
      path: notePath,
      body: 'AI 正文\n\n---\n\n## 原笔迹\n\n原笔迹\n',
    })
  })

  it('已有永久标记时直接拒绝，不进入来源生成或模型调用', async () => {
    updateNoteMeta(libraryPath, notePath, { ai_generated_at: '2026-11-05T00:00:00.000Z' })
    const dependencies = makeDependencies()
    const handlers = createNotesAiHandlers(config, dependencies)

    await expect(handlers.generate(makeEvent(), { path: notePath })).rejects.toThrow('ALREADY_GENERATED')
    expect(dependencies.generateBody).not.toHaveBeenCalled()
  })
})
