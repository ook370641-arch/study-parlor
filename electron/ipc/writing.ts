import { ipcMain, dialog, BrowserWindow, shell } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import type { AppConfig } from '../env'
import type { WritingErrorCode, WritingRoot, WritingTreeNode } from '../../src/types'
import { isNonMdExt } from '../../src/types'
import * as tree from '../lib/writing-tree'
import { ensureRoots, isNonMdPath } from '../lib/writing-tree'
import { updateEntry, removeEntry, migrateEntry, migratePrefix, diffStale, loadCatalog, collectGroupDirs, groupSignature, updateGroupSummary, removeGroupSummary } from '../lib/writing-catalog'
import { generateWritingSummary, generateGroupSummary } from '../lib/llm-tasks'
import { previewFile } from '../lib/file-preview'

const KNOWN_CODES: WritingErrorCode[] = ['WRITING_PATH_FORBIDDEN', 'WRITING_NOT_FOUND', 'WRITING_NAME_CONFLICT', 'PREVIEW_PARSE_ERROR', 'PDF_NO_TEXT']

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

/** 收集树中全部非 md 文件（xlsx/pdf/docx）的相对路径。 */
function collectNonMdFiles(nodes: WritingTreeNode[]): string[] {
  const out: string[] = []
  for (const n of nodes) {
    if (n.kind === 'file') {
      if (isNonMdPath(n.path)) out.push(n.path)
    } else {
      out.push(...collectNonMdFiles(n.children ?? []))
    }
  }
  return out
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
      try {
        const root = rootFromPath(a.path)
        if (fs.statSync(path.join(lib, result.value.path)).isDirectory()) {
          migratePrefix(lib, root, a.path, result.value.path)
        } else {
          migrateEntry(lib, root, a.path, result.value.path)
        }
      } catch { /* silent */ }
    }
    return result
  })

  ipcMain.handle('writing:move', async (_, a: { path: string; targetDir: string }) => {
    const result = await wrapWriting(() => ({ path: tree.moveNode(lib, a.path, a.targetDir) }))
    if (result.ok) {
      try {
        const root = rootFromPath(a.path)
        if (fs.statSync(path.join(lib, result.value.path)).isDirectory()) {
          migratePrefix(lib, root, a.path, result.value.path)
        } else {
          migrateEntry(lib, root, a.path, result.value.path)
        }
      } catch { /* silent */ }
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
        removeGroupSummary(lib, root, a.path)
      } catch { /* silent */ }
    }
    return result
  })

  ipcMain.handle('writing:read', (_, a: { path: string }) =>
    wrapWriting(() => tree.readWritingFile(lib, a.path)))

  ipcMain.handle('writing:write', (_, a: { path: string; body: string }) =>
    wrapWriting(() => { tree.writeWritingFile(lib, a.path, a.body); return null }))

  /** 把 md 拷入（带 frontmatter）或把 xlsx/pdf/docx 按原样拷入；其它扩展名跳过。 */
  function importPathsToLibrary(targetRel: string, filePaths: string[]): { imported: string[]; skipped: string[] } {
    tree.assertInsideRoots(lib, targetRel)
    const { root, dir } = parseTargetDir(targetRel)
    const imported: string[] = []
    const skipped: string[] = []
    for (const src of filePaths) {
      const ext = path.extname(src).toLowerCase().slice(1)
      if (ext === 'md') {
        const baseName = path.basename(src, '.md')
        const destRel = tree.createFile(lib, root, dir, baseName + '.md')
        fs.copyFileSync(src, path.join(lib, destRel))
        imported.push(destRel)
      } else if (isNonMdExt(ext)) {
        imported.push(tree.importBinaryFile(lib, root, dir, src))
      } else {
        skipped.push(path.basename(src))
      }
    }
    return { imported, skipped }
  }

  ipcMain.handle('writing:importFiles', async (event, a: { targetDir: string }) =>
    wrapWriting(async () => {
      const win = BrowserWindow.fromWebContents(event.sender)
      const r = await dialog.showOpenDialog(win!, {
        properties: ['openFile', 'multiSelections'],
        filters: [
          { name: 'Markdown', extensions: ['md'] },
          { name: 'Office 文档', extensions: ['xlsx', 'pdf', 'docx'] },
          { name: '所有文件', extensions: ['*'] },
        ],
      })
      if (r.canceled) return { imported: [], skipped: [] }
      return importPathsToLibrary(a.targetDir || 'repository', r.filePaths)
    }))

  // 系统拖拽导入（preload webUtils.getPathForFile 提供真实路径）
  ipcMain.handle('writing:importPaths', (_, a: { targetDir: string; paths: string[] }) =>
    wrapWriting(() => importPathsToLibrary(a.targetDir, a.paths)))

  // 非 md 文件预览（解析为 markdown）
  ipcMain.handle('writing:readPreview', (_, a: { path: string }) =>
    wrapWriting(() => previewFile(lib, a.path)))

  // 用系统默认程序打开（预览降级/兜底入口）
  ipcMain.handle('writing:openInSystem', (_, a: { path: string }) =>
    wrapWriting(async () => {
      const abs = tree.assertInsideRoots(lib, a.path)
      if (!fs.existsSync(abs)) throw Object.assign(new Error(`文件不存在: ${a.path}`), { code: 'WRITING_NOT_FOUND' })
      const err = await shell.openPath(abs)
      if (err) throw Object.assign(new Error(err), { code: 'WRITING_IO_ERROR' })
      return null
    }))

  // HTML 删除模式写回（原文，含按天备份；校验在 writeHtmlFile 内）
  ipcMain.handle('writing:saveHtml', (_, a: { path: string; html: string }) =>
    wrapWriting(() => { tree.writeHtmlFile(lib, a.path, a.html); return null }))

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
        // 非 md 文件：本地派生 stub 摘要（不进 LLM），使其出现在助手资料目录且随 mtime 重算
        for (const root of roots) {
          try {
            for (const rel of collectNonMdFiles(tree.scanRoot(lib, root))) {
              try {
                const abs = path.join(lib, rel)
                const mtimeMs = fs.statSync(abs).mtimeMs
                const existing = loadCatalog(lib, root).entries[rel]
                if (existing && existing.mtimeMs === mtimeMs) continue
                const ext = path.extname(rel).slice(1)
                updateEntry(lib, root, rel, {
                  title: path.basename(rel, `.${ext}`),
                  summary: `${ext.toUpperCase()} 文件，可用 read_local 读取内容`,
                  mtimeMs,
                })
              } catch { /* 文件消失——忽略 */ }
            }
          } catch { /* silent */ }
        }
        // 分组摘要：逐篇补齐后，对签名过期的分组生成（基于 catalog 条目 mtime 的签名）
        for (const root of roots) {
          try {
            const catalog = loadCatalog(lib, root)
            const dirs = collectGroupDirs(tree.scanRoot(lib, root))
            for (const { rel, memberPaths } of dirs) {
              const sig = groupSignature(catalog, memberPaths)
              if (catalog.groups[rel]?.signature === sig) continue
              const texts = memberPaths.map(p => catalog.entries[p]?.summary).filter((s): s is string => !!s)
              if (texts.length === 0) continue
              const summary = process.env.NODE_ENV === 'test' && !!process.env.E2E_CONFIG_DIR
                ? 'E2E 分组摘要'
                : await generateGroupSummary(cfg, path.basename(rel), texts.slice(0, 30).join('；'))
              if (summary) updateGroupSummary(lib, root, rel, { summary, signature: sig })
            }
          } catch { /* silent — 下次进入再补 */ }
        }
      }, 0)
      return { refreshed: pending.length }
    }))
}
