---
status: historical
---

# Notepad Agent Claims Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为迭代记事板增加可跨 Codex 会话识别的 Agent 认领标记、命令行认领协议、运行中安全刷新和本地日期的今日完成高亮。

**Architecture:** 认领存到状态目录的独立 `notepad-claims.json`，主进程在 `state:get` 时叠加到待办视图，写回前剥离该派生字段。CLI 负责认领冲突与释放，面板在打开和窗口聚焦时刷新；今日高亮由纯日期函数派生，不写持久化状态。

**Tech Stack:** TypeScript、Electron IPC、Zustand、React 18、Node.js CommonJS CLI、Vitest、Testing Library。

**Spec:** `docs/superpowers/specs/2026-11-11-settings-center-and-notepad-claims-design.md`

## Global Constraints

- 认领文件为 `<stateDir>/notepad-claims.json`，结构为 `Record<itemId, { claimedBy, claimedAt }>`。
- `state.json` 的待办结构不变；`claim` 只能作为读取时的派生字段，任何 renderer 写回都必须剥离。
- 他人认领默认不可覆盖；`--force` 仅在用户明确接管时使用；不增加自动过期。
- 应用运行时仍禁止 Agent 直接移动 `state.json` 待办；完成归档沿用让用户点 ✓ 或关闭应用的规则。
- 不新增文件监听、轮询、用户手动认领按钮或新 IPC 通道。
- 不处理记事板第 1–3 项，不改主工作区，不主动合并；E2E 需用户另行明确确认。
- 每个行为改动先写失败测试，确认失败原因后再写实现。

---

### Task 1: 认领存储、待办合并与归档清理

**Files:**
- Modify: `src/types/index.ts`
- Create: `electron/lib/notepad-claims.ts`
- Modify: `electron/ipc/state.ts`
- Test: `tests/notepad-claims.test.ts`

**Interfaces:**
- Consumes: 现有 `safeReadJson`、`safeWriteJson`、`getStateDir()` 和 `NotepadItem`。
- Produces: `NotepadClaim`、`readNotepadClaims(stateDir)`、`mergeNotepadClaims(items, claims)`、`pruneNotepadClaims(stateDir, items)`。

- [ ] **Step 1: 写认领合并、损坏恢复和清理失败测试**

Create `tests/notepad-claims.test.ts`：

```ts
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
```

- [ ] **Step 2: 运行测试并确认 RED**

Run: `npx vitest run tests/notepad-claims.test.ts`

Expected: FAIL，`@electron/lib/notepad-claims` 不存在。

- [ ] **Step 3: 实现类型和存储函数**

在 `src/types/index.ts` 增加：

```ts
export type NotepadClaim = { claimedBy: string; claimedAt: string }
export interface NotepadItem {
  id: string
  title?: string
  text: string
  category: NotepadCategory
  createdAt: string
  claim?: NotepadClaim
}
```

`electron/lib/notepad-claims.ts` 使用现有 safe-json，核心纯函数保持输入不可变：

```ts
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
```

在 `state:get` 返回前合并；在 `patchState` 收到 `notepadItems` 且磁盘合并成功后调用 `pruneNotepadClaims(getStateDir(), merged.notepadItems as NotepadItem[])`。不要把 claims 写入 DEFAULT 或 `StateJson`。

- [ ] **Step 4: 运行测试并确认 GREEN**

Run: `npx vitest run tests/notepad-claims.test.ts tests/safe-json.test.ts`

Expected: PASS，包括 `.bak` 恢复和归档清理。

- [ ] **Step 5: Commit**

```bash
git add src/types/index.ts electron/lib/notepad-claims.ts electron/ipc/state.ts tests/notepad-claims.test.ts
git commit -m "feat: add persistent notepad claim storage"
```

### Task 2: Agent 认领 CLI 与冲突规则

**Files:**
- Create: `scripts/notepad-claim.cjs`
- Test: `tests/notepad-claim-script.test.ts`

**Interfaces:**
- Consumes: `E2E_CONFIG_DIR`（测试/隔离）或默认 `~/.studyparlor`，以及 Task 1 的 claims 文件结构。
- Produces: `claim <id> <agent> [--force]` 和 `release <id> <agent>`；成功输出认领者，冲突非零退出。

- [ ] **Step 1: 用真实子进程写 CLI 失败测试**

Create `tests/notepad-claim-script.test.ts`：

