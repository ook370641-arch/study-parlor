import fs from 'node:fs'
import path from 'node:path'
import matter from 'gray-matter'
import { isNonMdExt } from '../../src/types'
import type { WritingRoot, WritingTreeNode } from '@shared/index'

// ── constants ────────────────────────────────────────────────
export const WRITING_ROOTS: WritingRoot[] = ['writing', 'repository']

// ── helpers ──────────────────────────────────────────────────

const HIDDEN_FILE_PATTERNS = [
  /\.assistant\.md$/,
  /\.annotations\.md$/,
  /\.guide\.md$/,
  /^\.catalog\.json$/,
  /^\.assets$/,
  // 回收站设计已于 2026-08-09 下线（改为确认后真删）；保留隐藏规则防止
  // 老库残留的 .trash 目录在树里显示成分组。
  /^\.trash$/,
  // Office/WPS 打开文件时生成的锁文件（~$报表.xlsx），不是用户文档
  /^~\$/,
  // 按天备份目录（2026-08-17 设计：writing/.backups 镜像备份，不进目录树）
  /^\.backups$/,
]

function isHidden(name: string): boolean {
  return HIDDEN_FILE_PATTERNS.some(p => p.test(name))
}

function code(c: string, msg: string): Error {
  const e = new Error(`${c}: ${msg}`)
  ;(e as Error & { code?: string }).code = c
  return e
}

function toRel(lib: string, absPath: string): string {
  return path.relative(lib, absPath).replace(/\\/g, '/')
}

function uniqueName(absDir: string, name: string): string {
  const ext = path.extname(name)
  const base = path.basename(name, ext)
  let candidate = name
  let n = 1
  while (fs.existsSync(path.join(absDir, candidate))) {
    const now = new Date()
    const pad = (v: number) => String(v).padStart(2, '0')
    const suffix = pad(now.getHours()) + pad(now.getMinutes())
    if (n === 1) {
      candidate = `${base}-${suffix}${ext}`
    } else {
      candidate = `${base}-${suffix}-${n}${ext}`
    }
    n++
  }
  return candidate
}

// ── security ─────────────────────────────────────────────────

/**
 * Resolve a relative path to absolute and validate it stays within `lib`.
 * Returns the resolved absolute path.
 */
export function assertInsideRoots(lib: string, rel: string): string {
  if (rel.includes('..')) {
    throw code('WRITING_PATH_FORBIDDEN', `Path traversal not allowed: ${rel}`)
  }
  const abs = path.resolve(lib, rel)
  const normLib = path.resolve(lib) + path.sep
  if (!abs.startsWith(normLib) && abs !== path.resolve(lib)) {
    throw code('WRITING_PATH_FORBIDDEN', `Path outside library: ${rel}`)
  }
  return abs
}

// ── ensure roots ─────────────────────────────────────────────

export function ensureRoots(lib: string): void {
  for (const root of WRITING_ROOTS) {
    const dir = path.join(lib, root)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
  }
}

/** 是否为写作树中可预览的非 md 文件（xlsx/pdf/docx）。 */
export function isNonMdPath(rel: string): boolean {
  return isNonMdExt(path.extname(rel).slice(1))
}

// ── scan ─────────────────────────────────────────────────────

function scanDir(absoluteDir: string, lib: string): WritingTreeNode[] {
  if (!fs.existsSync(absoluteDir)) return []

  const entries = fs.readdirSync(absoluteDir, { withFileTypes: true })
  const result: WritingTreeNode[] = []

  for (const entry of entries) {
    if (isHidden(entry.name)) continue
    if (entry.isDirectory()) {
      const children = scanDir(path.join(absoluteDir, entry.name), lib)
      result.push({
        name: entry.name,
        path: toRel(lib, path.join(absoluteDir, entry.name)),
        kind: 'dir',
        children,
      })
    } else if (entry.isFile() && (entry.name.toLowerCase().endsWith('.md') || isNonMdExt(path.extname(entry.name).slice(1)))) {
      const relPath = toRel(lib, path.join(absoluteDir, entry.name))
      result.push({ name: entry.name, path: relPath, kind: 'file' })
    }
    // ignore other files
  }

  // sort: dirs first, then by zh localeCompare
  result.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'dir' ? -1 : 1
    return a.name.localeCompare(b.name, 'zh')
  })

  return result
}

