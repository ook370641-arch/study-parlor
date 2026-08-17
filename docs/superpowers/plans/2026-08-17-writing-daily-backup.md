# 写作按天备份 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `writing/` 根下为每篇文章维护恒 ≤1 份的"今天之前"按天备份（`writing/.backups/` 镜像），备份随文章重命名/移动/删除跟随。

**Architecture:** 全部逻辑闭环在主进程 `electron/lib/writing-tree.ts`：保存时（`writeWritingFile`）按天判断并拷贝旧文件到镜像备份路径；`renameNode`/`moveNode`/`deleteNode`/`dissolveGroup` 同步对备份做镜像操作。渲染进程零改动。

**Tech Stack:** Electron 主进程 Node fs、gray-matter、Vitest。

**Spec:** `docs/superpowers/specs/2026-08-17-writing-daily-backup-design.md`

## Global Constraints

- 时间戳逻辑**不动**：`created` 不可变、`updated` 每次保存刷新 `YYYY-MM-DD`（现状已满足）。
- 只备份 `writing/` 根；`repository/` 不备份。
- 备份失败只 `console.warn`，**绝不阻断**保存/重命名/移动/删除主路径。
- 每篇文章备份恒 ≤1（同路径覆盖写）。
- 备份判定用备份文件 mtime 的**本地日期**与今天比较。
- 验证只跑定向测试（`npx vitest run tests/writing-backup.test.ts tests/writing-tree.test.ts tests/writing-created.test.ts`），禁止全量。
- 提交信息遵循仓库现有中文 conventional 风格（如 `feat(writing): ...`）。

---

### Task 1: 按天备份写入 + `.backups` 隐藏

**Files:**
- Modify: `electron/lib/writing-tree.ts`
- Test: `tests/writing-backup.test.ts`（新建）

**Interfaces:**
- Consumes: 现有 `writeWritingFile(lib, rel, body)`、`scanRoot(lib, root)`、`createFile(lib, root, dir, name)`。
- Produces（Task 2 复用）:
  - `backupAbsFor(lib: string, rel: string): string | null` — 节点的镜像备份绝对路径；非 `writing/` 根或 `.backups` 自身返回 `null`。
  - `moveBackup(lib: string, oldRel: string, newRel: string): void`
  - `deleteBackup(lib: string, rel: string): void`
  （后两个在 Task 2 才实现，此处仅为接口预告；Task 1 只实现 `backupAbsFor` 与 `maybeBackupDaily`。）

- [ ] **Step 1: 写失败测试**

新建 `tests/writing-backup.test.ts`：

