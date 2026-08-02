import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  listConversations, createConversation, getConversation, saveConversation,
  renameConversation, deleteConversation,
} from '../electron/lib/scout/conversation-store'

let root: string
beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'scout-conv-')) })
afterEach(() => { fs.rmSync(root, { recursive: true, force: true }) })

describe('scout conversation-store', () => {
  it('createConversation 生成 JSON，默认名为创建日期时间', () => {
    const c = createConversation(root)
    expect(c.messages).toEqual([])
    expect(c.title).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/)
    expect(fs.existsSync(c.filePath)).toBe(true)
    expect(c.filePath).toContain(path.join('拾贝', '对话'))
  })

  it('saveConversation 更新消息与 updatedAt；getConversation 还原候选状态', () => {
    const c = createConversation(root)
    c.messages = [
      { role: 'user', content: '找文章' },
      { role: 'assistant', content: '候选如下', candidates: [{ title: 'A', url: 'https://a.com', sourceName: 'a.com', reason: '好', fetchable: true }], candidatesResolved: false },
    ]
    saveConversation(root, c)
    const loaded = getConversation(root, c.id)
    expect(loaded?.messages).toHaveLength(2)
    expect(loaded?.messages[1].candidates?.[0].fetchable).toBe(true)
    expect(loaded!.updatedAt >= c.createdAt).toBe(true)
  })

  it('listConversations 按 updatedAt 倒序，只含 meta', () => {
    const a = createConversation(root)
    const b = createConversation(root)
    saveConversation(root, { ...a, messages: [{ role: 'user', content: 'x' }] })
    const list = listConversations(root)
    expect(list).toHaveLength(2)
    expect(list[0].id).toBe(a.id) // a 刚保存过，最新
    expect((list[0] as any).messages).toBeUndefined()
    expect(list.map(x => x.id).sort()).toEqual([a.id, b.id].sort())
  })

  it('renameConversation 改名不动文件名', () => {
    const c = createConversation(root)
    const r = renameConversation(root, c.id, 'Agent 架构研究')
    expect(r).toEqual({ ok: true })
    const loaded = getConversation(root, c.id)
    expect(loaded?.title).toBe('Agent 架构研究')
    expect(loaded?.filePath).toBe(c.filePath)
  })

  it('deleteConversation 删文件；不存在返回错误', () => {
    const c = createConversation(root)
    expect(deleteConversation(root, c.id)).toEqual({ ok: true })
    expect(fs.existsSync(c.filePath)).toBe(false)
    expect(deleteConversation(root, c.id).ok).toBe(false)
  })

  it('损坏 JSON 容错：list 跳过，get 返回 null', () => {
    const dir = path.join(root, '拾贝', '对话')
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, '20990101-0000-bad0.json'), '{broken', 'utf8')
    expect(listConversations(root)).toHaveLength(0)
    expect(getConversation(root, '20990101-0000-bad0')).toBeNull()
  })
})
