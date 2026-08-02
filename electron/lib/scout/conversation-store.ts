import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import type { ScoutConversation, ScoutConversationMeta } from '@shared/index'
import { SCOUT_DIR } from './article-store'

const CONVERSATIONS_SUBDIR = '对话'

function conversationsDir(libraryRoot: string): string {
  return path.join(libraryRoot, SCOUT_DIR, CONVERSATIONS_SUBDIR)
}

function filePathFor(libraryRoot: string, id: string): string {
  // id 只允许安全字符，防路径穿越
  const safe = id.replace(/[^\w-]/g, '')
  return path.join(conversationsDir(libraryRoot), `${safe}.json`)
}

function defaultTitle(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

function makeId(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}-${crypto.randomBytes(2).toString('hex')}`
}

type ConversationFile = {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  messages: ScoutConversation['messages']
}

function readFile(filePath: string): ConversationFile | null {
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8')) as ConversationFile
    if (typeof data.id !== 'string' || !Array.isArray(data.messages)) return null
    return {
      id: data.id,
      title: typeof data.title === 'string' ? data.title : data.id,
      createdAt: typeof data.createdAt === 'string' ? data.createdAt : new Date().toISOString(),
      updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : data.createdAt,
      messages: data.messages,
    }
  } catch {
    return null
  }
}

export function createConversation(libraryRoot: string): ScoutConversation {
  const now = new Date()
  const id = makeId(now)
  fs.mkdirSync(conversationsDir(libraryRoot), { recursive: true })
  const conv: ScoutConversation = {
    id,
    title: defaultTitle(now),
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    filePath: filePathFor(libraryRoot, id),
    messages: [],
  }
  fs.writeFileSync(conv.filePath, JSON.stringify(conv, null, 2), 'utf8')
  return conv
}

export function getConversation(libraryRoot: string, id: string): ScoutConversation | null {
  const filePath = filePathFor(libraryRoot, id)
  const data = readFile(filePath)
  if (!data) return null
  return { ...data, filePath }
}

export function saveConversation(libraryRoot: string, conv: ScoutConversation): void {
  const updated: ConversationFile = {
    id: conv.id,
    title: conv.title,
    createdAt: conv.createdAt,
    updatedAt: new Date().toISOString(),
    messages: conv.messages,
  }
  fs.mkdirSync(conversationsDir(libraryRoot), { recursive: true })
  fs.writeFileSync(filePathFor(libraryRoot, conv.id), JSON.stringify(updated, null, 2), 'utf8')
}

export function listConversations(libraryRoot: string): ScoutConversationMeta[] {
  const dir = conversationsDir(libraryRoot)
  if (!fs.existsSync(dir)) return []
  const list: ScoutConversationMeta[] = []
  for (const entry of fs.readdirSync(dir)) {
    if (!entry.endsWith('.json')) continue
    const filePath = path.join(dir, entry)
    const data = readFile(filePath)
    if (!data) continue
    list.push({
      id: data.id,
      title: data.title,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
      filePath,
    })
  }
  list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.id.localeCompare(a.id))
  return list
}

export function renameConversation(
  libraryRoot: string,
  id: string,
  title: string
): { ok: true } | { ok: false; message: string } {
  const conv = getConversation(libraryRoot, id)
  if (!conv) return { ok: false, message: '对话不存在' }
  const trimmed = title.trim()
  if (!trimmed) return { ok: false, message: '名称不能为空' }
  saveConversation(libraryRoot, { ...conv, title: trimmed.slice(0, 60) })
  return { ok: true }
}

export function deleteConversation(
  libraryRoot: string,
  id: string
): { ok: true } | { ok: false; message: string } {
  const filePath = filePathFor(libraryRoot, id)
  if (!fs.existsSync(filePath)) return { ok: false, message: '对话不存在' }
  try {
    fs.rmSync(filePath)
    return { ok: true }
  } catch (err: any) {
    return { ok: false, message: err?.message || String(err) }
  }
}
