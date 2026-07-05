# DIY 仪式术语实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完成 DIY 仪式术语功能，让用户可在扩展页自定义 Study Parlor 前端仪式术语与参数标签，并实时反映到首页、学习、侧写、预学习弹窗和扩展页本身。

**Architecture:** 扩展 `StateJson.terminology`（已存在）为结构化类型；渲染层通过统一的 `useTerminology()` helper 将用户覆盖项与 `DEFAULT_TERMINOLOGY` 合并；`getDifficultyLabel` / `getTemperatureLabel` 接收可选术语映射；扩展页重构为侧边栏导航，「我的语言」作为第一个 tab。

**Tech Stack:** Electron 30 + React 18 + TypeScript + Tailwind CSS + Zustand + Vitest

---

## 当前状态（2026-06-27）

- ✅ `Terminology` 类型已改为结构化 key
- ✅ `src/lib/terminology-defaults.ts` 已填充默认值
- ✅ `src/lib/terminology.ts` helper 已完成
- ✅ `getDifficultyLabel` / `getTemperatureLabel` 已支持自定义术语
- ✅ Store 状态、init、patch、reset 已验证
- ✅ `Home / Study / Profile / PreStudyModal` 已迁移
- ✅ 扩展页已重构为侧边栏导航并新增「我的语言」面板
- ✅ `tests/terminology.test.ts` 与 store 持久化测试已补充
- ✅ `npm run test` 与 `npm run build` 通过

---

## 文件结构

| 文件 | 变更 | 职责 |
|------|------|------|
| `src/types/index.ts` | Modify | `Terminology` 结构化类型定义 |
| `src/lib/terminology-defaults.ts` | Modify | 所有默认术语常量 |
| `src/lib/terminology.ts` | Modify（已存在） | `getTerminology` / `useTerminology` helper |
| `src/lib/difficulty-label.ts` | Modify | 支持自定义难度等级术语 |
| `src/lib/temperature-label.ts` | Modify | 支持自定义温度等级术语 |
| `src/store/index.ts` | Verify / minor update | 接入 `terminology` 状态、init、patch、reset（已存在） |
| `src/pages/Home.tsx` | Modify | 用 `useTerminology()` 替换首页硬编码文案 |
| `src/pages/Study.tsx` | Modify | 用 `useTerminology()` 替换模式标签和归档确认文案 |
| `src/pages/Profile.tsx` | Modify | 用 `useTerminology()` 替换标签和按钮文案 |
| `src/components/PreStudyModal.tsx` | Modify | 用 `useTerminology()` 替换弹窗内所有标签和按钮 |
| `src/pages/Extension.tsx` | Modify | 重构为侧边栏导航，新增「我的语言」面板 |
| `tests/terminology.test.ts` | Create | helper 回退、默认值、持久化、集成测试 |
| `tests/store.test.ts` | Verify | 确保 mock 中包含 `terminology: {}`（已存在） |

---

### Task 1: 数据模型与默认值

**Files:**
- Modify: `src/types/index.ts:6`
- Modify: `src/types/index.ts:155-167`
- Modify: `src/lib/terminology-defaults.ts`
- Modify: `src/lib/terminology.ts`

- [ ] **Step 1: Replace `Terminology` type with structured keys**

Replace the line at `src/types/index.ts:6`:

```ts
export type Terminology = Record<string, string>
```

with:

```ts
export type Terminology = {
  // 仪式动词
  sessionName?: string
  libraryName?: string
  archiveVerb?: string
  transcriptName?: string
  burnVerb?: string
  newTopicLabel?: string
  continuePrompt?: string
  unsavedSessionLabel?: string

  // 模式与流程
  modeProgress?: string
  modeReview?: string
  newTopicMode?: string
  existingTopicMode?: string
  archiveConfirmTitle?: string
  archiveDismiss?: string
  archiveConfirm?: string

  // 参数标签
  difficultyLabel?: string
  temperatureLabel?: string
  difficultyHigh?: string
  difficultyMid?: string
  difficultyLow?: string
  temperatureCold?: string
  temperatureNeutral?: string
  temperatureWarm?: string

  // 界面名词
  profileNameLabel?: string
  profileFieldLabel?: string
  profileTextLabel?: string
  topicInputLabel?: string
  subTopicLabel?: string
  continueDirectionLabel?: string
  requirementLabel?: string
  homeGreeting?: string
  startButton?: string
  cancelButton?: string
}
```

- [ ] **Step 2: Run type check to confirm no conflicts**

Run: `npx tsc --noEmit`
Expected: PASS (no new errors from type additions)

