import path from 'node:path'
import { readClaimsFile, withClaimsLock, writeClaimsFile } from './notepad-claims-shared.cjs'
import type { NotepadClaim, NotepadItem } from '@shared/index'

export type NotepadClaimsFile = Record<string, NotepadClaim>

export function readNotepadClaims(stateDir: string): NotepadClaimsFile {
  return readClaimsFile(path.join(stateDir, 'notepad-claims.json'))
}

export function mergeNotepadClaims(items: NotepadItem[], claims: NotepadClaimsFile): NotepadItem[] {
  return items.map(item => claims[item.id] ? { ...item, claim: claims[item.id] } : { ...item })
}

export function pruneNotepadClaims(stateDir: string, items: NotepadItem[]): void {
  const file = path.join(stateDir, 'notepad-claims.json')
  withClaimsLock(file, () => {
    const claims = readClaimsFile(file)
    const ids = new Set(items.map(item => item.id))
    const next = Object.fromEntries(Object.entries(claims).filter(([id]) => ids.has(id)))
    if (Object.keys(next).length !== Object.keys(claims).length) writeClaimsFile(file, next)
  })
}