```ts
// tests/writing-backup.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import matter from 'gray-matter'
import { scanRoot, createFile, writeWritingFile } from '../electron/lib/writing-tree'

let lib: string
beforeEach(() => { lib = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-backup-')) })
afterEach(() => { fs.rmSync(lib, { recursive: true, force: true }) })

function writeArticle(rel: string, body: string): void {
  const abs = path.join(lib, rel)
  fs.mkdirSync(path.dirname(abs), { recursive: true })
  fs.writeFileSync(abs, body, 'utf-8')
}

/** writing/组A/a.md → <lib>/writing/.backups/组A/a.md */
function backupOf(rel: string): string {
  return path.join(lib, 'writing', '.backups', rel.slice('writing/'.length))
}

function readBackup(rel: string): string {
  return fs.readFileSync(backupOf(rel), 'utf-8')
}

describe('writing 按天备份：写入时机', () => {
  it('今天第一次保存产生备份，内容 = 修改前的旧文件', () => {
    writeArticle('writing/a.md', '旧内容')
    writeWritingFile(lib, 'writing/a.md', '新内容')
    expect(fs.existsSync(backupOf('writing/a.md'))).toBe(true)
    expect(readBackup('writing/a.md')).toContain('旧内容')
    const current = fs.readFileSync(path.join(lib, 'writing/a.md'), 'utf-8')
    expect(matter(current).content).toContain('新内容')
  })

  it('嵌套分组的文章备份到镜像子目录', () => {
    writeArticle('writing/组A/a.md', '旧内容')
    writeWritingFile(lib, 'writing/组A/a.md', '新内容')
    expect(fs.existsSync(path.join(lib, 'writing/.backups/组A/a.md'))).toBe(true)
  })

  it('同天第二次保存不覆盖备份', () => {
    writeArticle('writing/a.md', '版本1')
    writeWritingFile(lib, 'writing/a.md', '版本2')
    writeWritingFile(lib, 'writing/a.md', '版本3')
    expect(readBackup('writing/a.md')).toContain('版本1')
  })

  it('备份 mtime 是昨天时再保存 → 备份更新为最新的修改前版本', () => {
    writeArticle('writing/a.md', '版本1')
    writeWritingFile(lib, 'writing/a.md', '版本2')
    const yesterday = new Date(Date.now() - 24 * 3600 * 1000)
    fs.utimesSync(backupOf('writing/a.md'), yesterday, yesterday)
    writeWritingFile(lib, 'writing/a.md', '版本3')
    expect(readBackup('writing/a.md')).toContain('版本2')
  })

  it('repository/ 根下的文章不产生备份', () => {
    writeArticle('repository/a.md', '旧内容')
    writeWritingFile(lib, 'repository/a.md', '新内容')
    expect(fs.existsSync(path.join(lib, 'writing/.backups'))).toBe(false)
    expect(fs.existsSync(path.join(lib, 'repository/.backups'))).toBe(false)
  })

  it('新建空壳首次编辑不备份，有内容后的下一次修改才备份', () => {
    const rel = createFile(lib, 'writing', '', '新文章')
    writeWritingFile(lib, rel, '正文 v1')
    expect(fs.existsSync(backupOf(rel))).toBe(false)
    writeWritingFile(lib, rel, '正文 v2')
    expect(fs.existsSync(backupOf(rel))).toBe(true)
    expect(readBackup(rel)).toContain('正文 v1')
  })

  it('scanRoot 不显示 .backups 目录', () => {
    fs.mkdirSync(path.join(lib, 'writing/.backups'), { recursive: true })
    fs.writeFileSync(path.join(lib, 'writing/.backups/a.md'), 'x', 'utf-8')
    fs.writeFileSync(path.join(lib, 'writing/a.md'), '# a', 'utf-8')
    const tree = scanRoot(lib, 'writing')
    expect(tree.map(n => n.name)).toEqual(['a.md'])
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/writing-backup.test.ts`
Expected: FAIL（备份文件不存在 / `.backups` 出现在树里）

- [ ] **Step 3: 实现**

`electron/lib/writing-tree.ts` 两处修改。

(a) `HIDDEN_FILE_PATTERNS` 数组末尾（`/^~\$/` 之后）加一条：

```ts
  // 按天备份目录（2026-08-17 设计：writing/.backups 镜像备份，不进目录树）
  /^\.backups$/,
```

(b) 文件末尾追加备份section，并改 `writeWritingFile`：

```ts
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
```

`writeWritingFile` 改为复用单次读取，并在写前调 `maybeBackupDaily`：

```ts
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
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run tests/writing-backup.test.ts`
Expected: PASS（7 条）

同时确认既有测试不回归：
Run: `npx vitest run tests/writing-tree.test.ts tests/writing-created.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add electron/lib/writing-tree.ts tests/writing-backup.test.ts
git commit -m "feat(writing): 按天备份写入——今天首次修改前旧文件拷入 writing/.backups 镜像路径"
```

---

### Task 2: 备份生命周期跟随（rename / move / delete / dissolveGroup）

**Files:**
- Modify: `electron/lib/writing-tree.ts`
- Test: `tests/writing-backup.test.ts`（追加 describe）

**Interfaces:**
- Consumes: Task 1 的 `backupAbsFor`。
- Produces: `moveBackup(lib, oldRel, newRel)`、`deleteBackup(lib, rel)`（模块内私有，供四个导出函数调用）。

- [ ] **Step 1: 写失败测试**

`tests/writing-backup.test.ts` 追加（顶部 import 增加 `renameNode, moveNode, deleteNode, dissolveGroup`）：