export function scanRoot(lib: string, root: WritingRoot): WritingTreeNode[] {
  const rootDir = path.join(lib, root)
  if (root === 'repository') stampMissingCreated(rootDir)
  return scanDir(rootDir, lib)
}

/**
 * repository/ 外部引入文件补 created(2026-08-19 设计,详见 tests/writing-created.test.ts)。
 * 覆盖所有引入途径(UI 导入、外部拷入)的单点:它们最终都经过扫描。
 * 取值 = 文件 birthtime(拷入库的时刻);只补缺失项,既有 frontmatter 全部保留;
 * 单文件失败只记日志,不阻断扫描。updated 不碰——应用内首次保存时才刷新。
 */
function stampMissingCreated(absDir: string): void {
  if (!fs.existsSync(absDir)) return
  for (const entry of fs.readdirSync(absDir, { withFileTypes: true })) {
    if (isHidden(entry.name)) continue
    const abs = path.join(absDir, entry.name)
    if (entry.isDirectory()) {
      stampMissingCreated(abs)
      continue
    }
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.md')) continue
    try {
      const raw = fs.readFileSync(abs, 'utf-8')
      const parsed = matter(raw)
      if (parsed.data.created) continue
      const created = fs.statSync(abs).birthtime.toISOString()
      const content = matter.stringify(parsed.content.replace(/^\n/, ''), { ...parsed.data, created })
      fs.writeFileSync(abs, content, 'utf-8')
    } catch (e) {
      console.warn('[writing-stamp] created 补写失败:', abs, e)
    }
  }
}

// ── create ───────────────────────────────────────────────────

function createDir(absDir: string): void {
  if (!fs.existsSync(absDir)) {
    fs.mkdirSync(absDir, { recursive: true })
  }
}

export function createFile(lib: string, root: WritingRoot, dir: string, name: string): string {
  const relDir = dir ? `${root}/${dir}` : root
  const absDir = assertInsideRoots(lib, relDir)
  createDir(absDir)

  const fileName = name.endsWith('.md') ? name : `${name}.md`
  const safeName = uniqueName(absDir, fileName)
  const absPath = path.join(absDir, safeName)
  const frontmatter = { type: 'writing' as const, created: new Date().toISOString() }
  const content = matter.stringify('', frontmatter)
  fs.writeFileSync(absPath, content, 'utf-8')

  return toRel(lib, absPath)
}

/** 把外部二进制文件（xlsx/pdf/docx）按原名拷入写作库；重名自动加时间戳后缀。 */
export function importBinaryFile(lib: string, root: WritingRoot, dir: string, srcPath: string): string {
  const relDir = dir ? `${root}/${dir}` : root
  const absDir = assertInsideRoots(lib, relDir)
  createDir(absDir)
  const name = path.basename(srcPath)
  const safeName = uniqueName(absDir, name)
  const absPath = path.join(absDir, safeName)
  fs.copyFileSync(srcPath, absPath)
  return toRel(lib, absPath)
}

export function createFolder(lib: string, root: WritingRoot, dir: string, name: string): string {
  const parentRel = dir ? `${root}/${dir}` : root
  const absParent = assertInsideRoots(lib, parentRel)
  const absPath = path.join(absParent, name)
  createDir(absPath)
  return toRel(lib, absPath)
}

// ── rename ───────────────────────────────────────────────────

export function renameNode(lib: string, rel: string, newName: string): string {
  const absOld = assertInsideRoots(lib, rel)
  if (!fs.existsSync(absOld)) {
    throw code('WRITING_NOT_FOUND', `Node not found: ${rel}`)
  }

  // Reject traversal in the new name (path.join would normalize `..` away)
  if (newName.includes('..')) {
    throw code('WRITING_PATH_FORBIDDEN', `Invalid name: ${newName}`)
  }

  const absNew = path.join(path.dirname(absOld), newName)
  assertInsideRoots(lib, toRel(lib, absNew))

  if (fs.existsSync(absNew)) {
    throw code('WRITING_NAME_CONFLICT', `Target already exists: ${toRel(lib, absNew)}`)
  }

  fs.renameSync(absOld, absNew)
  moveBackup(lib, rel, toRel(lib, absNew))
  return toRel(lib, absNew)
}

