# 写作功能 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在夜航简报页新增置顶「写作」来源：Typora 式 WYSIWYG md 写作板 + writing/repository 目录树写作库 + 带渐进披露工具循环的 AI 写作助手。

**Architecture:** 渲染端 React（Milkdown 编辑器、停靠式助手面板）↔ preload facade ↔ 主进程（`electron/lib/writing-*` 目录树/catalog/工具循环，`electron/ipc/writing*.ts`）。LLM 走现有 `chatStream`，工具协议为 ` ```tool ` JSON 块（主进程拦截执行回注），单轮 6 次封顶。

**Tech Stack:** Electron 30 + React 18 + TypeScript + Zustand + Milkdown v7 + Vitest + Playwright。

**Spec:** `docs/superpowers/specs/2026-07-19-writing-feature-design.md`（本计划每一节都应对应 spec 条目）

---

## 命名约定（全计划一致，后续任务直接引用）

- 类型：`WritingRoot = 'writing' | 'repository'`；`WritingSourceType = 'study' | 'blog' | 'digest' | 'job' | 'repository' | 'writing' | 'web'`
- IPC：`writing:scanTree | createFile | createFolder | rename | move | delete | read | write | importFiles`；`writingAssistant:sendMessage | abort`；事件 `writingAssistant:tool`、`writingAssistant:reasoningChunk`
- 主进程模块：`electron/lib/writing-tree.ts`、`electron/lib/writing-catalog.ts`、`electron/lib/writing-assistant/{tool-protocol,prompt,tools,loop}.ts`
- 渲染组件：`src/components/writing/*`、`src/components/writing-assistant/*`
- 结果类型：`WritingResult<T> = { ok: true; value: T } | { ok: false; code: WritingErrorCode; message: string }`
- 条目 id：`类型前缀:相对路径`，如 `writing:随笔/七月夜话.md`、`study:分布式系统/s2/学习报告.md`
- store 会话 id 前缀：`writing-assistant-${Date.now()}`

---

### Task 0: 双 spike（决策门，先于一切实现）

**Files:**
- Create: `scripts/spike-milkdown-roundtrip.mjs`
- Create: `scripts/spike-tools-probe.mjs`

- [ ] **Step 1: 安装 Milkdown 依赖**

```bash
npm i @milkdown/core@^7 @milkdown/ctx@^7 @milkdown/react@^7 @milkdown/preset-commonmark@^7 @milkdown/preset-gfm@^7 @milkdown/plugin-listener@^7 @milkdown/plugin-history@^7 @milkdown/plugin-clipboard@^7 @milkdown/utils@^7
```

- [ ] **Step 2: Milkdown round-trip spike**

`scripts/spike-milkdown-roundtrip.mjs`（用 vitest 环境跑更稳，见 Step 3；此脚本仅快速冒烟）：
验证三件事并**把结论写进本任务 commit message**：
1. `toggleStrongCommand / toggleEmphasisCommand / toggleStrikethroughCommand / wrapInBlockquoteCommand / wrapInBulletListCommand / wrapInOrderedListCommand / insertHrCommand / insertTableCommand` 的确切导出名与所属包（v7 文档核对，名字以实际安装版本为准，记入 Task 8 使用）。
2. md → editor → `getMarkdown()` 的**语义保持 + 二次序列化幂等**（不是字节级——字节级由"未改动不写盘"保证，见 Task 7）。
3. 表格、嵌套列表、代码块、引用四种 fixture 不丢内容。

- [ ] **Step 3: 决策门 A**

若任一语义丢失（如表格退化为文本）→ 回退「编辑/预览切换」方案（textarea + `MarkdownContent` 渲染），Task 7/8 用回退实现，其余任务不变。结论写入 commit。

- [ ] **Step 4: 端点 tools 参数探测 spike**

`scripts/spike-tools-probe.mjs`：读 `.env`，POST `${KIMI_BASE_URL}/chat/completions`，body 含 `tools: [{type:'function',function:{name:'list_files',description:'列出文件',parameters:{type:'object',properties:{dir:{type:'string'}}}}}]`，headers 必须含 `User-Agent: claude-code/0.1.0`。打印 HTTP 状态与前 600 字符。只记录结论；**默认路径仍是 prompt 协议（Task 10）**，原生支持仅作后续增强，不阻塞。

```bash
node scripts/spike-tools-probe.mjs
```

- [ ] **Step 5: Commit**

```bash
git add scripts/spike-*.mjs package.json package-lock.json
git commit -m "chore(spike): milkdown round-trip + 端点 tools 参数探测（结论：…）"
```

---

### Task 1: 类型、错误码、state 字段（四层同步的地基）

**Files:**
- Modify: `src/types/index.ts`
- Modify: `electron/lib/state.ts`（DEFAULT 对象）
- Modify: `src/store/index.ts`（init 默认值）
- Test: `tests/writing-types.test.ts`

- [ ] **Step 1: 写失败测试**

`tests/writing-types.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import type { WritingTreeNode, WritingResult, WritingErrorCode, WritingSourceType } from '../src/types'

describe('writing types', () => {
  it('WritingTreeNode 结构可用', () => {
    const node: WritingTreeNode = { name: 'a.md', path: 'writing/a.md', kind: 'file' }
    expect(node.kind).toBe('file')
  })
  it('WritingResult 可判别', () => {
    const r: WritingResult<number> = { ok: false, code: 'WRITING_NOT_FOUND', message: 'x' }
    expect(r.ok).toBe(false)
  })
  it('来源类型全集', () => {
    const t: WritingSourceType[] = ['study', 'blog', 'digest', 'job', 'repository', 'writing', 'web']
    expect(t).toHaveLength(7)
  })
  it('错误码全集', () => {
    const c: WritingErrorCode[] = ['WRITING_IO_ERROR', 'WRITING_PATH_FORBIDDEN', 'WRITING_NOT_FOUND', 'WRITING_NAME_CONFLICT']
    expect(c).toHaveLength(4)
  })
})
```

- [ ] **Step 2: 跑测试确认失败** — `npx vitest run tests/writing-types.test.ts`，预期类型不存在报错。

- [ ] **Step 3: `src/types/index.ts` 新增类型**

```ts
// DocType 联合类型追加 'writing'
export type WritingRoot = 'writing' | 'repository'
export type WritingErrorCode = 'WRITING_IO_ERROR' | 'WRITING_PATH_FORBIDDEN' | 'WRITING_NOT_FOUND' | 'WRITING_NAME_CONFLICT'
export type WritingResult<T> = { ok: true; value: T } | { ok: false; code: WritingErrorCode; message: string }
export type WritingTreeNode = {
  name: string            // 文件/目录名
  path: string            // 相对学习库根，如 writing/随笔/a.md
  kind: 'dir' | 'file'
  children?: WritingTreeNode[]
}
export type WritingTone = 'parchment' | 'plain' | 'ink'
export type WritingSourceType = 'study' | 'blog' | 'digest' | 'job' | 'repository' | 'writing' | 'web'
export type WritingSource = { type: WritingSourceType; id: string; label: string }
export type WritingAssistantMessage = {
  role: 'user' | 'assistant'
  content: string
  reasoning?: string
  sources?: WritingSource[]
}
export type WritingToolEvent = {
  sessionId: string
  phase: 'start' | 'done' | 'error'
  tool: 'read_local' | 'web_search' | 'insert_into_article'
  ids?: string[]
  query?: string
  markdown?: string
  error?: string
}
export type WritingCatalogEntry = { title: string; summary: string; updatedAt: string }
export type WritingCatalog = { version: 1; entries: Record<string, WritingCatalogEntry> }
```

`StateJson` 增加（含在 `DEFAULT_STATE` 中同步）：

```ts
writingFontSize: BriefingFontSize      // 默认 'base'
writingTone: WritingTone               // 默认 'parchment'
writingListTab: 'articles' | 'repository' // 默认 'articles'
writingAssistantWidth: number          // 默认 320
writingAssistantOpen: boolean          // 默认 false
lastWritingFile: string | null         // 默认 null
assistantSearchEnabled: boolean        // 默认 false（与 annotation spec 共享）
assistantThinkingEffort: 'off' | 'high' | 'max' // 默认 'off'
```

`IpcApi` 增加：

```ts
writingScanTree: () => Promise<WritingResult<{ writing: WritingTreeNode[]; repository: WritingTreeNode[] }>>
writingCreateFile: (a: { root: WritingRoot; dir: string; name: string }) => Promise<WritingResult<{ path: string }>>
writingCreateFolder: (a: { root: WritingRoot; dir: string; name: string }) => Promise<WritingResult<{ path: string }>>
writingRename: (a: { path: string; newName: string }) => Promise<WritingResult<{ path: string }>>
writingMove: (a: { path: string; targetDir: string }) => Promise<WritingResult<{ path: string }>>
writingDelete: (a: { path: string }) => Promise<WritingResult<null>>
writingRead: (a: { path: string }) => Promise<WritingResult<{ frontmatter: Record<string, unknown>; body: string }>>
writingWrite: (a: { path: string; body: string }) => Promise<WritingResult<null>>
writingImportFiles: (a: { targetDir: string }) => Promise<WritingResult<{ imported: string[] }>>
writingAssistantSendMessage: (a: {
  sessionId: string
  articlePath: string | null
  articleContent: string
  messages: WritingAssistantMessage[]
  useSearch: boolean
  thinkingEffort: 'off' | 'high' | 'max'
}) => Promise<void>
writingAssistantAbort: (a: { sessionId: string }) => Promise<void>
onWritingAssistantTool: (cb: (e: WritingToolEvent) => void) => () => void
onWritingAssistantReasoningChunk: (cb: (sessionId: string, text: string) => void) => () => void
```

- [ ] **Step 4: `electron/lib/state.ts` DEFAULT 同步 8 个字段；`src/store/index.ts` init 同步默认值**（ipc-state §3）。

- [ ] **Step 5: 跑测试确认通过 → Commit**

```bash
npx vitest run tests/writing-types.test.ts
git add src/types/index.ts electron/lib/state.ts src/store/index.ts tests/writing-types.test.ts
git commit -m "feat(writing): 类型、错误码、state.json 字段（四层同步地基）"
```

---

### Task 2: 目录树核心库 `electron/lib/writing-tree.ts`

**Files:**
- Create: `electron/lib/writing-tree.ts`
- Test: `tests/writing-tree.test.ts`

- [ ] **Step 1: 写失败测试**（用 `fs.mkdtempSync` 建临时学习库）

`tests/writing-tree.test.ts` 覆盖：扫描嵌套树并排序；隐藏 `.assistant.md`/`.annotations.md`/`.guide.md`/`.catalog.json`/`.assets/`；越界拒绝（`../` 与绝对路径）；createFile 重名加 `-HHMM`；move 嵌套；delete 目录递归；read 返回 frontmatter+body；write 更新 `updated` 字段。核心用例：

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { scanRoot, createFile, moveNode, readWritingFile, writeWritingFile, WRITING_ROOTS } from '../electron/lib/writing-tree'

let lib: string
beforeEach(() => { lib = fs.mkdtempSync(path.join(os.tmpdir(), 'wlib-')) })
afterEach(() => { fs.rmSync(lib, { recursive: true, force: true }) })

it('扫描嵌套树，隐藏伴生文件', () => {
  fs.mkdirSync(path.join(lib, 'writing/随笔'), { recursive: true })
  fs.writeFileSync(path.join(lib, 'writing/随笔/a.md'), '# a')
  fs.writeFileSync(path.join(lib, 'writing/随笔/a.assistant.md'), 'x')
  fs.writeFileSync(path.join(lib, 'writing/.catalog.json'), '{}')
  const tree = scanRoot(lib, 'writing')
  expect(tree).toHaveLength(1)
  expect(tree[0].children!.map(c => c.name)).toEqual(['a.md'])
})

it('越界拒绝', () => {
  expect(() => createFile(lib, 'writing', '../../etc', 'x.md')).toThrowError(/WRITING_PATH_FORBIDDEN/)
})

it('重名自动加 -HHMM 后缀', () => {
  fs.mkdirSync(path.join(lib, 'writing'), { recursive: true })
  fs.writeFileSync(path.join(lib, 'writing/a.md'), '1')
  const p = createFile(lib, 'writing', '', 'a.md')
  expect(p).toMatch(/a-\d{4}\.md$/)
})

it('write 合并 frontmatter 并更新 updated', () => {
  fs.mkdirSync(path.join(lib, 'writing'), { recursive: true })
  const p = createFile(lib, 'writing', '', 'b.md')
  writeWritingFile(lib, p, '# 正文\n')
  const { frontmatter, body } = readWritingFile(lib, p)
  expect(frontmatter.type).toBe('writing')
  expect(body).toBe('# 正文\n')
})
```

- [ ] **Step 2: 跑测试确认失败** — `npx vitest run tests/writing-tree.test.ts`。

- [ ] **Step 3: 实现 `electron/lib/writing-tree.ts`**

```ts
import fs from 'node:fs'
import path from 'node:path'
import matter from 'gray-matter'
import type { WritingRoot, WritingTreeNode } from '../../src/types'

export const WRITING_ROOTS: WritingRoot[] = ['writing', 'repository']
const HIDDEN = [/\.assistant\.md$/, /\.annotations\.md$/, /\.guide\.md$/, /^\.catalog\.json$/, /^\.assets$/]

export function assertInsideRoots(lib: string, rel: string): string {
  const abs = path.resolve(lib, rel)
  const ok = WRITING_ROOTS.some(r => abs === path.join(lib, r) || abs.startsWith(path.join(lib, r) + path.sep))
  if (!ok || rel.includes('..')) {
    const e = new Error(`WRITING_PATH_FORBIDDEN: ${rel}`)
    ;(e as Error & { code?: string }).code = 'WRITING_PATH_FORBIDDEN'
    throw e
  }
  return abs
}

export function ensureRoots(lib: string): void {
  for (const r of WRITING_ROOTS) fs.mkdirSync(path.join(lib, r), { recursive: true })
}

export function scanRoot(lib: string, root: WritingRoot): WritingTreeNode[] {
  const base = path.join(lib, root)
  if (!fs.existsSync(base)) return []
  const walk = (dir: string, relBase: string): WritingTreeNode[] =>
    fs.readdirSync(dir, { withFileTypes: true })
      .filter(d => !HIDDEN.some(re => re.test(d.name)))
      .map(d => {
        const rel = relBase ? `${relBase}/${d.name}` : `${root}/${d.name}`
        if (d.isDirectory()) return { name: d.name, path: rel, kind: 'dir' as const, children: walk(path.join(dir, d.name), rel) }
        if (!d.name.endsWith('.md')) return null
        return { name: d.name, path: rel, kind: 'file' as const }
      })
      .filter((n): n is WritingTreeNode => n !== null)
      .sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name, 'zh') : a.kind === 'dir' ? -1 : 1))
  return walk(base, '')
}

function uniqueName(absDir: string, name: string): string {
  if (!fs.existsSync(path.join(absDir, name))) return name
  const ext = path.extname(name)
  const stem = path.basename(name, ext)
  const now = new Date()
  const suffix = `${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`
  let candidate = `${stem}-${suffix}${ext}`
  let i = 2
  while (fs.existsSync(path.join(absDir, candidate))) candidate = `${stem}-${suffix}-${i++}${ext}`
  return candidate
}

export function createFile(lib: string, root: WritingRoot, dir: string, name: string): string {
  const absDir = assertInsideRoots(lib, path.join(root, dir))
  fs.mkdirSync(absDir, { recursive: true })
  const finalName = uniqueName(absDir, name.endsWith('.md') ? name : `${name}.md`)
  const rel = path.relative(lib, path.join(absDir, finalName)).split(path.sep).join('/')
  const now = new Date().toISOString().slice(0, 10)
  const title = finalName.replace(/\.md$/, '')
  fs.writeFileSync(path.join(absDir, finalName),
    `---\ntype: writing\ntitle: ${title}\ncreated: ${now}\nupdated: ${now}\n---\n\n`)
  return rel
}

export function createFolder(lib: string, root: WritingRoot, dir: string, name: string): string {
  const absDir = assertInsideRoots(lib, path.join(root, dir))
  const finalName = uniqueName(absDir, name)
  fs.mkdirSync(path.join(absDir, finalName), { recursive: true })
  return path.relative(lib, path.join(absDir, finalName)).split(path.sep).join('/')
}

export function renameNode(lib: string, rel: string, newName: string): string {
  const abs = assertInsideRoots(lib, rel)
  if (!fs.existsSync(abs)) throw code('WRITING_NOT_FOUND', rel)
  const target = path.join(path.dirname(abs), newName)
  if (fs.existsSync(target)) throw code('WRITING_NAME_CONFLICT', newName)
  fs.renameSync(abs, target)
  return path.relative(lib, target).split(path.sep).join('/')
}

export function moveNode(lib: string, rel: string, targetDir: string): string {
  const abs = assertInsideRoots(lib, rel)
  const absTarget = assertInsideRoots(lib, targetDir)
  if (!fs.existsSync(abs)) throw code('WRITING_NOT_FOUND', rel)
  if (absTarget.startsWith(abs + path.sep)) throw code('WRITING_PATH_FORBIDDEN', '不能移入自身')
  const dest = path.join(absTarget, uniqueName(absTarget, path.basename(abs)))
  fs.renameSync(abs, dest)
  return path.relative(lib, dest).split(path.sep).join('/')
}

export function deleteNode(lib: string, rel: string): void {
  const abs = assertInsideRoots(lib, rel)
  if (!fs.existsSync(abs)) throw code('WRITING_NOT_FOUND', rel)
  fs.rmSync(abs, { recursive: true })
}

export function readWritingFile(lib: string, rel: string): { frontmatter: Record<string, unknown>; body: string } {
  const abs = assertInsideRoots(lib, rel)
  if (!fs.existsSync(abs)) throw code('WRITING_NOT_FOUND', rel)
  const parsed = matter(fs.readFileSync(abs, 'utf8'))
  return { frontmatter: parsed.data, body: parsed.content }
}

export function writeWritingFile(lib: string, rel: string, body: string): void {
  const abs = assertInsideRoots(lib, rel)
  if (!fs.existsSync(abs)) throw code('WRITING_NOT_FOUND', rel)
  const parsed = matter(fs.readFileSync(abs, 'utf8'))
  const fm = { ...parsed.data, updated: new Date().toISOString().slice(0, 10) }
  fs.writeFileSync(abs, matter.stringify(body.replace(/^\n/, ''), fm))
}

function code(c: string, msg: string): Error {
  const e = new Error(`${c}: ${msg}`)
  ;(e as Error & { code?: string }).code = c
  return e
}
```

- [ ] **Step 4: 跑测试确认通过 → Commit**

```bash
npx vitest run tests/writing-tree.test.ts
git add electron/lib/writing-tree.ts tests/writing-tree.test.ts
git commit -m "feat(writing): 目录树核心库（扫描/CRUD/越界保护/重名后缀）"
```

---

### Task 3: writing IPC + preload + facade + files:scan 排除

**Files:**
- Create: `electron/ipc/writing.ts`
- Modify: `electron/ipc/index.ts`（registerAllIpc 挂入）
- Modify: `electron/ipc/files.ts`（scan 排除两个根 + 启动 ensureRoots）
- Modify: `electron/preload.ts`
- Modify: `src/lib/ipc.ts`
- Test: `tests/writing-ipc.test.ts`

- [ ] **Step 1: 写失败测试** — `tests/writing-ipc.test.ts`：错误映射（lib 抛 code → `{ ok:false, code }` 结构，不裸抛）；`writing:read` 不存在文件 → `WRITING_NOT_FOUND`。直接调 handler 注册函数 + mock `ipcMain`（参照现有 ipc 测试写法，如 tests/env.test.ts 的模式）：

```ts
import { describe, it, expect } from 'vitest'
import { wrapWriting } from '../electron/ipc/writing'

it('lib 错误码映射为 WritingResult', async () => {
  const r = await wrapWriting(() => { const e = new Error('x'); (e as any).code = 'WRITING_NOT_FOUND'; throw e })
  expect(r).toEqual({ ok: false, code: 'WRITING_NOT_FOUND', message: 'x' })
})
it('未知错误映射为 WRITING_IO_ERROR', async () => {
  const r = await wrapWriting(() => { throw new Error('boom') })
  expect(r.ok).toBe(false)
  expect((r as any).code).toBe('WRITING_IO_ERROR')
})
```

- [ ] **Step 2: 跑测试确认失败。**

- [ ] **Step 3: 实现 `electron/ipc/writing.ts`**

```ts
import { ipcMain, dialog, BrowserWindow } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import type { AppConfig } from '../env'
import type { WritingErrorCode } from '../../src/types'  // 文件顶部统一 import
import * as tree from '../lib/writing-tree'
import { ensureRoots } from '../lib/writing-tree'

export async function wrapWriting<T>(fn: () => T | Promise<T>): Promise<WritingResult<T>> {
  try {
    return { ok: true, value: await fn() }
  } catch (err) {
    const e = err as Error & { code?: string }
    const known: WritingErrorCode[] = ['WRITING_PATH_FORBIDDEN', 'WRITING_NOT_FOUND', 'WRITING_NAME_CONFLICT']
    const code: WritingErrorCode = known.includes(e.code as WritingErrorCode) ? (e.code as WritingErrorCode) : 'WRITING_IO_ERROR'
    return { ok: false, code, message: e.message }
  }
}

export function registerWritingIpc(cfg: AppConfig): void {
  const lib = cfg.libraryPath
  ensureRoots(lib)
  ipcMain.handle('writing:scanTree', () =>
    wrapWriting(() => ({ writing: tree.scanRoot(lib, 'writing'), repository: tree.scanRoot(lib, 'repository') })))
  ipcMain.handle('writing:createFile', (_, a: { root: 'writing' | 'repository'; dir: string; name: string }) =>
    wrapWriting(() => ({ path: tree.createFile(lib, a.root, a.dir, a.name) })))
  ipcMain.handle('writing:createFolder', (_, a: { root: 'writing' | 'repository'; dir: string; name: string }) =>
    wrapWriting(() => ({ path: tree.createFolder(lib, a.root, a.dir, a.name) })))
  ipcMain.handle('writing:rename', (_, a: { path: string; newName: string }) =>
    wrapWriting(() => ({ path: tree.renameNode(lib, a.path, a.newName) })))
  ipcMain.handle('writing:move', (_, a: { path: string; targetDir: string }) =>
    wrapWriting(() => ({ path: tree.moveNode(lib, a.path, a.targetDir) })))
  ipcMain.handle('writing:delete', (_, a: { path: string }) =>
    wrapWriting(() => { tree.deleteNode(lib, a.path); return null }))
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
      const absTarget = tree.assertInsideRoots(lib, a.targetDir)
      const imported: string[] = []
      for (const src of r.filePaths) {
        const rel = tree.createFile(lib, 'repository', path.relative(lib, absTarget), path.basename(src, '.md'))
        fs.copyFileSync(src, path.join(lib, rel))
        imported.push(rel)
      }
      return { imported }
    }))
}
```

注：实现时把 `wrapWriting` 的 code 收窄逻辑写干净（上示为结构示意，实际三行 if 即可）；`createFile` 在 import 场景只用于生成唯一名，复制后需用 `writeWritingFile` 重写内容（或改为 `uniquePathFor` 辅助函数后 `fs.copyFileSync`，二选一，保持测试通过）。

- [ ] **Step 4: files.ts 排除 + preload + facade**

- `electron/ipc/files.ts` 扫描一层子目录处：`if (['writing', 'repository'].includes(dirName)) continue`
- `electron/preload.ts` 追加（模式照 `articleAssistantSendMessage` 一行式）：

```ts
writingScanTree: () => ipcRenderer.invoke('writing:scanTree'),
writingCreateFile: (a) => ipcRenderer.invoke('writing:createFile', a),
// …全部 9 个 invoke + 两个 on：
onWritingAssistantTool: (cb) => {
  const h = (_e, payload) => cb(payload)
  ipcRenderer.on('writingAssistant:tool', h)
  return () => ipcRenderer.off('writingAssistant:tool', h)
},
onWritingAssistantReasoningChunk: (cb) => {
  const h = (_e, sid, text) => cb(sid, text)
  ipcRenderer.on('writingAssistant:reasoningChunk', h)
  return () => ipcRenderer.off('writingAssistant:reasoningChunk', h)
},
```

- `src/lib/ipc.ts` facade 直通（`export const ipc = window.api` 现有模式，若 facade 是类型化转发则逐条加）。

- [ ] **Step 5: 跑测试 + 类型检查 → Commit**

```bash
npx vitest run tests/writing-ipc.test.ts tests/writing-tree.test.ts
npx tsc --noEmit
git add electron/ipc/writing.ts electron/ipc/index.ts electron/ipc/files.ts electron/preload.ts src/lib/ipc.ts tests/writing-ipc.test.ts
git commit -m "feat(writing): 目录树 IPC + preload/facade + files:scan 排除两个根"
```

---

### Task 4: store 切片（写作状态与动作）

**Files:**
- Modify: `src/store/index.ts`
- Test: `tests/writing-store.test.ts`

- [ ] **Step 1: 写失败测试** — store 动作 `loadWritingTree`（mock `window.api.writingScanTree`）、`selectWritingFile`（ok → 写入 `writingFile`，`lastWritingFile` 持久化）、`saveWritingFile`（dirty→saving→saved；失败→error）。示例：

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { useStore } from '../src/store'

beforeEach(() => {
  ;(window as any).api = {
    writingScanTree: async () => ({ ok: true, value: { writing: [{ name: 'a.md', path: 'writing/a.md', kind: 'file' }], repository: [] } }),
    writingRead: async () => ({ ok: true, value: { frontmatter: { title: 'a' }, body: '# a\n' } }),
    writingWrite: async () => ({ ok: true, value: null }),
  }
  useStore.setState({ writingTree: null, writingFile: null })
})

it('loadWritingTree 填充树', async () => {
  await useStore.getState().loadWritingTree()
  expect(useStore.getState().writingTree!.writing).toHaveLength(1)
})

it('selectWritingFile 读取并记录 lastWritingFile', async () => {
  await useStore.getState().selectWritingFile('writing/a.md')
  expect(useStore.getState().writingFile!.body).toBe('# a\n')
  expect(useStore.getState().lastWritingFile).toBe('writing/a.md')
})
```

- [ ] **Step 2: 跑测试确认失败。**

- [ ] **Step 3: 实现 store 字段与动作**

```ts
// 字段
writingTree: { writing: WritingTreeNode[]; repository: WritingTreeNode[] } | null
writingFile: { path: string; body: string; dirty: boolean; saving: 'idle' | 'saving' | 'saved' | 'error' } | null
// 动作（全部在失败时保留旧状态并设置 writingError）
loadWritingTree: async () => { const r = await ipc.writingScanTree(); if (r.ok) set({ writingTree: r.value }) }
selectWritingFile: async (path: string | null) => {
  if (!path) return set({ writingFile: null })
  const cur = get().writingFile
  if (cur?.dirty) await get().saveWritingFile()           // 切换前强制落盘
  const r = await ipc.writingRead({ path })
  if (r.ok) set({ writingFile: { path, body: r.value.body, dirty: false, saving: 'idle' }, lastWritingFile: path })
},
updateWritingBody: (body: string) => set(s => s.writingFile ? { writingFile: { ...s.writingFile, body, dirty: true } } : {}),
saveWritingFile: async () => {
  const f = get().writingFile
  if (!f || !f.dirty) return
  set({ writingFile: { ...f, saving: 'saving' } })
  const r = await ipc.writingWrite({ path: f.path, body: f.body })
  set({ writingFile: { ...get().writingFile!, dirty: !r.ok, saving: r.ok ? 'saved' : 'error' } })
},
setWritingListTab / setWritingFontSize / setWritingTone / setWritingAssistantOpen / setWritingAssistantWidth
// 以上 5 个 setter 同时写 state.json（复用现有 persist 模式，如 briefingSource 的写法）
```

- [ ] **Step 4: 跑测试确认通过 → Commit**

```bash
npx vitest run tests/writing-store.test.ts
git add src/store/index.ts tests/writing-store.test.ts
git commit -m "feat(writing): store 切片（树/当前文件/保存状态/偏好持久化）"
```

---

### Task 5: 来源栏入口 + 列表栏 tabs + Briefing 页接线

**Files:**
- Modify: `src/components/BriefingSourceSidebar.tsx`
- Modify: `src/components/BriefingListColumn.tsx`
- Create: `src/components/writing/WritingListColumn.tsx`
- Modify: `src/pages/Briefing.tsx`
- Modify: `src/types/index.ts`（`BriefingSource` 联合类型加 `'writing'`）

- [ ] **Step 1: `BriefingSource` 加 `'writing'`**；`BriefingSourceSidebar.tsx` 的来源数组**首部**插入 `{ id: 'writing', label: '写作', icon: '✍️' }`（其余三个不动）。

- [ ] **Step 2: `WritingListColumn.tsx`**

```tsx
export function WritingListColumn() {
  const tab = useStore(s => s.writingListTab)
  const setTab = useStore(s => s.setWritingListTab)
  return (
    <div className="flex flex-col h-full">
      <div className="flex border-b border-parchment/15 text-xs">
        {(['articles', 'repository'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 py-2 transition-colors ${tab === t ? 'text-ember border-b-2 border-ember' : 'text-parchment/50'}`}>
            {t === 'articles' ? '文章' : 'repository'}
          </button>
        ))}
      </div>
      {tab === 'articles' ? <WritingTree root="writing" /> : <RepositoryPane />}
    </div>
  )
}
```

`RepositoryPane` = `⬆ 导入文件…` 按钮（调 `writingImportFiles` 后 `loadWritingTree`）+ `<WritingTree root="repository" />`。

- [ ] **Step 3: `BriefingListColumn.tsx`**：`briefingSource === 'writing'` 时渲染 `<WritingListColumn />`，宽度沿用 w-64。

- [ ] **Step 4: `Briefing.tsx`**：`briefingSource === 'writing'` 时主区渲染 `<WritingBoard />`（Task 7 创建，先建空壳返回 null 之外的占位），右侧渲染 `<WritingAssistantPanel />`（Task 12，先占位）。**保持全局 chrome 与内容解耦**（ui-styling 规则：背景/头部照旧渲染）。

- [ ] **Step 5: 手动验证 + Commit**

```bash
npm run dev   # 来源栏出现 ✍️写作 置顶；切换 tab；其余三源无回归
git add src/components/BriefingSourceSidebar.tsx src/components/BriefingListColumn.tsx src/components/writing/WritingListColumn.tsx src/pages/Briefing.tsx src/types/index.ts
git commit -m "feat(writing): 来源栏置顶入口 + 列表栏文章/repository tabs"
```

---

### Task 6: 目录树 UI `WritingTree.tsx`

**Files:**
- Create: `src/components/writing/WritingTree.tsx`

- [ ] **Step 1: 实现树组件**（嵌套渲染、折叠、选中高亮、右键菜单、HTML5 拖拽移动）。核心结构：

```tsx
function TreeNode({ node, depth }: { node: WritingTreeNode; depth: number }) {
  const [open, setOpen] = useState(depth === 0)
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const selected = useStore(s => s.writingFile?.path === node.path)
  // 文件：onClick → selectWritingFile(node.path)
  // 目录：onClick → setOpen(!open)；onDrop → moveWritingNode(draggedPath, node.path)
  // onContextMenu → setMenu({x,y})；菜单项：新建文章/新建子分组（目录）/重命名/删除（confirm()）
}
```

拖拽：`onDragStart` 把 `node.path` 写入 `dataTransfer.setData('text/writing-path', ...)`；目录节点 `onDragOver preventDefault` + `onDrop` 调 `ipc.writingMove` 后 `loadWritingTree()`。重命名/新建用 `window.prompt`（MVP，不做内联编辑）；删除用 `window.confirm`。

- [ ] **Step 2: 空态**：树为空时显示「还没有文章，点击上方 ＋ 新建」。

- [ ] **Step 3: 列表栏顶部按钮接线**（WritingListColumn 中）：`＋新建文章` → `writingCreateFile({root:'writing', dir:'', name:'未命名'})` → `loadWritingTree` → `selectWritingFile(新path)`；`新建分组` 同理。

- [ ] **Step 4: 手动验证 + Commit**

```bash
npm run dev   # 新建/重命名/删除/拖拽移动/嵌套折叠全部可用
git add src/components/writing/WritingTree.tsx src/components/writing/WritingListColumn.tsx
git commit -m "feat(writing): 目录树 UI（嵌套/右键菜单/拖拽移动/导入）"
```

---

### Task 7: Milkdown 编辑器 + 自动保存

**Files:**
- Create: `src/components/writing/WritingBoard.tsx`
- Create: `src/components/writing/WritingEditor.tsx`
- Modify: `electron.vite.config.ts`（optimizeDeps.include）
- Test: `tests/writing-roundtrip.test.ts`

- [ ] **Step 1: 写 round-trip 测试**（jsdom 环境，spike 验证过的 API）：

```ts
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { Editor, rootCtx, defaultValueCtx } from '@milkdown/ctx'
import { commonmark } from '@milkdown/preset-commonmark'
import { gfm } from '@milkdown/preset-gfm'
import { listener } from '@milkdown/plugin-listener'
import { getMarkdown } from '@milkdown/utils'

const FIXTURES = [
  '# 标题\n\n正文**加粗**与*斜体*。\n',
  '| a | b |\n|---|---|\n| 1 | 2 |\n',
  '- 一\n  - 二\n    - 三\n',
  '```ts\nconst x = 1\n```\n',
  '> 引用\n> 多行\n',
]

describe('milkdown round-trip', () => {
  for (const [i, md] of FIXTURES.entries()) {
    it(`fixture ${i} 语义保持且二次序列化幂等`, async () => {
      const root = document.createElement('div')
      const editor = await Editor.make()
        .config(ctx => { ctx.set(rootCtx, root); ctx.set(defaultValueCtx, md) })
        .use(commonmark).use(gfm).use(listener).create()
      const once = editor.action(getMarkdown())
      editor.destroy()
      const root2 = document.createElement('div')
      const editor2 = await Editor.make()
        .config(ctx => { ctx.set(rootCtx, root2); ctx.set(defaultValueCtx, once) })
        .use(commonmark).use(gfm).use(listener).create()
      const twice = editor2.action(getMarkdown())
      editor2.destroy()
      expect(twice).toBe(once)          // 幂等
      expect(once.replace(/\s+/g, '')).toContain(md.replace(/\s+/g, '').slice(0, 20)) // 语义保持粗查
    })
  }
})
```

- [ ] **Step 2: 跑测试**（失败则按 Task 0 决策门回退方案重写本任务）。

- [ ] **Step 3: `optimizeDeps.include`**（build-dev §10）：`electron.vite.config.ts` renderer 段把 9 个 `@milkdown/*` 包全部加入。

- [ ] **Step 4: `WritingEditor.tsx`**

```tsx
import { Milkdown, MilkdownProvider, useEditor } from '@milkdown/react'
import { Editor, rootCtx, defaultValueCtx } from '@milkdown/ctx'
import { commonmark } from '@milkdown/preset-commonmark'
import { gfm } from '@milkdown/preset-gfm'
import { listener, listenerCtx } from '@milkdown/plugin-listener'
import { history } from '@milkdown/plugin-history'
import { clipboard } from '@milkdown/plugin-clipboard'

function EditorInner({ initial, onChange }: { initial: string; onChange: (md: string) => void }) {
  const ref = useRef(onChange); ref.current = onChange
  useEditor((root) =>
    Editor.make()
      .config(ctx => {
        ctx.set(rootCtx, root)
        ctx.set(defaultValueCtx, initial)
        ctx.get(listenerCtx).markdownUpdated((_, md) => ref.current(md))
      })
      .use(commonmark).use(gfm).use(listener).use(history).use(clipboard)
  , [initial])   // initial 变化（切换文章）→ 重建 editor
  return <Milkdown />
}
export function WritingEditor(props: { initial: string; onChange: (md: string) => void }) {
  return <MilkdownProvider><EditorInner {...props} /></MilkdownProvider>
}
```

注意（ui-styling §10）：本文件只导出组件；工具函数放别的文件。

- [ ] **Step 5: `WritingBoard.tsx`** — 布局 = `WritingToolbar`（Task 8 占位）+ `WritingEditor` + 保存状态指示；防抖自动保存：

```tsx
const file = useStore(s => s.writingFile)
useEffect(() => {
  if (!file?.dirty) return
  const t = setTimeout(() => useStore.getState().saveWritingFile(), 1500)
  return () => clearTimeout(t)
}, [file?.body])
useEffect(() => {
  const h = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); useStore.getState().saveWritingFile() } }
  window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h)
}, [])
```

状态指示：`{file.saving === 'saving' ? '保存中…' : file.saving === 'saved' ? '已保存 ✓' : file.saving === 'error' ? '保存失败' : ''}`。`file === null` 时渲染空态页（最近文章 = `lastWritingFile` + 新建按钮）。

- [ ] **Step 6: 跑测试 + 手动验证 → Commit**

```bash
npx vitest run tests/writing-roundtrip.test.ts
npm run dev   # 输入→1.5s 后显示已保存；重启文件内容在；Ctrl+S 立即保存
git add src/components/writing/ electron.vite.config.ts tests/writing-roundtrip.test.ts
git commit -m "feat(writing): Milkdown WYSIWYG 编辑器 + 防抖自动保存"
```

---

### Task 8: 工具栏 + 视图级排版

**Files:**
- Create: `src/components/writing/WritingToolbar.tsx`
- Modify: `src/components/writing/WritingBoard.tsx`（挂 CSS 变量）

- [ ] **Step 1: 命令执行通路** — store 增加 `writingEditorAction: ((fn) => void) | null`（WritingEditor 挂载时注册 `editor.action` 绑定版，卸载清 null）。工具栏按钮：

```tsx
const act = useStore(s => s.writingEditorAction)
// 加粗：act?.(callCommand(toggleStrongCommand.key))
// 插入表格：act?.(callCommand(insertTableCommand.key))  ← 名称以 Task 0 spike 结论为准
// 标题：act?.(callCommand(toggleHeadingCommand.key, 2)) 等
```

- [ ] **Step 2: 工具栏 UI** — `H1 H2 H3 ｜ B I S ｜ ❝ 1. • — ｜ ▦ ｜ A- A+ ｜ 🎨`。字号：复用 `BriefingFontSize` 档位与 `ACADEMIC_BODY_STYLES` 常量表，`A-/A+` 在档位数组内 ±1 并 `setWritingFontSize` 持久化。🎨：3 套 `writingTone` 循环切换。

- [ ] **Step 3: CSS 变量** — `WritingBoard` 根 div：

```tsx
style={{
  ['--writing-body-size' as string]: ACADEMIC_BODY_STYLES[fontSize].size,
  ['--writing-tone-color' as string]: { parchment: '#e8d5b7', plain: '#f5f5f4', ink: '#9c9490' }[tone],
}}
```

编辑器容器 css：`.milkdown { font-size: var(--writing-body-size); color: var(--writing-tone-color); }`（追加到现有全局 css，不改其他页面）。

- [ ] **Step 4: 手动验证 + Commit**

```bash
npm run dev   # 各按钮生效；字号/配色重启后保持；.md 文件中无样式残留
git add src/components/writing/ src/store/index.ts src/index.css
git commit -m "feat(writing): 工具栏（md 命令 + 表格）+ 视图级字号/配色"
```

---

### Task 9: `.catalog.json` 生成管线

**Files:**
- Create: `electron/lib/writing-catalog.ts`
- Modify: `electron/lib/llm-tasks.ts`（加 `generateWritingSummary`）
- Modify: `electron/ipc/writing.ts`（write/import 后触发更新）
- Test: `tests/writing-catalog.test.ts`

- [ ] **Step 1: 写失败测试** — load（损坏 JSON → 空 catalog 重建）、updateEntry/removeEntry、diff（树有而 catalog 无 → 待生成列表）：

```ts
import { loadCatalog, saveCatalog, updateEntry, removeEntry, diffPending } from '../electron/lib/writing-catalog'

it('损坏 JSON 重建为空 catalog', () => {
  fs.writeFileSync(path.join(lib, 'writing/.catalog.json'), '{bad')
  expect(loadCatalog(lib, 'writing').entries).toEqual({})
})
it('diffPending 找出缺条目的文件', () => {
  // 树里有 writing/a.md，catalog 空 → pending 含 'a.md'
})
```

- [ ] **Step 2: 跑测试确认失败。**

- [ ] **Step 3: 实现**

```ts
// electron/lib/writing-catalog.ts
import type { WritingCatalog, WritingRoot } from '../../src/types'
const EMPTY: WritingCatalog = { version: 1, entries: {} }
export function catalogPath(lib: string, root: WritingRoot) { return path.join(lib, root, '.catalog.json') }
export function loadCatalog(lib: string, root: WritingRoot): WritingCatalog {
  try { const j = JSON.parse(fs.readFileSync(catalogPath(lib, root), 'utf8')); return j.version === 1 ? j : EMPTY } catch { return EMPTY }
}
export function saveCatalog(lib: string, root: WritingRoot, c: WritingCatalog): void {
  fs.writeFileSync(catalogPath(lib, root), JSON.stringify(c, null, 2))
}
export function updateEntry(lib, root, rel, entry) { const c = loadCatalog(lib, root); c.entries[rel] = entry; saveCatalog(lib, root, c) }
export function removeEntry(lib, root, rel) { const c = loadCatalog(lib, root); delete c.entries[rel]; saveCatalog(lib, root, c) }
export function diffPending(lib: string, root: WritingRoot): string[] {
  const files = collectMdPaths(scanRoot(lib, root))            // 拍平树取 path
  const c = loadCatalog(lib, root)
  return files.filter(f => !c.entries[f])
}
```

```ts
// electron/lib/llm-tasks.ts 追加
export async function generateWritingSummary(cfg: AppConfig, title: string, body: string): Promise<string> {
  const content = await chatNonStream(cfg, {
    messages: [
      { role: 'system', content: '为文章写一句话中文摘要（≤40字）。只输出摘要本身：禁止引号、禁止markdown、禁止"本文"开头、禁止换行。' },
      { role: 'user', content: `标题：${title}\n\n${body}` },
    ],
    temperature: 0.3,
  })
  return content.trim().replace(/\n.*/s, '').slice(0, 80)
}
```

- [ ] **Step 4: 触发点接线** — `writing:write` 成功后：`generateWritingSummary` → `updateEntry`（失败静默跳过，`try/catch` 空 catch + debug 日志）；`writing:importFiles` 对每个 imported 同样处理；`writing:delete`/`rename`/`move` → `removeEntry`/路径迁移。启动 sweep：`registerWritingIpc` 里 `diffPending` 非空时后台批量补生成（不阻塞启动，逐个 try/catch）。

- [ ] **Step 5: 跑测试确认通过 → Commit**

```bash
npx vitest run tests/writing-catalog.test.ts
git add electron/lib/writing-catalog.ts electron/lib/llm-tasks.ts electron/ipc/writing.ts tests/writing-catalog.test.ts
git commit -m "feat(writing): .catalog.json LLM 摘要管线（生成/增量/清理/启动补全）"
```

---

### Task 10: 助手后端 — 工具协议 + 目录索引 + 循环

**Files:**
- Create: `electron/lib/writing-assistant/tool-protocol.ts`
- Create: `electron/lib/writing-assistant/prompt.ts`
- Create: `electron/lib/writing-assistant/tools.ts`
- Create: `electron/lib/writing-assistant/loop.ts`
- Modify: `electron/lib/kimi.ts`（reasoning 解析 + `reasoning_effort: 'max'` + `chatStream` 第 4 参 `onReasoning`）
- Test: `tests/writing-tool-protocol.test.ts`、`tests/writing-catalog-prompt.test.ts`

- [ ] **Step 1: 写失败测试 — 协议解析**

```ts
import { extractToolCall, createToolBuffer, MAX_TOOL_CALLS } from '../electron/lib/writing-assistant/tool-protocol'

