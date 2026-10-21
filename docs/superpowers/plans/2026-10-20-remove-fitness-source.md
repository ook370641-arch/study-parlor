# 移除健身来源（fitness）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完整移除夜航简报的「健身」来源功能（2026-10-08 上线，merge 4e42f8e），代码、测试、E2E、文档全清，应用回到写作/博客双来源。

**Architecture:** 按依赖方向反向拆除：先断页面入口（Task 1），再删前端死代码（组件/测试，Task 2），然后拆 store（Task 3）、主进程与桥接（Task 4，含 `IpcApi` 方法声明同步删除——preload 有显式类型标注，必须同批），再清剩余类型（Task 5），最后 E2E 与文档（Task 6/7）。每个 task 结束都保持 `npm run build`（含 `tsc --noEmit` ×2）通过。

> 本计划已经过一轮独立复审（2026-10-20），修正了两处 task 顺序：① 组件目录必须先于 store 拆除（组件是 store action 的调用方，`tsconfig.json` include 全 src，反序会 TS2339）；② `IpcApi` 方法声明必须与 preload 桥接同批删除（`electron/preload.ts:4` 是 `const api: IpcApi = {` 显式标注，`tsconfig.node.json` include 全 electron，分批必 TS2741）。

**Tech Stack:** Electron 30 + React 18 + TypeScript + Zustand + Vitest + Playwright。

**Spec:** `docs/superpowers/specs/2026-10-08-fitness-tracking-design.md`（被移除功能的原设计文档；执行时读它确认功能边界，Task 7 将其一并删除）

## Global Constraints

- 每个 task 完成后 `npm run build` 必须通过（build = `tsc --noEmit && tsc --noEmit -p tsconfig.node.json && node scripts/dev.js build`）。
- **不动** `tests/notepad.test.ts:37` 的 `'新一个健身记事板功能'`——那只是分类猜测的测试字符串，与本功能无关。
- **不删** 用户磁盘上的 `~/.studyparlor/fitness.json`——代码移除后无读写入口，残留无害，用户可自行清理。
- **不写迁移代码**——`src/store/index.ts` 的 `briefingSource` 校验去掉 `'fitness'` 后，旧 state.json 里残留的 `'fitness'` 值会自动回落 `'writing'`（`electron/ipc/state.ts` 的 `readStateJson()` 只做 `{...DEFAULT, ...raw}`，无独立校验，无冲突）。
- 历史文档（`2026-10-19-notepad-upgrade-design.md`、`2026-10-20-notes-bookshelf.md`）中对健身的时间线引用**保留**，它们是档案不是活文档。
- commit message 遵循仓库现有风格（如 `refactor(fitness): ...`）。

---

### Task 1: Briefing 页面与来源侧栏拆除

**Files:**
- Modify: `src/pages/Briefing.tsx`（L8 import、L32 loadFitness、L36-38 useEffect、L125-129 三元）
- Modify: `src/components/BriefingSourceSidebar.tsx`（L12-16 FitnessIcon、L106-110 来源条目）

**Interfaces:**
- Consumes: 无（第一个 task）
- Produces: 页面不再渲染 `FitnessPanel`、不再调用 `loadFitness`；来源列表只剩 `writing` / `anthropic`。`src/components/fitness/` 内组件仍存在但仍引用 store 的 fitness 成员——所以 store 必须留到 Task 3 拆。

- [ ] **Step 1: 改 `src/pages/Briefing.tsx` 四处**

删除 L8：

```ts
import { FitnessPanel } from '@/components/fitness/FitnessPanel'
```

删除 L32（在 `const writingTab = ...` 之后）：

```ts
  const loadFitness = useStore((s) => s.loadFitness)
```

删除 L36-38：

```ts
  useEffect(() => {
    if (source === 'fitness') void loadFitness()
  }, [source, loadFitness])
```

把 L125-129 的三元：

```tsx
            ) : source === 'anthropic' ? (
              <AnthropicBlogPanel theme={theme} />
            ) : (
              <FitnessPanel theme={theme} />
            )}
```

改为：

```tsx
            ) : (
              <AnthropicBlogPanel theme={theme} />
            )}
```