- [ ] **Step 3: Fill default terminology file**

Replace `src/lib/terminology-defaults.ts`:

```ts
import type { Terminology } from '@shared/index'

export const DEFAULT_TERMINOLOGY: Terminology = {
  // 仪式动词
  sessionName: '夜话',
  libraryName: '卷宗',
  archiveVerb: '封存',
  transcriptName: '笔录',
  burnVerb: '焚毁',
  newTopicLabel: '新的小径',
  continuePrompt: '推开下一扇门',
  unsavedSessionLabel: '中断的笔录',

  // 模式与流程
  modeProgress: '探索新知',
  modeReview: '复习检测',
  newTopicMode: '全新主题',
  existingTopicMode: '已有主题',
  archiveConfirmTitle: '是否封存？一旦归档，就不再更改。',
  archiveDismiss: '暂不封存',
  archiveConfirm: '封存。它从此成为档案。',

  // 参数标签
  difficultyLabel: '审讯强度',
  temperatureLabel: '腔调',
  difficultyHigh: '强',
  difficultyMid: '中',
  difficultyLow: '弱',
  temperatureCold: '坚硬',
  temperatureNeutral: '适中',
  temperatureWarm: '活泼',

  // 界面名词
  profileNameLabel: '代号',
  profileFieldLabel: '领域',
  profileTextLabel: '侧写',
  topicInputLabel: '今夜想学',
  subTopicLabel: '细分方向',
  continueDirectionLabel: '续谈方向',
  requirementLabel: '附加要求',
  homeGreeting: '晚安',
  startButton: '开始',
  cancelButton: '撤回',
}
```

- [ ] **Step 4: Update terminology helper**

Replace `src/lib/terminology.ts`:

```ts
import { useStore } from '@/store'
import { DEFAULT_TERMINOLOGY } from './terminology-defaults'
import type { Terminology } from '@shared/index'

export function getTerminology(custom: Terminology | undefined): Required<Terminology> {
  return { ...DEFAULT_TERMINOLOGY, ...(custom ?? {}) }
}

export function useTerminology(): Required<Terminology> {
  const custom = useStore(s => s.terminology)
  return getTerminology(custom)
}
```

- [ ] **Step 5: Run type check**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/types/index.ts src/lib/terminology-defaults.ts src/lib/terminology.ts
git commit -m "feat(terminology): add structured Terminology type, defaults and helper"
```

---

### Task 2: 参数标签 helper 支持自定义映射

**Files:**
- Modify: `src/lib/difficulty-label.ts`
- Modify: `src/lib/temperature-label.ts`
- Create: `tests/terminology.test.ts`

- [ ] **Step 1: Write failing test for custom difficulty/temperature labels**

Create `tests/terminology.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { getDifficultyLabel } from '@/lib/difficulty-label'
import { getTemperatureLabel } from '@/lib/temperature-label'
import { getTerminology } from '@/lib/terminology'
import { DEFAULT_TERMINOLOGY } from '@/lib/terminology-defaults'