it('提取完整 tool 块', () => {
  const r = extractToolCall('前文\n```tool\n{"tool":"read_local","ids":["writing:a.md"]}\n```\n后文')
  expect(r).toEqual({ tool: 'read_local', ids: ['writing:a.md'] })
})
it('畸形 JSON 返回 null', () => {
  expect(extractToolCall('```tool\n{bad}\n```')).toBeNull()
})
it('未知工具名返回 null', () => {
  expect(extractToolCall('```tool\n{"tool":"rm_rf"}\n```')).toBeNull()
})
it('流式缓冲：未闭合的 tool 块不透出', () => {
  const b = createToolBuffer()
  expect(b.feed('你好```tool\n{"tool"')).toBe('你好')   // 透出部分不含未闭合块
  expect(b.feed(':"read_local","ids":[]}\n```世界')).toBe('世界')
  expect(b.takeTool()).toEqual({ tool: 'read_local', ids: [] })
})
it('MAX_TOOL_CALLS = 6', () => { expect(MAX_TOOL_CALLS).toBe(6) })
```

- [ ] **Step 2: 跑测试确认失败。**

- [ ] **Step 3: 实现 `tool-protocol.ts`**

```ts
export const MAX_TOOL_CALLS = 6
export type ToolCall = { tool: 'read_local'; ids: string[] } | { tool: 'web_search'; query: string } | { tool: 'insert_into_article'; markdown: string }