- [ ] **Step 2: 改 `src/components/BriefingSourceSidebar.tsx` 两处**

删除 L12-16 的 FitnessIcon 定义：

```tsx
const FitnessIcon = () => (
  <svg data-testid="briefing-source-icon-fitness" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
    <path d="M6.75 8.25v7.5M3.75 9.75v4.5M17.25 8.25v7.5M20.25 9.75v4.5M6.75 12h10.5" />
  </svg>
)
```

删除 navItems 中 L106-110 的条目：

```tsx
    {
      id: 'fitness',
      label: '健身',
      icon: FitnessIcon,
      testId: 'briefing-source-fitness',
    },
```

- [ ] **Step 3: 验证编译**

Run: `npm run build`
Expected: PASS（`src/components/fitness/` 已无入口引用但仍被 tsconfig include 检查——它们引用的 store 成员此时尚存，编译通过）

- [ ] **Step 4: Commit**

```bash
git add src/pages/Briefing.tsx src/components/BriefingSourceSidebar.tsx
git commit -m "refactor(fitness): 拆除 Briefing 页面与来源侧栏的健身入口"
```

---

### Task 2: 删除前端死代码与单元测试

**Files:**
- Delete: `src/components/fitness/`（整目录 7 个文件：FitnessPanel / FitnessPlanView / FitnessRecordEditor / FitnessWeightView / FitnessBodyView / FitnessFaceHeader / TrendChart）
- Delete: `src/lib/fitness-theme.ts`
- Delete: `tests/fitness.test.ts`、`tests/fitness-store.test.ts`、`tests/fitness-store-slice.test.ts`、`tests/fitness-body-plan.test.tsx`、`tests/fitness-weight-view.test.tsx`、`tests/fitness-trend-chart.test.tsx`

**Interfaces:**
- Consumes: Task 1 已移除页面对 `FitnessPanel` 的引用，组件目录成为纯死代码
- Produces: store 的 fitness 成员从此无任何调用方（为 Task 3 解锁）
- 注意 1：`src/lib/fitness.ts` **本 task 不删**——`electron/lib/fitness-store.ts` 与 `electron/ipc/fitness.ts` 仍 import 它，须留到 Task 4 与主进程文件同一步删除。
- 注意 2：`tests/fitness-ipc-shape.test.ts` **本 task 不删**——它测 `src/lib/ipc.ts` facade 的 fitness getter，facade 在 Task 4 才拆。

- [ ] **Step 1: 删除文件（PowerShell）**

```powershell
Remove-Item -Recurse src\components\fitness
Remove-Item src\lib\fitness-theme.ts
Remove-Item tests\fitness.test.ts, tests\fitness-store.test.ts, tests\fitness-store-slice.test.ts, tests\fitness-body-plan.test.tsx, tests\fitness-weight-view.test.tsx, tests\fitness-trend-chart.test.tsx
```

- [ ] **Step 2: 验证**

Run: `npm run build`
Expected: PASS
Run: `npx vitest run tests/notepad.test.ts`
Expected: PASS（健身字符串是分类猜测用例，不受影响）

- [ ] **Step 3: Commit**

```bash
git add -A src tests
git commit -m "refactor(fitness): 删除 fitness 组件目录、theme 与 6 个单元测试"
```

---

### Task 3: Store 拆除与 briefingSource 回退

**Files:**
- Modify: `src/store/index.ts`（L19 import、L131-137 接口、L556 初始值、L624 校验、L1013-1018 实现）

**Interfaces:**
- Consumes: Task 1/2 后 `loadFitness` / `saveFitnessRecord` 等已无任何调用方
- Produces: store 无 `fitnessData` state 与 6 个 fitness action；`briefingSource` 校验白名单只剩 `'anthropic' | 'writing'`，旧值 `'fitness'` 回落 `'writing'`

- [ ] **Step 1: 删 L19 import 行**

```ts
  FitnessData, FitnessRecord, BodyMetric, FitnessRoutine, FitnessScheduleEntry,
```

- [ ] **Step 2: 删接口中 L131-137**

