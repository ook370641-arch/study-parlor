import path from 'node:path'
import { safeReadJson, safeWriteJson } from './safe-json'
import type { NotepadClaim, NotepadItem } from '@shared/index'

export type NotepadClaimsFile = Record<string, NotepadClaim>

export function readNotepadClaims(stateDir: string): NotepadClaimsFile {
  return safeReadJson(path.join(stateDir, 'notepad-claims.json'), { fallback: {} })
}

export function mergeNotepadClaims(items: NotepadItem[], claims: NotepadClaimsFile): NotepadItem[] {
  return items.map(item => claims[item.id] ? { ...item, claim: claims[item.id] } : { ...item })
}

export function pruneNotepadClaims(stateDir: string, items: NotepadItem[]): void {
  const file = path.join(stateDir, 'notepad-claims.json')
  const claims = readNotepadClaims(stateDir)
  const ids = new Set(items.map(item => item.id))
  const next = Object.fromEntries(Object.entries(claims).filter(([id]) => ids.has(id)))
  if (Object.keys(next).length !== Object.keys(claims).length) safeWriteJson(file, next)
}
