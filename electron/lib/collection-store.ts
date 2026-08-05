import path from 'node:path'
import { safeReadJson, safeWriteJson } from './safe-json'
import type { BriefingCollection, BriefingCollectionEntry, BriefingCollectionQA } from '@shared/index'

const COLLECTION_VERSION = 1

export function collectionPathFor(libraryPath: string): string {
  return path.join(libraryPath, '夜航简报', '精选集.json')
}

export function readCollection(libraryPath: string): BriefingCollection {
  const data = safeReadJson<unknown>(collectionPathFor(libraryPath), { fallback: null })
  if (
    !data ||
    typeof data !== 'object' ||
    (data as { version?: unknown }).version !== COLLECTION_VERSION ||
    !Array.isArray((data as { entries?: unknown }).entries)
  ) {
    return { version: COLLECTION_VERSION, entries: [] }
  }
  return data as BriefingCollection
}

export function addCollectionEntry(libraryPath: string, entry: BriefingCollectionEntry): 'ok' | 'duplicate' {
  const col = readCollection(libraryPath)
  const dup = col.entries.some(
    (e) => e.briefingFilePath === entry.briefingFilePath && e.chunkIndex === entry.chunkIndex && e.chunkHeading === entry.chunkHeading
  )
  if (dup) return 'duplicate'
  col.entries.unshift(entry)
  safeWriteJson(collectionPathFor(libraryPath), col)
  return 'ok'
}

export function removeCollectionEntry(libraryPath: string, id: string): void {
  const col = readCollection(libraryPath)
  col.entries = col.entries.filter((e) => e.id !== id)
  safeWriteJson(collectionPathFor(libraryPath), col)
}

export function appendCollectionQA(
  libraryPath: string,
  id: string,
  qa: BriefingCollectionQA[],
  qaMessageCount: number
): void {
  const col = readCollection(libraryPath)
  const entry = col.entries.find((e) => e.id === id)
  if (!entry) return
  if (qaMessageCount <= entry.qaMessageCount) return // 幂等：游标不前进则不追加
  entry.qa.push(...qa)
  entry.qaMessageCount = qaMessageCount
  entry.updatedAt = new Date().toISOString()
  safeWriteJson(collectionPathFor(libraryPath), col)
}