export function extractToolCall(text: string): ToolCall | null {
  const m = text.match(/```tool\s*\n([\s\S]*?)```/)
  if (!m) return null
  let json: unknown
  try { json = JSON.parse(m[1].trim()) } catch { return null }   // extract→parse→shape-check
  const o = json as Record<string, unknown>
  if (o.tool === 'read_local' && Array.isArray(o.ids)) return { tool: 'read_local', ids: o.ids.filter((x): x is string => typeof x === 'string') }
  if (o.tool === 'web_search' && typeof o.query === 'string') return { tool: 'web_search', query: o.query }
  if (o.tool === 'insert_into_article' && typeof o.markdown === 'string') return { tool: 'insert_into_article', markdown: o.markdown }
  return null
}

export function createToolBuffer() {
  let buf = ''                    // 未处理输入
  let inTool = false              // 是否处于 ```tool 块内
  let toolBody = ''               // 块内累积文本
  let completed: string | null = null  // 已闭合的块
  return {
    feed(chunk: string): string {   // 返回可安全透出的文本；tool 块内容被吞
      buf += chunk
      let out = ''
      for (;;) {
        if (inTool) {
          const end = buf.indexOf('```')
          if (end === -1) { toolBody += buf; buf = ''; return out }
          toolBody += buf.slice(0, end)
          buf = buf.slice(end + 3)
          inTool = false
          completed = toolBody
          toolBody = ''
          continue
        }
        const start = buf.indexOf('```tool')
        if (start === -1) {
          // 保留可能是块开头前缀的尾巴（如 ``、```to），下轮再判
          const tailMatch = buf.match(/`{1,3}(t|to|too|tool)?$/)
          const keep = tailMatch && buf.endsWith(tailMatch[0]) ? tailMatch[0].length : 0
          out += buf.slice(0, buf.length - keep)
          buf = buf.slice(buf.length - keep)
          return out
        }
        out += buf.slice(0, start)
        buf = buf.slice(start + '```tool'.length)
        inTool = true
      }
    },
    takeTool(): ToolCall | null {
      const body = completed
      completed = null
      return body === null ? null : extractToolCall('```tool\n' + body + '\n```')
    },
    flush(): string { const rest = buf; buf = ''; return rest },
  }
}

- [ ] **Step 4: 实现 `prompt.ts`（目录索引 + 系统 prompt）**

```ts
export type IndexEntry = { id: string; type: WritingSourceType; title: string; summary: string }

export async function buildWritingIndex(cfg: AppConfig): Promise<IndexEntry[]> {
  // study：files.ts 的 scan 逻辑复用，取每主题最新学习报告 frontmatter.description（无则退回标题）
  // blog：Anthropic博客/*/ 读 .guide.md 的「# 背景」段首段（无则标题）
  // digest/job：夜航简报/*.md、求职简报 frontmatter description（无则标题）
  // writing/repository：loadCatalog 的 entries（无条目文件 → 标题即文件名）
  // id 形如 `study:分布式系统/s2/学习报告.md`
}

export function buildWritingSystemPrompt(index: IndexEntry[]): string {
  const catalog = index.map(e => `- [${e.type}] ${e.id} — ${e.title}：${e.summary}`).join('\n')
  return `你是用户的写作助手。…（角色设定）
# 可调取资料目录
${catalog}

# 工具协议
需要读取资料全文、搜索网络或向编辑器插入内容时，输出一个工具块：
\`\`\`tool
{"tool":"read_local","ids":["writing:随笔/a.md"]}
\`\`\`
规则：
- read_local：ids 只能来自上方目录的 id；ids 为 ["index"] 时返回完整目录
- web_search：{"tool":"web_search","query":"…"}
- insert_into_article：{"tool":"insert_into_article","markdown":"…"}，把内容插入用户文章光标处
- 一次只输出一个工具块；工具结果会以 user 消息返回，然后继续回答
- 不需要工具时禁止输出工具块；禁止编造不存在的 id；禁止输出多个工具块`
}
```

规则遵守 llm.md §5：格式禁令 + 负面示例写进 prompt。index 超 300 条按 updatedAt 截断并在 prompt 注明（spec §7.1）。

- [ ] **Step 5: 写 `buildWritingIndex` 单测**（临时库 seed 各类型文件 → 断言六类条目、description 优先、降级文件名）→ 实现通过。

- [ ] **Step 6: 实现 `tools.ts` + `loop.ts`**

```ts
// tools.ts
export async function executeTool(cfg: AppConfig, call: ToolCall, opts: { useSearch: boolean; send: (e: WritingToolEvent) => void; sessionId: string }): Promise<string> {
  if (call.tool === 'read_local') {
    opts.send({ sessionId: opts.sessionId, phase: 'start', tool: 'read_local', ids: call.ids })
    // ids === ['index'] → 返回完整目录文本
    // 否则逐个 id 解析前缀类型 → 校验在学习库内 → 读全文；blog/digest 同时读 .annotations.md/.assistant.md/.guide.md 伴生（存在才读）
    // 未知 id → 文本 "id xxx 不存在，请从目录中选择"
    opts.send({ sessionId: opts.sessionId, phase: 'done', tool: 'read_local', ids: call.ids })
    return resultText
  }
  if (call.tool === 'web_search') {
    if (!opts.useSearch) return '网络搜索未开启（用户关闭了 🔍）。'
    // getSearchApiKey + searchWeb（复用 electron/lib/search.ts），结果格式化为编号列表；错误映射 NO_RESULTS/SEARCH_ERROR
  }
  // insert_into_article
  opts.send({ sessionId: opts.sessionId, phase: 'done', tool: 'insert_into_article', markdown: call.markdown })
  return '已插入到编辑器光标处。'
}
```

```ts
// loop.ts
export async function runWritingAssistantTurn(cfg, args: { sessionId, systemPrompt, messages, useSearch, thinkingEffort, send, onChunk, onReasoning, signal }): Promise<void> {
  const history = [{ role: 'system', content: args.systemPrompt }, ...args.messages]
  for (let round = 0; round <= MAX_TOOL_CALLS; round++) {
    const buf = createToolBuffer()
    await chatStream(cfg, { messages: history, temperature: 0.7, signal: args.signal, thinking: effortToThinking(args.thinkingEffort) },
      (text) => { const out = buf.feed(text); if (out) args.onChunk(out) },
      (text) => args.onReasoning(text))
    const tail = buf.flush(); if (tail) args.onChunk(tail)
    const call = buf.takeTool()
    if (!call || round === MAX_TOOL_CALLS) {
      if (call) history.push({ role: 'user', content: '工具调用次数已达上限，请直接回答。' })
      return
    }
    const result = await executeTool(cfg, call, args)
    history.push({ role: 'assistant', content: '（调用工具）' }, { role: 'user', content: `工具结果：\n${result}` })
  }
}
```

`effortToThinking`：`off → {type:'disabled'}`；`high/max → {type:'enabled', reasoning_effort}`。

- [ ] **Step 7: kimi.ts 修改**（与 annotation plan 同一改动，先落地者为准）：`SseEvent` 加 `{ kind: 'reasoning'; text: string }`；`parseSseChunk` 解析 `delta.reasoning_content`；`chatStream` 加可选第 4 参 `onReasoning`；`ThinkingConfig` 的 `reasoning_effort` 扩为 `'high' | 'max'`。补 `tests/kimi.test.ts` 用例。

- [ ] **Step 8: 跑全部新测试 → Commit**

```bash
npx vitest run tests/writing-tool-protocol.test.ts tests/writing-catalog-prompt.test.ts tests/kimi.test.ts
git add electron/lib/writing-assistant/ electron/lib/kimi.ts tests/
git commit -m "feat(writing): 助手工具协议 + 目录索引 + 主进程工具循环 + reasoning 链路"
```

---

### Task 11: 助手 IPC + 渲染端 runtime + 会话持久化

**Files:**
- Create: `electron/ipc/writing-assistant.ts`
- Modify: `electron/ipc/article-assistant.ts`（`parent_type` 放开 `'writing'`）
- Modify: `src/types/index.ts`（`parent_type` 联合类型）
- Create: `src/lib/writing-assistant-runtime.ts`
- Modify: `src/store/index.ts`
- Test: `tests/writing-assistant-store.test.ts`

- [ ] **Step 1: 主进程 handler**（结构照抄 `articleAssistant:sendMessage` L295-414）：E2E mock 分支（`isE2EMock()`）发确定性事件序列（一段 tool 事件 + 3 个 chunk + done，并落盘 `last-writing-request.json` 到 `E2E_CONFIG_DIR`）；真实分支：`buildWritingIndex` → `buildWritingSystemPrompt` → 组装 messages（系统 + 当前文章上下文 + 全历史，**不截断**）→ `runWritingAssistantTurn`，事件 `writingAssistant:tool` / `writingAssistant:reasoningChunk` / 复用 `llm:chunk|done|error`。`writingAssistant:abort` 按 sessionId abort（独立 Map）。

- [ ] **Step 2: `parent_type` 加 `'writing'`**（types + article-assistant.ts 的 readSession/writeSession 参数类型），写作会话存 `<文章>.assistant.md`。

- [ ] **Step 3: 渲染端 runtime `src/lib/writing-assistant-runtime.ts`**（模式照 `assistant-session-runtime.ts`）：监听 `onLlmChunk/onLlmDone/onLlmError`（匹配 `writing-assistant-` 前缀 sid）、`onWritingAssistantTool`（read_local start → 当前消息加"读取中"chip；done → chip 落定；insert_into_article → 调 `useStore.getState().writingEditorAction?.(insert(markdown))`，`insert` 来自 `@milkdown/utils`）、`onWritingAssistantReasoningChunk`（append 到当前消息 reasoning）。在 App 启动处 attach（照现有 attach 点）。

- [ ] **Step 4: store 切片**（先写失败测试再实现）：

```ts
writingAssistant: {
  messages: WritingAssistantMessage[]; streaming: boolean; error: ArticleAssistantErrorCode | null
} | null
sendWritingAssistantMessage: (text: string) => Promise<void>   // 组装 args（当前文章 body、全历史、useSearch、thinkingEffort）调 ipc；sessionId = `writing-assistant-${Date.now()}`
appendWritingChunk / appendWritingReasoning / applyWritingToolEvent / finishWritingStreaming
loadWritingAssistantSession: (articlePath) => void             // articleAssistantReadSession → messages；切换文章时调用
persistWritingAssistantSession: () => void                     // finishWritingStreaming 后 writeSession（parent_type 'writing'），含 `> 来源：[type] id` 行
toggleAssistantSearch / cycleThinkingEffort                     // 写 state.json 共享字段
```

- [ ] **Step 5: 跑测试 → Commit**

```bash
npx vitest run tests/writing-assistant-store.test.ts
git add electron/ipc/writing-assistant.ts electron/ipc/article-assistant.ts src/lib/writing-assistant-runtime.ts src/store/index.ts src/types/index.ts tests/
git commit -m "feat(writing): 助手 IPC + 渲染端 runtime + .assistant.md 会话持久化"
```

---

### Task 12: 助手 UI 面板

**Files:**
- Create: `src/components/writing-assistant/WritingAssistantPanel.tsx`
- Create: `src/components/writing-assistant/WritingAssistantMessages.tsx`
- Create: `src/components/writing-assistant/WritingAssistantInput.tsx`
- Modify: `src/pages/Briefing.tsx`（替换占位）

- [ ] **Step 1: `WritingAssistantPanel.tsx`** — 收起态：右侧 `w-6` 竖排 tab「AI 助手 ▸」（`writing-mode: vertical-rl`，bg-ember）；展开态：`width: writingAssistantWidth`，左缘拖拽调宽（pointermove 改 store，200~560px clamp，持久化）。

- [ ] **Step 2: `WritingAssistantMessages.tsx`** — two-sided：用户 `justify-end` 气泡 `bg-ember/10 max-w-[85%]`；AI `justify-start` 无气泡；**来源 chips 行**：每个 `sources` 渲染 `[type] label` 徽标（type→中文映射：学习/博客/日报/求职/repository/写作/网络），流式中的"读取中"chip 带 `animate-pulse`；`reasoning` 渲染 `<details>` 灰字区块（`text-xs text-parchment/50`，streaming 时 `open`，完成后折叠）；AI 消息底部「插入到编辑器」按钮 → `writingEditorAction?.(insert(msg.content))`。

- [ ] **Step 3: `WritingAssistantInput.tsx`** — 左下角 `[🔍] [🧠]`（样式按 annotation spec：关 `text-parchment/40`、开 `text-sky-400`、MAX 加角标；`transition-colors duration-200`；streaming 时 `disabled:opacity-30`）+ textarea（Enter 发送、Shift+Enter 换行）+ 发送/停止按钮（streaming 时变 ■ 调 abort）。

- [ ] **Step 4: Briefing.tsx 接线** + 手动验证 → Commit

```bash
npm run dev   # 展开/收起/拖宽持久化；发送→来源 chip→流式→插入编辑器；🔍🧠 重启保持
git add src/components/writing-assistant/ src/pages/Briefing.tsx
git commit -m "feat(writing): AI 助手停靠面板（two-sided/来源 chips/🔍🧠/插入）"
```

---

### Task 13: E2E — 设施（seeds + page objects + mock 扩展）

**Files:**
- Modify: `e2e/helpers/test-library.ts`
- Create: `e2e/pages/WritingPage.ts`
- Create: `e2e/pages/WritingAssistantPanel.ts`

- [ ] **Step 1: seeds**（模式照 `seedBriefing`/`seedAnthropicArticle`）：

```ts
export function seedWritingTree(libPath: string): void {
  // writing/随笔/七月夜话.md（含 frontmatter type: writing）
  // writing/技术笔记/分布式随笔.md + 嵌套 writing/技术笔记/子组/deep.md
  // writing/随笔/七月夜话.assistant.md（一条历史对话 + > 来源 行）
}
export function seedRepository(libPath: string): void {
  // repository/2023/旧博客-xxx.md（无 frontmatter）、repository/旧随笔.md
}
export function seedCatalogJson(libPath: string): void {
  // writing/.catalog.json + repository/.catalog.json（version 1，覆盖 seeded 文件）
}
export function seedGuideFile(articleDir: string, background: string): void {
  // <article>.guide.md，body 含 `# 背景\n\n${background}`
}
```

- [ ] **Step 2: page objects**（selector 全部进 `e2e/helpers/selectors.ts`，组件加 `data-testid`：`writing-source-tab` `writing-list-tab-articles` `writing-list-tab-repository` `writing-tree-node` `writing-new-file` `writing-new-folder` `writing-editor` `writing-save-status` `writing-assistant-tab` `writing-assistant-panel` `writing-assistant-input` `writing-assistant-send` `writing-source-chip` `writing-insert-btn` `writing-toggle-search` `writing-toggle-thinking`）：

```ts
export class WritingPage {
  constructor(private page: Page) {}
  async goto() { /* 启动 app → 简报页 → 点击 writing-source-tab */ }
  async switchListTab(tab: 'articles' | 'repository') {}
  async newFile(name: string) {}        // 点击 writing-new-file → prompt 处理
  async treeNode(name: string) { return this.page.getByTestId('writing-tree-node').filter({ hasText: name }) }
  async typeInEditor(text: string) { await this.page.getByTestId('writing-editor').locator('.ProseMirror').fill(text) }
  async saveStatus() { return this.page.getByTestId('writing-save-status').textContent() }
}
export class WritingAssistantPanel {
  constructor(private page: Page) {}
  async open() {}
  async send(text: string) {}
  async sourceChips() { return this.page.getByTestId('writing-source-chip').allTextContents() }
  async insertLast() {}
  async toggleSearch() / async cycleThinking()
}
```

- [ ] **Step 3: mock 分支验证** — `writingAssistant:sendMessage` 的 `isE2EMock()` 分支（Task 11 Step 1）发确定性序列：`writingAssistant:tool`（read_local start，ids 含 `repository:旧随笔.md`）→ tool done → chunks（`这是一段`/`E2E 回复`）→ `writingAssistant:tool`（insert_into_article done，markdown 固定 `# 插入标题`）→ done；并落盘 `last-writing-request.json` 到 `E2E_CONFIG_DIR`（含系统 prompt 全文，供目录摘要注入断言）。写 `writing-assistant.spec.ts` 首个用例跑通全链路后再进 Task 14。

- [ ] **Step 4: Commit**

```bash
git add e2e/
git commit -m "test(writing): E2E 设施（seeds/page objects/selectors/mock 序列）"
```

---

### Task 14: E2E — 覆盖矩阵 11 个 spec

**Files:** `e2e/specs/writing-*.spec.ts`（每个 spec 独立文件；启动全部走 `E2E_SILENT`，fixtures 用 Task 13 seeds）

- [ ] **Step 1: `writing-navigation.spec.ts`** — 写作源置顶且可切换；切走再切回状态保留；**reload 后来源/tab/lastWritingFile 恢复**（state.json 断言）。
- [ ] **Step 2: `writing-tree.spec.ts`** — 嵌套渲染与折叠；新建文章/分组/子分组出现在树与磁盘；重命名；删除确认（取消不删）；拖拽移动（`dispatchEvent` dragstart/drop）；重名 `-HHMM`；`.assistant.md`/`.catalog.json` 不显示。
- [ ] **Step 3: `writing-repository.spec.ts`** — tab 互斥；导入（mock dialog 返回路径或直接用 seed 后扫描）；repository 文章可打开、编辑器只读提示、AI 对话可用且会话可存。
- [ ] **Step 4: `writing-editor.spec.ts`** — 输入 → 1.5s+ 后 `已保存` → 磁盘断言内容；`Ctrl+S` 立即；表格插入 → 磁盘含 `|---|`；字号 A+/A- 与 🎨 切换 → reload 保持（state.json 断言）；mock 写入失败 → `保存失败` 提示。
- [ ] **Step 5: `writing-assistant.spec.ts`** — 面板展开/收起/拖宽持久化；发送 → two-sided 消息；abort；切换文章会话隔离；reload 后 `.assistant.md` 历史恢复。
- [ ] **Step 6: `writing-assistant-tools.spec.ts`** — mock 序列断言：来源 chips 含 `[repository] 旧随笔.md`；"读取中"→落定；`insert_into_article` mock → 编辑器内容断言；请求落盘 `last-writing-request.json` 含系统 prompt 目录摘要（六类 type）与条目 id。
- [ ] **Step 7: `writing-assistant-search-thinking.spec.ts`** — 🔍 开 → mock-tavily 命中、请求含搜索结果段；🔍 关 → 回注未开启（落盘断言）；🧠 high/max → 请求体 `reasoning_effort` 断言；reasoning 区块展开→折叠；两开关 reload 保持。
- [ ] **Step 8: `writing-catalog.spec.ts`** — 保存触发摘要更新（mock LLM 断言 `generateWritingSummary` 调用与 `.catalog.json` 内容）；导入补生成；删除清理；损坏 JSON 重建；系统 prompt 注入断言。
- [ ] **Step 9: `writing-edge.spec.ts`** — 空 writing/ 空 repository/；老库无两目录 → 自动创建；外部删除文件 → 打开时 `WRITING_NOT_FOUND` 提示不白屏；无 description/guide → 目录降级文件名。
- [ ] **Step 10: 启动探测** — smoke.spec.ts 加断言：`window.api.writingScanTree` 等 11 个新方法全部存在。
- [ ] **Step 11: `writing-real-api.spec.ts`**（可选，照 briefing-real-api 模式）— 真实 API：一轮对话 + 一次 read_local + 一次 insert。

每步完成后跑对应 spec 再进入下一步；全绿后：

```bash
git add e2e/specs/
git commit -m "test(writing): E2E 覆盖矩阵（导航/树/repository/编辑器/助手/工具/搜索思考/catalog/边界/探测）"
```

---

### Task 15: 打包冒烟 + 收尾

- [ ] **Step 1: `npm run test` 全绿**（含全部既有测试回归）。
- [ ] **Step 2: `npm run build && npm run package`**，安装产物冒烟：写作源可用、学习库下自动建 `writing/`、`repository/`，`.catalog.json` 写入用户库而非安装目录（general §6）。
- [ ] **Step 3: 文档同步** — CLAUDE.md「架构总览」补写作域一段（文件清单 + IPC 域）；本计划所有 checkbox 勾完。
- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore(writing): 打包冒烟通过 + 文档同步"
```

---

## 自检结论（plan 对 spec 的覆盖）

- spec §2 布局 → Task 5/6/12；§3 存储 → Task 2/3；§4 IPC → Task 3/11；§5 state → Task 1/4；§6 编辑器 → Task 0/7/8；§7 AI 助手 → Task 9/10/11/12；§8 错误处理 → 各任务 wrap/code 映射 + Task 14 Step 9；§9 测试 → 各任务单测 + Task 13/14；§10 顺序 → 任务序一致。
