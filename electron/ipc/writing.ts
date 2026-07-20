import { ipcMain, dialog, BrowserWindow } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import type { AppConfig } from '../env'
import type { WritingErrorCode, WritingRoot } from '../../src/types'
import * as tree from '../lib/writing-tree'
import { ensureRoots } from '../lib/writing-tree'
import { updateEntry, removeEntry, migrateEntry } from '../lib/writing-catalog'
import { generateWritingSummary } from '../lib/llm-tasks'

const KNOWN_CODES: WritingErrorCode[] = ['WRITING_PATH_FORBIDDEN', 'WRITING_NOT_FOUND', 'WRITING_NAME_CONFLICT']

export async function wrapWriting<T>(fn: () => T | Promise<T>): Promise<{ ok: true; value: T } | { ok: false; code: WritingErrorCode; message: string }> {
  try {
    return { ok: true, value: await fn() }
  } catch (err) {
    const e = err as Error & { code?: string }
    const code: WritingErrorCode = KNOWN_CODES.includes(e.code as WritingErrorCode) ? (e.code as WritingErrorCode) : 'WRITING_IO_ERROR'
    return { ok: false, code, message: e.message }
  }
}

function parseTargetDir(rel: string): { root: WritingRoot; dir: string } {
  const idx = rel.indexOf('/')
  if (idx === -1) return { root: rel as WritingRoot, dir: '' }
  return { root: rel.slice(0, idx) as WritingRoot, dir: rel.slice(idx + 1) }
}

function rootFromPath(p: string): WritingRoot {
  return p.startsWith('writing/') || p === 'writing' ? 'writing' : 'repository'
}

export function registerWritingIpc(cfg: AppConfig): void {
  const lib = cfg.libraryPath
  ensureRoots(lib)

  ipcMain.handle('writing:scanTree', () => {
    ensureRoots(lib)
    return wrapWriting(() => ({ writing: tree.scanRoot(lib, 'writing'), repository: tree.scanRoot(lib, 'repository') }))
  })

  ipcMain.handle('writing:createFile', (_, a: { root: 'writing' | 'repository'; dir: string; name: string }) =>
    wrapWriting(() => ({ path: tree.createFile(lib, a.root, a.dir, a.name) })))

  ipcMain.handle('writing:createFolder', (_, a: { root: 'writing' | 'repository'; dir: string; name: string }) =>
    wrapWriting(() => ({ path: tree.createFolder(lib, a.root, a.dir, a.name) })))

  ipcMain.handle('writing:rename', async (_, a: { path: string; newName: string }) => {
    const result = await wrapWriting(() => ({ path: tree.renameNode(lib, a.path, a.newName) }))
    if (result.ok) {
      try { migrateEntry(lib, rootFromPath(a.path), a.path, result.value.path) } catch { /* silent */ }
    }
    return result
  })

  ipcMain.handle('writing:move', async (_, a: { path: string; targetDir: string }) => {
    const result = await wrapWriting(() => ({ path: tree.moveNode(lib, a.path, a.targetDir) }))
    if (result.ok) {
      try { migrateEntry(lib, rootFromPath(a.path), a.path, result.value.path) } catch { /* silent */ }
    }
    return result
  })

  ipcMain.handle('writing:delete', async (_, a: { path: string }) => {
    const result = await wrapWriting(() => { tree.deleteNode(lib, a.path); return null })
    if (result.ok) {
      try { removeEntry(lib, rootFromPath(a.path), a.path) } catch { /* silent */ }
    }
    return result
  })

  ipcMain.handle('writing:read', (_, a: { path: string }) =>
    wrapWriting(() => tree.readWritingFile(lib, a.path)))

  ipcMain.handle('writing:write', async (_, a: { path: string; body: string }) => {
    const result = await wrapWriting(() => { tree.writeWritingFile(lib, a.path, a.body); return null })
    if (result.ok) {
      // fire-and-forget: generate summary and update catalog
      setTimeout(async () => {
        try {
          const { body } = tree.readWritingFile(lib, a.path)
          const summary = await generateWritingSummary(cfg, path.basename(a.path, '.md'), body)
          if (summary) updateEntry(lib, rootFromPath(a.path), a.path, { title: path.basename(a.path, '.md'), summary, updatedAt: new Date().toISOString().slice(0, 10) })
        } catch { /* silent */ }
      }, 0)
    }
    return result
  })

  ipcMain.handle('writing:importFiles', async (event, a: { targetDir: string }) =>
    wrapWriting(async () => {
      const win = BrowserWindow.fromWebContents(event.sender)
      const r = await dialog.showOpenDialog(win!, {
        properties: ['openFile', 'multiSelections'],
        filters: [{ name: 'Markdown', extensions: ['md'] }],
      })
      if (r.canceled) return { imported: [] }

      const targetRel = a.targetDir || 'repository'
      tree.assertInsideRoots(lib, targetRel)
      const { root, dir } = parseTargetDir(targetRel)

      const imported: string[] = []
      for (const src of r.filePaths) {
        const baseName = path.basename(src, '.md')
        const destRel = tree.createFile(lib, root, dir, baseName + '.md')
        fs.copyFileSync(src, path.join(lib, destRel))
        imported.push(destRel)
      }

      // fire-and-forget: generate summaries for imported files
      const destRoot = root
      setTimeout(async () => {
        for (const destRel of imported) {
          try {
            const { body } = tree.readWritingFile(lib, destRel)
            const summary = await generateWritingSummary(cfg, path.basename(destRel, '.md'), body)
            if (summary) updateEntry(lib, destRoot, destRel, { title: path.basename(destRel, '.md'), summary, updatedAt: new Date().toISOString().slice(0, 10) })
          } catch { /* silent */ }
        }
      }, 0)

      return { imported }
    }))
}