```ts
describe('writing 按天备份：生命周期跟随', () => {
  it('重命名文章 → 备份跟随到新名字', () => {
    writeArticle('writing/a.md', '旧内容')
    writeWritingFile(lib, 'writing/a.md', '新内容')
    const newRel = renameNode(lib, 'writing/a.md', 'b.md')
    expect(fs.existsSync(backupOf('writing/a.md'))).toBe(false)
    expect(fs.existsSync(backupOf(newRel))).toBe(true)
  })

  it('writing 根内移动 → 备份跟随到镜像新路径', () => {
    writeArticle('writing/a.md', '旧内容')
    writeWritingFile(lib, 'writing/a.md', '新内容')
    moveNode(lib, 'writing/a.md', 'writing/组A')
    expect(fs.existsSync(backupOf('writing/a.md'))).toBe(false)
    expect(fs.existsSync(path.join(lib, 'writing/.backups/组A/a.md'))).toBe(true)
  })

  it('移动到 repository/ → 备份删除', () => {
    writeArticle('writing/a.md', '旧内容')
    writeWritingFile(lib, 'writing/a.md', '新内容')
    moveNode(lib, 'writing/a.md', 'repository')
    expect(fs.existsSync(backupOf('writing/a.md'))).toBe(false)
    expect(fs.existsSync(path.join(lib, 'repository/.backups'))).toBe(false)
  })

  it('删除文章 → 备份一并删除', () => {
    writeArticle('writing/a.md', '旧内容')
    writeWritingFile(lib, 'writing/a.md', '新内容')
    deleteNode(lib, 'writing/a.md')
    expect(fs.existsSync(backupOf('writing/a.md'))).toBe(false)
  })

  it('重命名分组 → 镜像备份目录整体跟随', () => {
    writeArticle('writing/组A/a.md', '旧内容')
    writeWritingFile(lib, 'writing/组A/a.md', '新内容')
    renameNode(lib, 'writing/组A', '组B')
    expect(fs.existsSync(path.join(lib, 'writing/.backups/组B/a.md'))).toBe(true)
    expect(fs.existsSync(path.join(lib, 'writing/.backups/组A'))).toBe(false)
  })

  it('解散分组 → 文章备份随文章释放到父级，镜像空目录清理', () => {
    writeArticle('writing/组A/a.md', '旧内容')
    writeWritingFile(lib, 'writing/组A/a.md', '新内容')
    dissolveGroup(lib, 'writing/组A')
    expect(fs.existsSync(backupOf('writing/a.md'))).toBe(true)
    expect(fs.existsSync(path.join(lib, 'writing/.backups/组A'))).toBe(false)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/writing-backup.test.ts`
Expected: 新 6 条 FAIL（备份留在原路径/未被删除）

- [ ] **Step 3: 实现**

`electron/lib/writing-tree.ts` 的 daily backup section 追加两个 helper：

```ts
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
```

四处调用点（均在主操作**之后**、`return` 之前插入；失败不阻断主路径）：

`renameNode` —— `fs.renameSync(absOld, absNew)` 之后：

```ts
  fs.renameSync(absOld, absNew)
  moveBackup(lib, rel, toRel(lib, absNew))
  return toRel(lib, absNew)
```

`moveNode` —— `fs.renameSync(absSrc, absDest)` 之后：

```ts
  fs.renameSync(absSrc, absDest)
  moveBackup(lib, rel, toRel(lib, absDest))
  return toRel(lib, absDest)
```

`deleteNode` —— `fs.rmSync(...)` 之后：

```ts
  fs.rmSync(absPath, { recursive: true, force: true })
  deleteBackup(lib, rel)
```

`dissolveGroup` —— 末尾 `fs.rmSync(abs, ...)` 之后（子文件备份已被各 `moveNode` 带走，这里清镜像空壳）：

```ts
  fs.rmSync(abs, { recursive: true, force: true })
  deleteBackup(lib, rel)
  return { moved }
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run tests/writing-backup.test.ts`
Expected: PASS（13 条）

同时确认既有测试不回归：
Run: `npx vitest run tests/writing-tree.test.ts tests/writing-created.test.ts tests/writing-delete.test.ts tests/writing-ipc.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add electron/lib/writing-tree.ts tests/writing-backup.test.ts
git commit -m "feat(writing): 备份生命周期跟随——重命名/移动/删除/解散分组同步镜像操作"
```

---

## Self-Review 记录

- Spec 覆盖：spec ①（位置/隐藏/≤1）→ Task 1 Step 3a + maybeBackupDaily；②（写入时机四条件）→ Task 1 Step 3b；③（跟随含目录节点）→ Task 2；④（错误处理）→ 两个 helper 的 try/catch；⑤（测试 13 条 = spec 9 条拆分）→ 两个 Task 的测试代码。
- 无占位符；接口名 `backupAbsFor` / `maybeBackupDaily` / `moveBackup` / `deleteBackup` 全文一致。
- E2E：无新 spec，`e2e/source-map.json` 无需更新；改动仅主进程 lib，无 IPC/类型变更，定向 E2E 匹配不到受影响 group，跑单测即可（规则 §9 只跑受影响测试）。