```ts
import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const script = path.resolve(__dirname, '..', 'scripts', 'notepad-claim.cjs')
function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'claim-cli-'))
  fs.writeFileSync(path.join(dir, 'state.json'), JSON.stringify({ notepadItems: [{ id: 'n4', text: '设置中心', category: 'feature', createdAt: 'now' }] }))
  return dir
}
function run(dir: string, args: string[]) {
  return execFileSync(process.execPath, [script, ...args], { env: { ...process.env, E2E_CONFIG_DIR: dir }, encoding: 'utf8' })
}

describe('notepad-claim CLI', () => {
  it('同 Agent 幂等，异 Agent 冲突，force 才接管', () => {
    const dir = fixture()
    expect(run(dir, ['claim', 'n4', 'codex/a'])).toContain('codex/a')
    expect(run(dir, ['claim', 'n4', 'codex/a'])).toContain('codex/a')
    expect(() => run(dir, ['claim', 'n4', 'codex/b'])).toThrow()
    expect(run(dir, ['claim', 'n4', 'codex/b', '--force'])).toContain('codex/b')
  })

  it('release 只能释放自己的认领，也允许待办已归档', () => {
    const dir = fixture()
    run(dir, ['claim', 'n4', 'codex/a'])
    expect(() => run(dir, ['release', 'n4', 'codex/b'])).toThrow()
    fs.writeFileSync(path.join(dir, 'state.json'), JSON.stringify({ notepadItems: [] }))
    expect(run(dir, ['release', 'n4', 'codex/a'])).toContain('已释放')
  })

  it('claim 不存在的待办会失败', () => {
    const dir = fixture()
    expect(() => run(dir, ['claim', 'missing', 'codex/a'])).toThrow()
  })
})
```

- [ ] **Step 2: 运行测试并确认 RED**

Run: `npx vitest run tests/notepad-claim-script.test.ts`

Expected: FAIL，`scripts/notepad-claim.cjs` 不存在。

- [ ] **Step 3: 实现无依赖 CLI**

脚本用 `os.homedir()`、`E2E_CONFIG_DIR`、Node `fs/path`。实现以下固定流程：

```js
const stateDir = process.env.E2E_CONFIG_DIR || path.join(os.homedir(), '.studyparlor')
const [command, id, agent, ...flags] = process.argv.slice(2)
if (!['claim', 'release'].includes(command) || !id || !agent) throw new Error('用法: claim|release <id> <agent> [--force]')
```

`claim` 先读 `state.json` 验证待办，再读 claims；同 agent 直接返回，异 agent 且没有 `--force` 时抛出包含当前认领者的错误。写入使用 `.bak` + `.tmp` + `renameSync`。`release` 不读待办验证，只在 claim 属于当前 agent 时删除；不存在自己的 claim 时输出「无需释放」并保持幂等。

- [ ] **Step 4: 运行 CLI 测试并确认 GREEN**

Run: `npx vitest run tests/notepad-claim-script.test.ts`

Expected: PASS；冲突不会被覆盖，归档后的 release 仍成功。

- [ ] **Step 5: Commit**

```bash
git add scripts/notepad-claim.cjs tests/notepad-claim-script.test.ts
git commit -m "feat: add notepad agent claim command"
```

### Task 3: 面板刷新、认领标记与派生字段隔离

**Files:**
- Modify: `src/lib/notepad.ts`
- Modify: `src/store/index.ts`
- Modify: `src/components/NotepadPanel.tsx`
- Test: `tests/notepad-update.test.ts`
- Test: `tests/notepad-assistant.test.tsx`
- Create: `tests/notepad-claims-ui.test.tsx`

**Interfaces:**
- Consumes: Task 1 的 `NotepadItem.claim` 和现有 `ipc.getState()`。
- Produces: `stripNotepadClaims<T extends NotepadItem>(items: T[]): T[]`、`refreshNotepad(): Promise<void>`、`notepad-claim-<id>`。

- [ ] **Step 1: 写刷新、标记和写回隔离失败测试**

在 `tests/notepad-update.test.ts` 增加带 claim 的待办，执行 add/update/resolve/delete/move 后分别断言 `ipc.patchState` 收到的 items/log 不含 `claim`。核心断言：

```ts
expect(vi.mocked(ipc.patchState).mock.calls.at(-1)?.[0].notepadItems?.[0]).not.toHaveProperty('claim')
```

Create `tests/notepad-claims-ui.test.tsx`，使用真实 store、mock `ipc.getState/patchState`：

