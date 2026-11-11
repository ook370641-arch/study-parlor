import { afterEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { mergeNotepadClaims, pruneNotepadClaims, readNotepadClaims } from '@electron/lib/notepad-claims'
import type { NotepadItem } from '@shared/index'

const dirs: string[] = []
function tempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'notepad-claims-'))
  dirs.push(dir)
  return dir
}
afterEach(() => { dirs.splice(0).forEach(dir => fs.rmSync(dir, { recursive: true, force: true })) })

const item: NotepadItem = { id: 'n4', text: '设置中心', category: 'feature', createdAt: '2026-11-11T00:00:00Z' }

describe('notepad claims', () => {
  it('只给仍存在的待办叠加认领', () => {
    const result = mergeNotepadClaims([item], { n4: { claimedBy: 'codex/a', claimedAt: '2026-11-11T01:00:00Z' }, stale: { claimedBy: 'codex/b', claimedAt: '2026-11-11T01:00:00Z' } })
    expect(result[0].claim?.claimedBy).toBe('codex/a')
    expect(result[0]).not.toHaveProperty('stale')
    expect(item.claim).toBeUndefined()
  })

  it('损坏主文件时从 bak 恢复', () => {
    const dir = tempDir()
    const file = path.join(dir, 'notepad-claims.json')
    fs.writeFileSync(file, '{bad')
    fs.writeFileSync(file + '.bak', JSON.stringify({ n4: { claimedBy: 'codex/a', claimedAt: 'now' } }))
    expect(readNotepadClaims(dir).n4.claimedBy).toBe('codex/a')
  })

  it('归档后 prune 只删除不存在的待办 id', () => {
    const dir = tempDir()
    fs.writeFileSync(path.join(dir, 'notepad-claims.json'), JSON.stringify({ n4: { claimedBy: 'codex/a', claimedAt: 'now' }, n5: { claimedBy: 'codex/b', claimedAt: 'now' } }))
    pruneNotepadClaims(dir, [item])
    expect(Object.keys(readNotepadClaims(dir))).toEqual(['n4'])
  })
})