// ── move ─────────────────────────────────────────────────────

export function moveNode(lib: string, rel: string, targetDir: string): string {
  const absSrc = assertInsideRoots(lib, rel)
  if (!fs.existsSync(absSrc)) {
    throw code('WRITING_NOT_FOUND', `Node not found: ${rel}`)
  }

  const absTargetDir = assertInsideRoots(lib, targetDir)
  if (!fs.existsSync(absTargetDir)) {
    createDir(absTargetDir)
  }

  // Prevent moving into itself
  const srcDir = path.dirname(absSrc)
  if (path.resolve(srcDir) === path.resolve(absTargetDir)) {
    throw code('WRITING_PATH_FORBIDDEN', `Cannot move into same directory: ${targetDir}`)
  }

  const name = path.basename(absSrc)
  const safeName = uniqueName(absTargetDir, name)
  const absDest = path.join(absTargetDir, safeName)

  fs.renameSync(absSrc, absDest)
  moveBackup(lib, rel, toRel(lib, absDest))
  return toRel(lib, absDest)
}

// ── delete ───────────────────────────────────────────────────
// 删除 = 真删（2026-08-09 用户决策：UI 已有确认对话框，不要回收站设计）。
// 解散分组例外：先把组内文章释放到父级，只删空壳目录。

export function deleteNode(lib: string, rel: string): void {
  const absPath = assertInsideRoots(lib, rel)
  if (!fs.existsSync(absPath)) {
    throw code('WRITING_NOT_FOUND', `Node not found: ${rel}`)
  }
  fs.rmSync(absPath, { recursive: true, force: true })
  deleteBackup(lib, rel)
}

export function dissolveGroup(lib: string, rel: string): { moved: { from: string; to: string }[] } {
  const abs = assertInsideRoots(lib, rel)
  if (!fs.existsSync(abs) || !fs.statSync(abs).isDirectory()) {
    throw code('WRITING_NOT_FOUND', `Group not found: ${rel}`)
  }
  const parentRel = path.dirname(rel).replace(/\\/g, '/')
  const moved: { from: string; to: string }[] = []
  for (const child of fs.readdirSync(abs)) {
    // 只跳过目录型隐藏项；.assistant.md / .annotations.md / .guide.md 伴生文件
    // 随文章一起 moveNode 到父级，否则助手会话历史会随空壳一起被删。
    if (child === '.trash' || child === '.assets') continue
    const from = `${rel}/${child}`
    moved.push({ from, to: moveNode(lib, from, parentRel) })
  }
  fs.rmSync(abs, { recursive: true, force: true })
  deleteBackup(lib, rel)
  return { moved }
}

// ── read / write ─────────────────────────────────────────────

export function readWritingFile(
  lib: string,
  rel: string
): { frontmatter: Record<string, unknown>; body: string } {
  const absPath = assertInsideRoots(lib, rel)
  const raw = fs.readFileSync(absPath, 'utf-8')
  const parsed = matter(raw)
  return { frontmatter: parsed.data as Record<string, unknown>, body: parsed.content }
}

export function writeWritingFile(lib: string, rel: string, body: string): void {
  const absPath = assertInsideRoots(lib, rel)
  // Read existing frontmatter, preserving whatever is already there
  let existingFm: Record<string, unknown> = {}
  let existingRaw: string | null = null
  if (fs.existsSync(absPath)) {
    existingRaw = fs.readFileSync(absPath, 'utf-8')
    existingFm = (matter(existingRaw).data as Record<string, unknown>) ?? {}
  }

  maybeBackupDaily(lib, rel, existingRaw)

  const mergedFm = {
    ...existingFm,
    updated: new Date().toISOString().slice(0, 10),
  }

  const content = matter.stringify(body.replace(/^\n/, ''), mergedFm)
  fs.writeFileSync(absPath, content, 'utf-8')
}