```ts
  fitnessData: FitnessData | null
  loadFitness: () => Promise<void>
  saveFitnessRecord: (rec: FitnessRecord) => Promise<void>
  deleteFitnessRecord: (id: string) => Promise<void>
  saveBodyMetric: (m: BodyMetric) => Promise<void>
  deleteBodyMetric: (date: string) => Promise<void>
  saveFitnessPlan: (routines: FitnessRoutine[], schedule: FitnessScheduleEntry[]) => Promise<void>
```

- [ ] **Step 3: 删初始值 L556**

```ts
  fitnessData: null,
```

- [ ] **Step 4: 改 L624 校验（迁移关键点）**

```ts
// 改前
briefingSource: state.briefingSource === 'anthropic' || state.briefingSource === 'writing' || state.briefingSource === 'fitness' ? state.briefingSource : 'writing',
// 改后
briefingSource: state.briefingSource === 'anthropic' || state.briefingSource === 'writing' ? state.briefingSource : 'writing',
```

- [ ] **Step 5: 删实现 L1013-1018**

```ts
  loadFitness: async () => { set({ fitnessData: await ipc.fitnessLoad() }) },
  saveFitnessRecord: async (rec) => { set({ fitnessData: await ipc.fitnessSaveRecord(rec) }) },
  deleteFitnessRecord: async (id) => { set({ fitnessData: await ipc.fitnessDeleteRecord(id) }) },
  saveBodyMetric: async (m) => { set({ fitnessData: await ipc.fitnessSaveBodyMetric(m) }) },
  deleteBodyMetric: async (date) => { set({ fitnessData: await ipc.fitnessDeleteBodyMetric(date) }) },
  saveFitnessPlan: async (routines, schedule) => { set({ fitnessData: await ipc.fitnessSavePlan({ routines, schedule }) }) },
```

- [ ] **Step 6: 验证编译**

Run: `npm run build`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/store/index.ts
git commit -m "refactor(fitness): store 移除 fitnessData 与 6 个 action，briefingSource 旧值回落 writing"
```

---

### Task 4: 主进程、Preload、facade 与 IpcApi 声明拆除

**Files:**
- Modify: `electron/ipc/index.ts`（L16 import、L32 注册调用）
- Modify: `electron/preload.ts`（L30-35 桥接）
- Modify: `src/lib/ipc.ts`（L23-28 facade getter）
- Modify: `src/types/index.ts`（仅 `IpcApi` 中 L592-597 六个 fitness 方法声明——与 preload 同批，否则 `const api: IpcApi` 显式标注必报 TS2741）
- Delete: `electron/ipc/fitness.ts`、`electron/lib/fitness-store.ts`、`src/lib/fitness.ts`、`tests/fitness-ipc-shape.test.ts`

**Interfaces:**
- Consumes: Task 3 后 store 已不调用 facade；Task 2 后无组件依赖
- Produces: IPC 通道 `fitness:*` 全部下线；facade 与 `IpcApi` 均无 fitness 方法；`FitnessData` 等类型定义仍在（Task 5 清），但已无人引用

- [ ] **Step 1: 改 `electron/ipc/index.ts` 两处**

删除 L16：

```ts
import { registerFitnessIpc } from './fitness'
```

删除 `registerAllIpc` 内的注册行：

```ts
  registerFitnessIpc()
```

- [ ] **Step 2: 改 `electron/preload.ts`，删 L30-35**

```ts
  fitnessLoad: () => ipcRenderer.invoke('fitness:load'),
  fitnessSaveRecord: (r) => ipcRenderer.invoke('fitness:saveRecord', r),
  fitnessDeleteRecord: (id) => ipcRenderer.invoke('fitness:deleteRecord', id),
  fitnessSaveBodyMetric: (m) => ipcRenderer.invoke('fitness:saveBodyMetric', m),
  fitnessDeleteBodyMetric: (date) => ipcRenderer.invoke('fitness:deleteBodyMetric', date),
  fitnessSavePlan: (p) => ipcRenderer.invoke('fitness:savePlan', p),
