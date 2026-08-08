import { ipcMain, dialog, BrowserWindow } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import type { AppConfig } from '../env'
import type { WritingErrorCode, WritingRoot } from '../../src/types'
import * as tree from '../lib/writing-tree'
import { ensureRoots } from '../lib/writing-tree'
import { updateEntry, removeEntry, migrateEntry, diffStale } from '../lib/writing-catalog'
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
    const result = await wrapWriting(() => {
      const abs = tree.assertInsideRoots(lib, a.path)
      if (fs.statSync(abs).isDirectory()) return tree.dissolveGroup(lib, a.path)
      tree.deleteNode(lib, a.path)
      return { moved: [] as { from: string; to: string }[] }
    })
    if (result.ok) {
      try {
        const root = rootFromPath(a.path)
        for (const m of result.value.moved) migrateEntry(lib, root, m.from, m.to)
        removeEntry(lib, root, a.path)
      } catch { /* silent */ }
    }
    return result
  })

  ipcMain.handle('writing:read', (_, a: { path: string }) =>
    wrapWriting(() => tree.readWritingFile(lib, a.path)))

  ipcMain.handle('writing:write', (_, a: { path: string; body: string }) =>
    wrapWriting(() => { tree.writeWritingFile(lib, a.path, a.body); return null }))

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

      return { imported }
    }))

  ipcMain.handle('writing:refreshCatalog', () =>
    wrapWriting(async () => {
      const roots: WritingRoot[] = ['writing', 'repository']
      const pending = roots.flatMap(root => diffStale(lib, root))
      // fire-and-forget:逐篇后台生成,调用方不阻塞
      setTimeout(async () => {
        for (const rel of pending) {
          const root = rootFromPath(rel)
          try {
            const { body } = tree.readWritingFile(lib, rel)
            const mtimeMs = fs.statSync(path.join(lib, rel)).mtimeMs
            const summary = process.env.NODE_ENV === 'test' && !!process.env.E2E_CONFIG_DIR
              ? 'E2E 摘要'
              : await generateWritingSummary(cfg, path.basename(rel, '.md'), body)
            if (summary) updateEntry(lib, root, rel, { title: path.basename(rel, '.md'), summary, mtimeMs })
          } catch { /* silent — 下次进入再补 */ }
        }
      }, 0)
      return { refreshed: pending.length }
    }))
}