/**
 * HTML 原文写回（删除模式专用）：不经 gray-matter/frontmatter 合并，逐字节写回。
 * 写前按天备份（复用 maybeBackupDaily；repository 根天然无备份）。仅接受 .html。
 */
export function writeHtmlFile(lib: string, rel: string, html: string): void {
  const absPath = assertInsideRoots(lib, rel)
  if (path.extname(absPath).toLowerCase() !== '.html') {
    throw Object.assign(new Error(`仅支持写回 .html 文件: ${rel}`), { code: 'WRITING_PATH_FORBIDDEN' })
  }
  const existingRaw = fs.existsSync(absPath) ? fs.readFileSync(absPath, 'utf-8') : null
  maybeBackupDaily(lib, rel, existingRaw)
  fs.writeFileSync(absPath, html, 'utf-8')
}

// ── daily backup ─────────────────────────────────────────────

const BACKUP_DIR = '.backups'

/**
 * 节点（文件或目录）在 writing/.backups 下的镜像绝对路径。
 * 仅 writing 根下的节点有备份；.backups 自身及其他根返回 null。
 */
function backupAbsFor(lib: string, rel: string): string | null {
  const norm = rel.replace(/\\/g, '/')
  const prefix = 'writing/'
  if (!norm.startsWith(prefix)) return null
  const sub = norm.slice(prefix.length)
  if (!sub || sub === BACKUP_DIR || sub.startsWith(BACKUP_DIR + '/')) return null
  return path.join(lib, 'writing', BACKUP_DIR, ...sub.split('/'))
}

function isToday(d: Date): boolean {
  const now = new Date()
  return d.getFullYear() === now.getFullYear()
    && d.getMonth() === now.getMonth()
    && d.getDate() === now.getDate()
}

/**
 * 按天备份：写入新内容前调用。今天第一次修改时把磁盘旧文件原样拷到镜像
 * 备份路径；同天后续保存跳过。备份失败只记日志，不阻断保存。
 */
function maybeBackupDaily(lib: string, rel: string, existingRaw: string | null): void {
  try {
    if (existingRaw === null) return                    // 新建而非修改
    const backupAbs = backupAbsFor(lib, rel)
    if (!backupAbs) return                              // 非 writing 根
    if (!matter(existingRaw).content.trim()) return     // 空壳首次编辑不备份
    if (fs.existsSync(backupAbs) && isToday(fs.statSync(backupAbs).mtime)) return
    fs.mkdirSync(path.dirname(backupAbs), { recursive: true })
    fs.writeFileSync(backupAbs, existingRaw, 'utf-8')
  } catch (e) {
    console.warn('[writing-backup] backup failed:', rel, e)
  }
}

/** 备份跟随重命名/移动；目标在 writing 根外（如 repository）时删除备份。 */
function moveBackup(lib: string, oldRel: string, newRel: string): void {
  try {
    const oldBackup = backupAbsFor(lib, oldRel)
    if (!oldBackup || !fs.existsSync(oldBackup)) return
    const newBackup = backupAbsFor(lib, newRel)
    if (!newBackup) {
      fs.rmSync(oldBackup, { recursive: true, force: true })
      return
    }
    fs.mkdirSync(path.dirname(newBackup), { recursive: true })
    fs.rmSync(newBackup, { recursive: true, force: true })
    fs.renameSync(oldBackup, newBackup)
  } catch (e) {
    console.warn('[writing-backup] follow-move failed:', oldRel, '->', newRel, e)
  }
}

/** 备份跟随删除（文件或目录；不存在时 rmSync force 静默通过）。 */
function deleteBackup(lib: string, rel: string): void {
  try {
    const backupAbs = backupAbsFor(lib, rel)
    if (backupAbs) fs.rmSync(backupAbs, { recursive: true, force: true })
  } catch (e) {
    console.warn('[writing-backup] follow-delete failed:', rel, e)
  }
}
