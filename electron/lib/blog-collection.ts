import path from 'path'
import { safeReadJson, safeWriteJson } from './safe-json'
import type { BlogCollectionFile, BlogCollectionEntry, BlogRecommendBatch, BlogReadEntry } from '@shared/index'

export function collectionPath(lib: string): string {
  return path.join(lib, 'Anthropic博客', '.collection.json')
}

const EMPTY: BlogCollectionFile = { version: 1, entries: [], dismissed: [], history: [], read: [] }

export function loadCollection(lib: string): BlogCollectionFile {
  const raw = safeReadJson<Partial<BlogCollectionFile>>(collectionPath(lib), { fallback: {} })
  if (raw.version !== 1) return { ...EMPTY }
  return {
    version: 1,
    entries: Array.isArray(raw.entries) ? raw.entries : [],
    dismissed: Array.isArray(raw.dismissed) ? raw.dismissed : [],
    history: Array.isArray(raw.history) ? raw.history : [],
    read: Array.isArray(raw.read) ? raw.read : [],
  }
}

export function saveCollection(lib: string, c: BlogCollectionFile): void {
  safeWriteJson(collectionPath(lib), c)
}

export function addManualEntry(
  c: BlogCollectionFile,
  args: { sourceUrl: string; filePath: string; title: string }
): BlogCollectionFile {
  if (c.entries.some(e => e.sourceUrl === args.sourceUrl)) return c
  const entry: BlogCollectionEntry = {
    sourceUrl: args.sourceUrl,
    filePath: args.filePath,
    title: args.title,
    addedAt: new Date().toISOString(),
    origin: 'manual',
  }
  // 互斥：收藏即出已读
  return {
    ...c,
    entries: [...c.entries, entry],
    dismissed: c.dismissed.filter(d => d !== args.sourceUrl),
    read: c.read.filter(r => r.sourceUrl !== args.sourceUrl),
  }
}

export function removeEntry(c: BlogCollectionFile, sourceUrl: string): BlogCollectionFile {
  const target = c.entries.find(e => e.sourceUrl === sourceUrl)
  if (!target) return c
  const dismissed = target.origin === 'recommend'
    ? Array.from(new Set([...c.dismissed, sourceUrl]))
    : c.dismissed
  return { ...c, entries: c.entries.filter(e => e.sourceUrl !== sourceUrl), dismissed }
}

export function applyRecommend(
  c: BlogCollectionFile,
  batch: BlogRecommendBatch,
  pickEntries: BlogCollectionEntry[]
): BlogCollectionFile {
  const manual = c.entries.filter(e => e.origin === 'manual')
  const history = [batch, ...c.history].slice(0, 20)
  return { version: 1, entries: [...manual, ...pickEntries], dismissed: c.dismissed, history, read: c.read }
}

/** 标记已读：幂等（已存在直接返回原对象），新条目插到最前；互斥：已读即出收藏夹 */
export function markRead(
  c: BlogCollectionFile,
  args: { sourceUrl: string; filePath: string; title: string }
): BlogCollectionFile {
  if (c.read.some(r => r.sourceUrl === args.sourceUrl)) return c
  const entry: BlogReadEntry = {
    sourceUrl: args.sourceUrl,
    filePath: args.filePath,
    title: args.title,
    readAt: new Date().toISOString(),
  }
  // 互斥：出收藏夹；recommend 来源记 dismissed（同 removeEntry）
  const target = c.entries.find(e => e.sourceUrl === args.sourceUrl)
  const dismissed = target?.origin === 'recommend'
    ? Array.from(new Set([...c.dismissed, args.sourceUrl]))
    : c.dismissed
  return {
    ...c,
    entries: c.entries.filter(e => e.sourceUrl !== args.sourceUrl),
    dismissed,
    read: [entry, ...c.read],
  }
}

export function removeRead(c: BlogCollectionFile, sourceUrl: string): BlogCollectionFile {
  return { ...c, read: c.read.filter(r => r.sourceUrl !== sourceUrl) }
}

/** 推荐条目转正为手动收藏：下批推荐后仍保留。非 recommend 或不存在返回原对象 */
export function promoteEntry(c: BlogCollectionFile, sourceUrl: string): BlogCollectionFile {
  const target = c.entries.find(e => e.sourceUrl === sourceUrl)
  if (!target || target.origin !== 'recommend') return c
  return { ...c, entries: c.entries.map(e => e.sourceUrl === sourceUrl ? { ...e, origin: 'manual' as const } : e) }
}

/** 删除指定推荐批次的历史记录，不动 entries/dismissed/read */
export function removeBatch(c: BlogCollectionFile, batch: number): BlogCollectionFile {
  return { ...c, history: c.history.filter(b => b.batch !== batch) }
}