```tsx
it('打开和窗口聚焦时刷新，并显示认领者', async () => {
  vi.mocked(ipc.getState).mockResolvedValue({ notepadItems: [{ ...item, claim: { claimedBy: 'codex/a', claimedAt: '2026-11-11T01:00:00Z' } }], notepadLog: [] } as any)
  render(<NotepadPanel open onClose={vi.fn()} />)
  await screen.findByText('处理中 · codex/a')
  expect(ipc.getState).toHaveBeenCalledTimes(1)
  fireEvent.focus(window)
  await waitFor(() => expect(ipc.getState).toHaveBeenCalledTimes(2))
})

it('刷新失败保留当前条目并提示', async () => {
  useStore.setState({ notepadItems: [item] })
  vi.mocked(ipc.getState).mockRejectedValue(new Error('boom'))
  render(<NotepadPanel open onClose={vi.fn()} />)
  await waitFor(() => expect(useStore.getState().toast?.message).toBe('记事板刷新失败'))
  expect(useStore.getState().notepadItems).toEqual([item])
})
```

- [ ] **Step 2: 运行测试并确认 RED**

Run: `npx vitest run tests/notepad-update.test.ts tests/notepad-claims-ui.test.tsx tests/notepad-assistant.test.tsx`

Expected: FAIL，缺少刷新 action/标记，且旧写回会携带 claim。

- [ ] **Step 3: 实现剥离、刷新与标记**

在 `src/lib/notepad.ts`：

```ts
export function stripNotepadClaims<T extends NotepadItem>(items: T[]): T[] {
  return items.map(item => {
    const next = { ...item }
    delete next.claim
    return next
  })
}
```

所有写 `notepadItems` / `notepadLog` 的 store action 仅对 IPC  payload 调用该函数，内存仍保留 claim 供显示。新增：

```ts
refreshNotepad: async () => {
  try {
    const state = await ipc.getState()
    set({
      notepadItems: migrateCoverNotepad(state.coverNotepad ?? '', state.notepadItems),
      notepadLog: Array.isArray(state.notepadLog) ? state.notepadLog : [],
    })
  } catch {
    get().showToast('记事板刷新失败')
  }
},
```

`NotepadPanel` 在 `open` 变为 true 时刷新，并注册窗口 `focus` 监听。待办正文下增加：

```tsx
{item.claim && (
  <span data-testid={`notepad-claim-${item.id}`} title={`认领于 ${new Date(item.claim.claimedAt).toLocaleString()}`}
    className="mt-1 inline-flex w-fit items-center rounded-full border border-ember/30 bg-ember/10 px-2 py-0.5 text-[10px] text-ember">
    处理中 · {item.claim.claimedBy}
  </span>
)}
```

给现有 NotepadPanel store mock 增加 `refreshNotepad: vi.fn()`，避免无关测试因缺少 action 失败。

- [ ] **Step 4: 运行面板与 store 测试并确认 GREEN**

Run: `npx vitest run tests/notepad-update.test.ts tests/notepad-claims-ui.test.tsx tests/notepad-assistant.test.tsx tests/notepad-fab.test.tsx`

Expected: PASS；刷新失败不清空当前条目，所有持久化 payload 不含 claim。

- [ ] **Step 5: Commit**

```bash
git add src/lib/notepad.ts src/store/index.ts src/components/NotepadPanel.tsx tests/notepad-update.test.ts tests/notepad-claims-ui.test.tsx tests/notepad-assistant.test.tsx tests/notepad-fab.test.tsx
git commit -m "feat: show and refresh notepad agent claims"
```

### Task 4: 今日完成高亮

**Files:**
- Modify: `src/lib/notepad.ts`
- Modify: `src/components/NotepadPanel.tsx`
- Test: `tests/notepad.test.ts`
- Test: `tests/notepad-assistant.test.tsx`

**Interfaces:**
- Consumes: `NotepadLogEntry.resolvedAt`。
- Produces: `isResolvedToday(resolvedAt: string, now?: Date): boolean`、`notepad-log-today`。

- [ ] **Step 1: 写本地日期和无效日期失败测试**

在 `tests/notepad.test.ts` 增加：

```ts
describe('isResolvedToday', () => {
  it('按本地年月日判断，而不是截取 UTC ISO 日期', () => {
    const now = new Date(2026, 10, 11, 8, 0)
    const earlierToday = new Date(2026, 10, 11, 0, 5).toISOString()
    const yesterdayLate = new Date(2026, 10, 10, 23, 55).toISOString()
    expect(isResolvedToday(earlierToday, now)).toBe(true)
    expect(isResolvedToday(yesterdayLate, now)).toBe(false)
  })

  it('无效日期返回 false', () => {
    expect(isResolvedToday('not-a-date', new Date(2026, 10, 11))).toBe(false)
  })
})
```

在面板测试增加今天与昨天两条 log，点「已完成」后断言只有今天条目含 `notepad-log-today` 和「今日完成 · 待测试」。

- [ ] **Step 2: 运行测试并确认 RED**