```

- [ ] **Step 3: 改 `src/lib/ipc.ts`，删 L23-28**

```ts
  get fitnessLoad() { return ensure().fitnessLoad },
  get fitnessSaveRecord() { return ensure().fitnessSaveRecord },
  get fitnessDeleteRecord() { return ensure().fitnessDeleteRecord },
  get fitnessSaveBodyMetric() { return ensure().fitnessSaveBodyMetric },
  get fitnessDeleteBodyMetric() { return ensure().fitnessDeleteBodyMetric },
  get fitnessSavePlan() { return ensure().fitnessSavePlan },
```

- [ ] **Step 4: 改 `src/types/index.ts`，删 `IpcApi` 中六个方法声明（必须与 Step 2 同批）**

```ts
  fitnessLoad: () => Promise<FitnessData>
  fitnessSaveRecord: (r: FitnessRecord) => Promise<FitnessData>
  fitnessDeleteRecord: (id: string) => Promise<FitnessData>
  fitnessSaveBodyMetric: (m: BodyMetric) => Promise<FitnessData>
  fitnessDeleteBodyMetric: (date: string) => Promise<FitnessData>
  fitnessSavePlan: (p: { routines: FitnessRoutine[]; schedule: FitnessScheduleEntry[] }) => Promise<FitnessData>
```

- [ ] **Step 5: 删除文件（与 Step 1-4 同一批完成，保持可编译）**

```powershell
Remove-Item electron\ipc\fitness.ts, electron\lib\fitness-store.ts, src\lib\fitness.ts, tests\fitness-ipc-shape.test.ts
```

> `tests/fitness-ipc-shape.test.ts` 测的是 facade 六个 fitness getter 存在性，facade 已删，测试必删。

- [ ] **Step 6: 验证编译**

Run: `npm run build`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add -A electron src tests
git commit -m "refactor(fitness): 下线 fitness IPC 通道、preload 桥接、facade 与 IpcApi 声明"
```

---

### Task 5: 剩余类型清理（tsc 兜底扫描）

**Files:**
- Modify: `src/types/index.ts`（L467 BriefingSourceId、L469-484 Fitness 类型块）

**Interfaces:**
- Consumes: Task 1-4 已移除全部使用方（含 `IpcApi` 方法声明）
- Produces: `BriefingSourceId = 'writing' | 'anthropic'`；`FitnessData` / `FitnessRecord` / `BodyMetric` / `FitnessRoutine` / `FitnessScheduleEntry` 等类型不复存在

- [ ] **Step 1: 改 L467**

```ts
// 改前
export type BriefingSourceId = 'writing' | 'anthropic' | 'fitness'
// 改后
export type BriefingSourceId = 'writing' | 'anthropic'
```

- [ ] **Step 2: 删 L469-484 整个类型块**

```ts
export type FitnessSet = { weight: number; reps: number }
export type FitnessExercise = { id: string; name: string; sets: number }
export type FitnessRoutine = { id: string; name: string; exercises: FitnessExercise[] }
export type FitnessScheduleEntry = { weekday: number; routineId: string }
export type FitnessRecordEntry = { exerciseId: string; name: string; sets: FitnessSet[] }
export type FitnessRecord = { id: string; date: string; routineId: string; entries: FitnessRecordEntry[] }
export type BodyMetric = {
  date: string
  weight?: number; chest?: number; waist?: number; hip?: number; arm?: number; thigh?: number
}
export type FitnessData = {
  version: 1
  routines: FitnessRoutine[]
  schedule: FitnessScheduleEntry[]
  records: FitnessRecord[]
  bodyMetrics: BodyMetric[]
}
```

- [ ] **Step 3: tsc 全网扫描验证**

Run: `npm run build`
Expected: PASS。tsc 会报出任何残留引用——若有报错，逐个清理（预期没有）。

Run: `rg -i "fitness" src electron tests`
Expected: 只剩 `tests/notepad.test.ts` 的分类猜测字符串（保留项）。

- [ ] **Step 4: Commit**

```bash
git add src/types/index.ts
git commit -m "refactor(fitness): types 清理 BriefingSourceId 与 Fitness 类型块"
```

---

### Task 6: E2E 层清理