describe('terminology helpers', () => {
  describe('getDifficultyLabel', () => {
    it('returns default labels without custom terminology', () => {
      expect(getDifficultyLabel('high')).toBe('强')
      expect(getDifficultyLabel('mid')).toBe('中')
      expect(getDifficultyLabel('low')).toBe('弱')
    })

    it('returns custom labels when provided', () => {
      const custom = {
        difficultyHigh: '困难',
        difficultyMid: '普通',
        difficultyLow: '简单'
      }
      expect(getDifficultyLabel('high', custom)).toBe('困难')
      expect(getDifficultyLabel('mid', custom)).toBe('普通')
      expect(getDifficultyLabel('low', custom)).toBe('简单')
    })
  })

  describe('getTemperatureLabel', () => {
    it('returns default labels without custom terminology', () => {
      expect(getTemperatureLabel(0.3)).toBe('坚硬')
      expect(getTemperatureLabel(0.7)).toBe('适中')
      expect(getTemperatureLabel(1.0)).toBe('活泼')
    })

    it('returns custom labels when provided', () => {
      const custom = {
        temperatureCold: '严肃',
        temperatureNeutral: '平衡',
        temperatureWarm: '轻松'
      }
      expect(getTemperatureLabel(0.3, custom)).toBe('严肃')
      expect(getTemperatureLabel(0.7, custom)).toBe('平衡')
      expect(getTemperatureLabel(1.0, custom)).toBe('轻松')
    })
  })

  describe('getTerminology', () => {
    it('merges custom overrides with defaults', () => {
      const merged = getTerminology({ sessionName: '炉边谈话' })
      expect(merged.sessionName).toBe('炉边谈话')
      expect(merged.libraryName).toBe(DEFAULT_TERMINOLOGY.libraryName)
    })

    it('returns all defaults when custom is undefined', () => {
      const merged = getTerminology(undefined)
      expect(merged).toEqual(DEFAULT_TERMINOLOGY)
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/terminology.test.ts`
Expected: FAIL — `getDifficultyLabel` / `getTemperatureLabel` do not accept second argument

- [ ] **Step 3: Update difficulty-label.ts**

Replace `src/lib/difficulty-label.ts`:

```ts
import type { Terminology } from '@shared/index'

export function getDifficultyLabel(
  d: 'high' | 'mid' | 'low',
  terminology?: Pick<Terminology, 'difficultyHigh' | 'difficultyMid' | 'difficultyLow'>
): string {
  if (d === 'high') return terminology?.difficultyHigh ?? '强'
  if (d === 'low') return terminology?.difficultyLow ?? '弱'
  return terminology?.difficultyMid ?? '中'
}
```

- [ ] **Step 4: Update temperature-label.ts**

Replace `src/lib/temperature-label.ts`:

```ts
import type { Terminology } from '@shared/index'

export function getTemperatureLabel(
  t: number,
  terminology?: Pick<Terminology, 'temperatureCold' | 'temperatureNeutral' | 'temperatureWarm'>
): string {
  if (t === 0.3) return terminology?.temperatureCold ?? '坚硬'
  if (t === 1.0) return terminology?.temperatureWarm ?? '活泼'
  return terminology?.temperatureNeutral ?? '适中'
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/terminology.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/difficulty-label.ts src/lib/temperature-label.ts tests/terminology.test.ts
git commit -m "feat(terminology): difficulty/temperature labels accept custom mapping"
```

---

### Task 3: 验证 Store 接入（已存在）

**Files:**
- Verify: `src/store/index.ts:64`
- Verify: `src/store/index.ts:192`
- Verify: `src/store/index.ts:215`
- Verify: `src/store/index.ts:562-570`
- Verify: `tests/store.test.ts`

- [ ] **Step 1: Confirm store type and import**

In `src/store/index.ts`, the `AppStore` type should include:

```ts
  terminology: Terminology
```

And the import from `@shared/index` should include `Terminology`.

If missing, add it.

- [ ] **Step 2: Confirm default state and init loading**

In `src/store/index.ts` store initial value:

```ts
  terminology: {},
```

In `init` `set({...})` call:

```ts
      terminology: state.terminology ?? {},
```

- [ ] **Step 3: Confirm actions exist**

In `src/store/index.ts`:

```ts
  patchTerminology: async (patch: Terminology) => {
    const next = { ...get().terminology, ...patch }
    set({ terminology: next })
    await ipc.patchState({ terminology: next } as Partial<StateJson>)
  },

  resetTerminology: async () => {
    set({ terminology: {} })
    await ipc.patchState({ terminology: {} } as Partial<StateJson>)
  },
```

- [ ] **Step 4: Confirm store test mocks include terminology**

In `tests/store.test.ts`, every `ipc.getState` mock object should end with:

```ts
        terminology: {}
```

If any mock lacks it, add it.

- [ ] **Step 5: Run store tests**

Run: `npx vitest run tests/store.test.ts`
Expected: PASS

- [ ] **Step 6: Commit (only if changes made)**

```bash
git add src/store/index.ts tests/store.test.ts
git commit -m "feat(terminology): verify terminology state and persistence in store"
```

---

### Task 4: 迁移 Home 文案

**Files:**
- Modify: `src/pages/Home.tsx`

- [ ] **Step 1: Replace hardcoded labels with useTerminology**

At the top of `src/pages/Home.tsx`, add:

```ts
import { useTerminology } from '@/lib/terminology'
```

Inside the component, after existing `useStore` selectors, add:

```ts
  const t = useTerminology()
```

- [ ] **Step 2: Replace labels**

| 原硬编码 | 替换为 |
|----------|--------|
| 按钮 `卷宗` | `{t.libraryName}` |
| `晚安，{profile.name}` | `{t.homeGreeting}，{profile.name}` |
| `中断的笔录` | `{t.unsavedSessionLabel}` |
| `焚毁` | `{t.burnVerb}` |
| `新的小径` | `{t.newTopicLabel}` |
| 「推开下一扇门」小标题 | `{t.continuePrompt}` |
| 右侧「学习库」标题 | `{t.libraryName}` |

- [ ] **Step 3: Run type check**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/pages/Home.tsx
git commit -m "feat(terminology): migrate Home page labels"
```

---

### Task 5: 迁移 Study 文案

**Files:**
- Modify: `src/pages/Study.tsx`

- [ ] **Step 1: Add useTerminology import and usage**

At the top of `src/pages/Study.tsx`, add:

```ts
import { useTerminology } from '@/lib/terminology'
```

Inside the component, after `const session = useStore(s => s.session)`:

```ts
  const t = useTerminology()
```

- [ ] **Step 2: Replace labels**

1. 顶部模式标签：
   ```tsx
   {session.mode === 'progress' ? t.modeProgress : t.modeReview} ·
   {getDifficultyLabel(session.difficulty, t)} ·
   {t.temperatureLabel}={getTemperatureLabel(session.temperature, t)}
   ```

2. 归档确认横幅：
   ```tsx
   <span>{t.archiveConfirmTitle}</span>
   ```

3. 归档确认按钮：
   ```tsx
   <Button variant="ghost" onClick={() => useStore.getState().dismissArchive()}>
     {t.archiveDismiss}
   </Button>
   <Button onClick={onEnd}>{t.archiveConfirm}</Button>
   ```

- [ ] **Step 3: Run type check**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/pages/Study.tsx
git commit -m "feat(terminology): migrate Study page labels"
```

---

### Task 6: 迁移 Profile 文案

**Files:**
- Modify: `src/pages/Profile.tsx`

- [ ] **Step 1: Add useTerminology import and usage**

At the top of `src/pages/Profile.tsx`, add:

```ts
import { useTerminology } from '@/lib/terminology'
```

Inside the component, after `const showToast = useStore(s => s.showToast)`:

```ts
  const t = useTerminology()
```

- [ ] **Step 2: Replace labels in read-only view**

| 原硬编码 | 替换为 |
|----------|--------|
| `代号` | `{t.profileNameLabel}` |
| `领域` | `{t.profileFieldLabel}` |
| `侧写` | `{t.profileTextLabel}` |
| `审讯强度` | `{t.difficultyLabel}` |
| 难度值 | `{getDifficultyLabel(lastUsed.difficulty, t)}` |
| `腔调` | `{t.temperatureLabel}` |
| 温度值 | `{getTemperatureLabel(lastUsed.temperature, t)}` |

- [ ] **Step 3: Replace labels in edit view**

| 原硬编码 | 替换为 |
|----------|--------|
| 代号输入标签 | `{t.profileNameLabel}` |
| `你是谁` | `{t.profileTextLabel}` |
| 领域输入标签 | `{t.profileFieldLabel}` |
| 审讯强度选择标签 | `{t.difficultyLabel}` |
| 难度按钮文字 | `{getDifficultyLabel(d, t)}` |
| 腔调选择标签 | `{t.temperatureLabel}` |
| 温度按钮文字 | `{getTemperatureLabel(temp, t)}` |

注意：若循环变量 `t` 与 `useTerminology()` 的 `t` 冲突，将温度循环变量重命名为 `temp`：

```tsx
{[0.3, 0.7, 1.0].map(temp => (
  <button key={temp} ...>{getTemperatureLabel(temp, t)}</button>
))}
```

- [ ] **Step 4: Run type check**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/pages/Profile.tsx
git commit -m "feat(terminology): migrate Profile page labels"
```

---

### Task 7: 迁移 PreStudyModal 文案

**Files:**
- Modify: `src/components/PreStudyModal.tsx`

- [ ] **Step 1: Add useTerminology import**

Add to imports:

```ts
import { useTerminology } from '@/lib/terminology'
```

- [ ] **Step 2: Add terminology usage**

Inside the component, after `const showToast = useStore(s => s.showToast)`:

```ts
  const t = useTerminology()
```

- [ ] **Step 3: Replace mode toggle labels**

| 原硬编码 | 替换为 |
|----------|--------|
| `全新主题` | `{t.newTopicMode}` |
| `已有主题` | `{t.existingTopicMode}` |
| 模式提示文字 | `{args.mode === 'progress' ? t.modeProgress : t.modeReview}` |

- [ ] **Step 4: Replace topic input labels**

| 原硬编码 | 替换为 |
|----------|--------|
| 选择已有主题标签 | `{t.topicInputLabel}` |
| `细分方向` | `{t.subTopicLabel}` |
| `今夜想学` | `{t.topicInputLabel}` |

- [ ] **Step 5: Replace continue suggestion and requirement labels**

| 原硬编码 | 替换为 |
|----------|--------|
| `续谈方向` | `{t.continueDirectionLabel}` |
| `附加要求` | `{t.requirementLabel}` |

- [ ] **Step 6: Replace difficulty/temperature labels and button values**

| 原硬编码 | 替换为 |
|----------|--------|
| `审讯强度` | `{t.difficultyLabel}` |
| 难度按钮 | `{getDifficultyLabel(d, t)}` |
| `腔调` | `{t.temperatureLabel}` |
| 温度按钮 | `{getTemperatureLabel(temp, t)}` |

注意变量名冲突：将温度循环变量重命名为 `temp`：

```tsx
{[0.3, 0.7, 1.0].map(temp => (
  <button key={temp} ...>{getTemperatureLabel(temp, t)}</button>
))}
```

- [ ] **Step 7: Replace action buttons**

| 原硬编码 | 替换为 |
|----------|--------|
| `撤回` | `{t.cancelButton}` |
| `开始` | `{t.startButton}` |

- [ ] **Step 8: Run type check and tests**

Run: `npx tsc --noEmit`
Expected: PASS

Run: `npx vitest run tests/terminology.test.ts`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add src/components/PreStudyModal.tsx
git commit -m "feat(terminology): migrate PreStudyModal labels"
```

---

### Task 8: 扩展页重构与「我的语言」面板

**Files:**
- Modify: `src/pages/Extension.tsx`

- [ ] **Step 1: Rewrite Extension.tsx as sidebar navigation**

Replace the entire content of `src/pages/Extension.tsx` with the implementation from `docs/superpowers/specs/2026-06-22-diy-terminology-design.md` section 8.

The new page must include:
- Sidebar tabs: 我的语言 / 自选配图 / 学习库 / 本地 Agent 打通
- `TerminologyPanel` with four collapsible groups (ritual verbs, flow, params, UI nouns)
- Real-time preview card
- Existing paintings / library / agent content preserved in detail panels

- [ ] **Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/pages/Extension.tsx
git commit -m "feat(terminology): refactor Extension page with sidebar and My Language panel"
```

---

### Task 9: 测试覆盖与回归验证

**Files:**
- Modify: `tests/terminology.test.ts`

- [ ] **Step 1: Add integration test for useTerminology**

Append to `tests/terminology.test.ts`:

```ts
import { act, renderHook } from '@testing-library/react'
import { useStore } from '@/store'
import { useTerminology } from '@/lib/terminology'
import { DEFAULT_TERMINOLOGY } from '@/lib/terminology-defaults'

describe('useTerminology integration', () => {
  it('reflects store terminology overrides', () => {
    act(() => {
      useStore.setState({ terminology: { sessionName: '炉边谈话' } })
    })
    const { result } = renderHook(() => useTerminology())
    expect(result.current.sessionName).toBe('炉边谈话')
    expect(result.current.libraryName).toBe(DEFAULT_TERMINOLOGY.libraryName)
  })
})
```

- [ ] **Step 2: Run terminology tests**

Run: `npx vitest run tests/terminology.test.ts`
Expected: PASS

- [ ] **Step 3: Run full test suite**

Run: `npm run test`
Expected: ALL PASS

- [ ] **Step 4: Run build**

Run: `npm run build`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/terminology.test.ts
git commit -m "test(terminology): add integration test and verify full suite"
```

---

## Self-Review

**1. Spec coverage:**

| 设计文档要求 | 实现任务 |
|--------------|----------|
| `Terminology` 类型与 `StateJson.terminology` | Task 1 |
| `DEFAULT_TERMINOLOGY` | Task 1 |
| `getTerminology` / `useTerminology` | Task 1 |
| 参数标签自定义 | Task 2 |
| Store init / patch / reset | Task 3 |
| Home 文案 | Task 4 |
| Study 文案 | Task 5 |
| Profile 文案 | Task 6 |
| PreStudyModal 文案 | Task 7 |
| 扩展页侧边栏导航 + 我的语言面板 | Task 8 |
| 测试 | Task 9 |

**2. Placeholder scan:**
- 无 TBD/TODO。
- 所有代码片段均为可直接写入文件的内容。
- 测试用例包含具体断言。

**3. Type consistency：**
- `Terminology` 字段名在类型、默认值、组件、扩展面板中保持一致。
- `getDifficultyLabel` / `getTemperatureLabel` 签名统一接收 `Pick<Terminology, ...>`，便于传递 `useTerminology()` 完整对象。
- Store action 名称：`patchTerminology`、`resetTerminology`。

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-06-27-diy-terminology.md`. Two execution options:**

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