Run: `npx vitest run tests/notepad.test.ts tests/notepad-assistant.test.tsx`

Expected: FAIL，`isResolvedToday` 未定义且没有今日标识。

- [ ] **Step 3: 实现纯函数和时间线样式**

```ts
export function isResolvedToday(resolvedAt: string, now = new Date()): boolean {
  const resolved = new Date(resolvedAt)
  if (Number.isNaN(resolved.getTime())) return false
  return resolved.getFullYear() === now.getFullYear()
    && resolved.getMonth() === now.getMonth()
    && resolved.getDate() === now.getDate()
}
```

每条 log 计算一次 `const today = isResolvedToday(entry.resolvedAt)`；今天条目添加 `data-testid="notepad-log-today"`、`border-ember/35 bg-ember/10`，日期行加入「今日完成 · 待测试」。保留原展开、排序和 agent 标记。

- [ ] **Step 4: 运行测试并确认 GREEN**

Run: `npx vitest run tests/notepad.test.ts tests/notepad-assistant.test.tsx`

Expected: PASS；昨日和无效日期都不会获得高亮。

- [ ] **Step 5: Commit**

```bash
git add src/lib/notepad.ts src/components/NotepadPanel.tsx tests/notepad.test.ts tests/notepad-assistant.test.tsx
git commit -m "feat: highlight notepad items resolved today"
```

### Task 5: Agent 协议、E2E 映射与交付验证

**Files:**
- Modify: `AGENTS.md`
- Modify: `.agents/skills/notepad-triage/SKILL.md`
- Modify: `e2e/source-map.json`
- Modify: `e2e/specs/notepad-assistant.spec.ts`
- Modify: `docs/README.md`
- Modify: `docs/superpowers/specs/2026-11-11-settings-center-and-notepad-claims-design.md`
- Modify: `docs/superpowers/plans/2026-11-11-notepad-agent-claims.md`

**Interfaces:**
- Consumes: Tasks 1–4 的 CLI、刷新、UI 和清理行为。
- Produces: 空上下文 Agent 可执行的接单协议及可复现验证结果。

- [ ] **Step 1: 写入固定接单协议**

`AGENTS.md` 和 skill 必须包含以下原生命令与规则：

```bash
node scripts/notepad-claim.cjs claim <item-id> <current-branch>
node scripts/notepad-claim.cjs release <item-id> <current-branch>
```

读取需求时同时读取 claims；用户指定后先 claim 再探索；冲突默认跳过，只有用户明确接管才加 `--force`；取消时 release；完成归档仍遵守应用运行限制，手工归档后 release。不要写「直接编辑运行中的 state.json」。

- [ ] **Step 2: 更新 source map 与定向 E2E**

在 `cover-home.sources` 添加 `electron/lib/notepad-claims.ts`、`scripts/notepad-claim.cjs`、`src/lib/notepad.ts`（若已存在则不重复）。在 `notepad-assistant.spec.ts` 使用测试配置目录写 claims 文件，验证重新打开面板后出现认领者；seed 今天和昨天的 log，验证只有今天显示高亮。

- [ ] **Step 3: 运行静态与单元验证**

Run:

```bash
node scripts/e2e-changed.js
npx vitest run tests/notepad-claims.test.ts tests/notepad-claim-script.test.ts tests/notepad-update.test.ts tests/notepad-claims-ui.test.tsx tests/notepad-assistant.test.tsx tests/notepad-fab.test.tsx tests/notepad.test.ts tests/safe-json.test.ts
npm run build
```

Expected: 无 orphan WARNING；Vitest 全部 PASS；双 tsconfig 和 electron-vite build 成功。

- [ ] **Step 4: 经用户明确确认后运行定向 E2E**

先说明将启动隔离 Electron 测试实例。只有得到明确确认才运行：

```bash
node scripts/e2e-changed.js --run --no-retries
```

Expected: 受影响 spec PASS。未获确认则记录「E2E 未获授权，未运行」，不得启动应用或改跑全量。

- [ ] **Step 5: 更新文档状态并提交**

`docs/README.md` 第 15 节写入认领与今日高亮现状，把 planned 指针移入历史链；本计划 frontmatter 改为 `status: historical`。只有设置中心计划也已完成时，才把共享 spec 改为 `status: historical`；否则保留 planned 以准确表示剩余工作。保留设置中心计划中的移除墓碑作用。

```bash
npm run docs:check
git add AGENTS.md .agents/skills/notepad-triage/SKILL.md docs e2e
git commit -m "docs: record notepad agent claim workflow"
```

Expected: docs check 全部通过，提交只包含本计划相关文件。