**Files:**
- Delete: `e2e/specs/fitness.spec.ts`
- Modify: `e2e/helpers/selectors.ts`（L266-273 fitness 块）
- Modify: `e2e/helpers/test-library.ts`（L513-517 `seedFitnessJson`）
- Modify: `e2e/source-map.json`（L194-204 fitness group）

**Interfaces:**
- Consumes: 无
- Produces: source-map 无 fitness group；`e2e-changed.js` 无 orphan spec WARNING（已验证：e2e-changed 的 sources glob 只做单向 minimatch 不向磁盘解析，spec 与 group 同批删除无悬挂 pattern）

- [ ] **Step 1: 删 spec 与 helpers**

```powershell
Remove-Item e2e\specs\fitness.spec.ts
```

`e2e/helpers/selectors.ts` 删除：

```ts
  fitness: {
    sourceButton: '[data-testid="briefing-source-fitness"]',
    panel: '[data-testid="fitness-panel"]',
    recordButton: '[data-testid="fitness-record-button"]',
    recordSave: '[data-testid="fitness-record-save"]',
    bodySave: '[data-testid="fitness-body-save"]',
    faceBody: '[data-testid="fitness-face-body"]',
  },
```

`e2e/helpers/test-library.ts` 删除：

```ts
export function seedFitnessJson(configDir: string, data: unknown): string {
  const file = path.join(configDir, 'fitness.json')
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8')
  return file
}
```

- [ ] **Step 2: 改 `e2e/source-map.json`，删 fitness group**

```json
    "fitness": {
      "sources": [
        "src/components/fitness/**",
        "src/lib/fitness.ts",
        "src/lib/fitness-theme.ts",
        "electron/ipc/fitness.ts",
        "electron/lib/fitness-store.ts"
      ],
      "specs": [
        "fitness.spec.ts"
      ]
    },
```

（删除后注意前后 group 闭合括号间的逗号衔接，保持 JSON 合法——可用 `node -e "JSON.parse(require('fs').readFileSync('e2e/source-map.json','utf8'))"` 快速校验。）

- [ ] **Step 3: 验证**

Run: `node scripts/e2e-changed.js`
Expected: 无 orphan spec WARNING；输出列表中无 fitness.spec
Run: `npx playwright test --config e2e/playwright.config.ts --list`
Expected: 列表无 fitness.spec.ts

- [ ] **Step 4: Commit**

```bash
git add -A e2e
git commit -m "test(fitness): 移除 fitness e2e spec、helpers 与 source-map group"
```

---

### Task 7: 文档删除与最终验证

**Files:**
- Delete: `docs/superpowers/specs/2026-10-08-fitness-tracking-design.md`
- Delete: `docs/superpowers/plans/2026-10-08-fitness-tracking.md`

- [ ] **Step 1: 删除文档**

```powershell
Remove-Item docs\superpowers\specs\2026-10-08-fitness-tracking-design.md, docs\superpowers\plans\2026-10-08-fitness-tracking.md
```

- [ ] **Step 2: 最终全量验证**

Run: `npm run build`
Expected: PASS

Run: `npm run test:e2e:changed`（= `node scripts/e2e-changed.js --run`，自动先构建）
Expected: 命中 briefing/notes/settings 等相关 group 的 specs 全 PASS

Run: `rg -i "fitness" src electron e2e tests --glob "!tests/notepad.test.ts"`
Expected: 无输出

- [ ] **Step 3: 手动冒烟（可选但推荐）**

`npm run dev` 启动 → 夜航简报侧栏只剩「写作 / 博客」两个来源 → 切换正常。若用户 state.json 里 `briefingSource` 恰为 `'fitness'`，启动后应自动落到「写作」。

- [ ] **Step 4: Commit**

```bash
git add -A docs
git commit -m "docs(fitness): 移除健身跟踪 spec 与实现计划文档"
```

---

## 附：不在范围内（明确不做）

- 不删 `~/.studyparlor/fitness.json`（用户数据残留，无害）
- 不动 `tests/notepad.test.ts:37` 的健身字符串
- 不改历史文档中的健身时间线引用
- 不为 `briefingSource` 写 state.json 迁移逻辑（校验回落已覆盖）
