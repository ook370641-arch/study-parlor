# DIY 仪式术语实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让用户可以在扩展页自定义 Study Parlor 的前端仪式术语与参数标签，并实时反映到首页、学习、侧写、预学习弹窗和扩展页本身。

**Architecture:** 扩展 `StateJson` 增加 `terminology` 字段；渲染层通过统一的 `useTerminology()` helper 将用户覆盖项与 `DEFAULT_TERMINOLOGY` 合并；`getDifficultyLabel` / `getTemperatureLabel` 接收可选的术语映射。扩展页重构为侧边栏导航，「我的语言」作为第一个 tab，内部按四类折叠面板组织。

**Tech Stack:** Electron 30 + React 18 + TypeScript + Tailwind CSS + Zustand + Vitest

---

## File Structure

| 文件 | 变更 | 职责 |
|------|------|------|
| `src/types/index.ts` | Modify | 新增 `Terminology` 类型，扩展 `StateJson` |
| `src/lib/terminology-defaults.ts` | Create | 所有默认术语常量 |
| `src/lib/terminology.ts` | Create | `getTerminology` / `useTerminology` helper |
| `src/lib/difficulty-label.ts` | Modify | 支持自定义难度等级术语 |
| `src/lib/temperature-label.ts` | Modify | 支持自定义温度等级术语 |
| `src/store/index.ts` | Modify | 接入 `terminology` 状态、init、patch、reset |
| `src/pages/Home.tsx` | Modify | 用 `useTerminology()` 替换首页硬编码文案 |
| `src/pages/Study.tsx` | Modify | 用 `useTerminology()` 替换模式标签和归档确认文案 |
| `src/pages/Profile.tsx` | Modify | 用 `useTerminology()` 替换标签和按钮文案 |
| `src/components/PreStudyModal.tsx` | Modify | 用 `useTerminology()` 替换弹窗内所有标签和按钮 |
| `src/pages/Extension.tsx` | Modify | 重构为侧边栏导航，新增「我的语言」面板 |
| `tests/terminology.test.ts` | Create | helper 回退、默认值、持久化测试 |

---

### Task 1: 数据模型与默认值

**Files:**
- Modify: `src/types/index.ts`
- Create: `src/lib/terminology-defaults.ts`
- Create: `src/lib/terminology.ts`

- [ ] **Step 1: Add `Terminology` type and extend `StateJson`**

在 `src/types/index.ts` 的 `TopicContinueCache` 之后、`StateJson` 之前插入类型定义：

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

然后在 `StateJson` 末尾新增字段：

```ts
export type StateJson = {
  version: 1
  profile: Profile
  lastUsed: { difficulty: Difficulty; temperature: Temperature }
  groupInspirations: Record<string, NewTopic>
  wildcardInspiration?: NewTopic
  ui: { session_count: number }
  inspirationStrategy: 'v1' | 'v2' | 'v3'
  fableStyleTags: string[]
  lastFableTags: string[]
  topicContinueSuggestions: Record<string, TopicContinueCache>
  terminology?: Terminology
}
```

- [ ] **Step 2: Run type check to confirm no conflicts**

Run: `npx tsc --noEmit`
Expected: PASS (no new errors from type additions)

- [ ] **Step 3: Create default terminology file**

Create `src/lib/terminology-defaults.ts`：

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

- [ ] **Step 4: Create terminology helper**

Create `src/lib/terminology.ts`：

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

- [ ] **Step 5: Commit**

```bash
git add src/types/index.ts src/lib/terminology-defaults.ts src/lib/terminology.ts
git commit -m "feat(terminology): add Terminology type, defaults and helper"
```

---

### Task 2: 参数标签 helper 支持自定义映射

**Files:**
- Modify: `src/lib/difficulty-label.ts`
- Modify: `src/lib/temperature-label.ts`
- Create: `tests/terminology.test.ts`

- [ ] **Step 1: Write failing test for custom difficulty/temperature labels**

Create `tests/terminology.test.ts`：

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

Replace `src/lib/difficulty-label.ts`：

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

Replace `src/lib/temperature-label.ts`：

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

### Task 3: Store 接入 terminology

**Files:**
- Modify: `src/store/index.ts`

- [ ] **Step 1: Add `terminology` to AppStore type**

在 `src/store/index.ts` 的 `AppStore` 类型中，找到 `topicContinueSuggestions` 字段，在其下方新增：

```ts
  terminology: Terminology
```

同时确保 `AppStore` 的 import 包含 `Terminology`：

```ts
import type {
  Difficulty, Message, NewTopic, Profile, StateJson, Mode,
  TopicMeta, UnsavedSession, ArchiveResult, Group, GroupMapping,
  TopicContinueCache, BriefingResult, SearchResult, SearchSource, SearchErrorCode,
  Terminology
} from '@shared/index'
```

- [ ] **Step 2: Add default state and init loading**

在 store 对象初始值中，`topicContinueSuggestions: {}` 下方新增：

```ts
  terminology: {},
```

在 `init` 的 `set({...})` 调用中，添加：

```ts
      terminology: state.terminology ?? {},
```

- [ ] **Step 3: Add actions**

在 `setLastFableTags` action 之后、`addPendingArchive` 之前新增两个 action：

```ts
  patchTerminology: async (patch) => {
    const next = { ...get().terminology, ...patch }
    set({ terminology: next })
    await ipc.patchState({ terminology: next } as Partial<StateJson>)
  },

  resetTerminology: async () => {
    set({ terminology: {} })
    await ipc.patchState({ terminology: {} } as Partial<StateJson>)
  },
```

- [ ] **Step 4: Update store test to include terminology in getState mock**

在 `tests/store.test.ts` 中，所有 `ipc.getState` mock 对象末尾添加：

```ts
        terminology: {}
```

需要修改的 `describe('init')` 块中有两个 mock，分别添加。

- [ ] **Step 5: Run store tests**

Run: `npx vitest run tests/store.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/store/index.ts tests/store.test.ts
git commit -m "feat(terminology): add terminology state and persistence to store"
```

---

### Task 4: 迁移 Home 文案

**Files:**
- Modify: `src/pages/Home.tsx`

- [ ] **Step 1: Replace hardcoded labels with useTerminology**

在 `src/pages/Home.tsx` 顶部新增 import：

```ts
import { useTerminology } from '@/lib/terminology'
```

在组件内，所有 `useStore` selector 之后新增：

```ts
  const t = useTerminology()
```

然后替换以下文案：

| 原硬编码 | 替换为 |
|----------|--------|
| `卷宗` 按钮文字 | `{t.libraryName}` |
| `晚安，{profile.name}` | `{t.homeGreeting}，{profile.name}` |
| `中断的笔录` | `{t.unsavedSessionLabel}` |
| `继续` 恢复按钮 | `{t.continuePrompt}` 或保持 `继续`？按设计文档 `continuePrompt` 是「推开下一扇门」，属于首页模块标题，不是恢复按钮。恢复按钮保持 `继续` 不变。 |
| `焚毁` | `{t.burnVerb}` |
| `新的小径` | `{t.newTopicLabel}` |
| `推开下一扇门` 小标题 | `{t.continuePrompt}` |
| `学习库` 右侧标题 | `{t.libraryName}` |

具体修改点：

1. 按钮 `卷宗` → `{t.libraryName}`
2. 问候语：
   ```tsx
   <div className="relative z-[5] text-center text-parchment/60 font-sans text-sm mb-8">
     {t.homeGreeting}，{profile.name}
   </div>
   ```
3. 未保存会话标签：
   ```tsx
   <div className="text-xs text-parchment/50 font-sans mb-2">{t.unsavedSessionLabel}</div>
   ```
4. 焚毁按钮：
   ```tsx
   {t.burnVerb}
   ```
5. 新学习按钮：
   ```tsx
   {t.newTopicLabel}
   ```
6. 「推开下一扇门」标题：
   ```tsx
   <span className="text-xs text-parchment/40 font-sans">{t.continuePrompt}</span>
   ```
7. 右侧学习库标题：
   ```tsx
   <div className="text-xs text-parchment/40 font-sans mb-3">{t.libraryName}</div>
   ```

- [ ] **Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/pages/Home.tsx
git commit -m "feat(terminology): migrate Home page labels"
```

---

### Task 5: 迁移 Study 文案

**Files:**
- Modify: `src/pages/Study.tsx`

- [ ] **Step 1: Add useTerminology import and usage**

在 `src/pages/Study.tsx` 顶部新增 import：

```ts
import { useTerminology } from '@/lib/terminology'
```

在组件内，`const session = useStore(s => s.session)` 下方新增：

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

   注意：原代码是 `腔调={getTemperatureLabel(...)}`，这里 `腔调` 属于参数标签，改为 `{t.temperatureLabel}=`。

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

4. 返回夜话按钮（右上角）暂时保持 `退出` 不变；设计文档未开放此按钮。

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

在 `src/pages/Profile.tsx` 顶部新增 import：

```ts
import { useTerminology } from '@/lib/terminology'
```

在组件内，`const showToast = useStore(s => s.showToast)` 下方新增：

```ts
  const t = useTerminology()
```

- [ ] **Step 2: Replace labels in read-only view**

1. 代号：
   ```tsx
   <div className="text-[10px] text-parchment/50 font-sans uppercase tracking-wider mb-1">{t.profileNameLabel}</div>
   ```
2. 领域：
   ```tsx
   <div className="text-[10px] text-parchment/50 font-sans uppercase tracking-wider mb-1">{t.profileFieldLabel}</div>
   ```
3. 侧写：
   ```tsx
   <div className="text-[10px] text-parchment/50 font-sans uppercase tracking-wider mb-1">{t.profileTextLabel}</div>
   ```
4. 审讯强度：
   ```tsx
   <div className="text-[10px] text-parchment/50 font-sans uppercase tracking-wider mb-1">{t.difficultyLabel}</div>
   <div className="text-sm text-parchment">{getDifficultyLabel(lastUsed.difficulty, t)}</div>
   ```
5. 腔调：
   ```tsx
   <div className="text-[10px] text-parchment/50 font-sans uppercase tracking-wider mb-1">{t.temperatureLabel}</div>
   <div className="text-sm text-parchment">{getTemperatureLabel(lastUsed.temperature, t)}</div>
   ```

- [ ] **Step 3: Replace labels in edit view**

1. 代号输入标签：
   ```tsx
   <div className="text-[11px] text-parchment/60 font-sans mb-1">{t.profileNameLabel}</div>
   ```
2. 「你是谁」改为侧写：
   ```tsx
   <div className="text-[11px] text-parchment/60 font-sans mb-1">{t.profileTextLabel}</div>
   ```
3. 领域输入标签：
   ```tsx
   <div className="text-[11px] text-parchment/60 font-sans mb-1">{t.profileFieldLabel}</div>
   ```
4. 审讯强度选择标签：
   ```tsx
   <div className="text-[11px] text-parchment/60 font-sans mb-1">{t.difficultyLabel}</div>
   ```
   按钮文字：
   ```tsx
   {getDifficultyLabel(d, t)}
   ```
5. 腔调选择标签：
   ```tsx
   <div className="text-[11px] text-parchment/60 font-sans mb-1">{t.temperatureLabel}</div>
   ```
   按钮文字：
   ```tsx
   {getTemperatureLabel(t, terminology)}
   ```

   注意：循环变量 `t` 与 terminology 变量名冲突。将循环变量 temperature 重命名为 `temp`：
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

- [ ] **Step 1: Add useTerminology import and consolidate imports**

将现有 import 整理为：

```ts
import { useEffect, useRef, useState } from 'react'
import { useStore } from '@/store'
import { Button } from '@/components/Button'
import { Input } from '@/components/Input'
import type { ContinueTopicSuggestion, Difficulty } from '@shared/index'
import { getDifficultyLabel } from '@/lib/difficulty-label'
import { getTemperatureLabel } from '@/lib/temperature-label'
import { filterAndSortTopics } from '@/lib/filter-topics'
import { ipc } from '@/lib/ipc'
import { useTerminology } from '@/lib/terminology'
```

- [ ] **Step 2: Add terminology usage**

在组件内，`const showToast = useStore(s => s.showToast)` 下方新增：

```ts
  const t = useTerminology()
```

- [ ] **Step 3: Replace mode toggle labels**

1. 全新主题按钮：
   ```tsx
   {t.newTopicMode}
   ```
2. 已有主题按钮：
   ```tsx
   {t.existingTopicMode}
   ```
3. 模式提示文字：
   ```tsx
   {args.mode === 'progress' ? t.modeProgress : t.modeReview}
   ```

- [ ] **Step 4: Replace topic input labels**

1. 选择已有主题：
   ```tsx
   <div className="field-label mb-2">{t.topicInputLabel}</div>
   ```
   注意：原「选择已有主题」文案不在术语清单中，设计文档用 `topicInputLabel`（今夜想学）替代此处标签。如语义冲突，也可保留「选择已有主题」不变；但按设计文档统一替换为 `topicInputLabel`。

2. 细分方向：
   ```tsx
   <div className="field-label mb-2">{t.subTopicLabel}</div>
   ```
3. 今夜想学（新主题）：
   ```tsx
   <div className="field-label mb-2">{t.topicInputLabel}</div>
   ```

- [ ] **Step 5: Replace continue suggestion label**

```tsx
<div className="field-label mb-2">{t.continueDirectionLabel}</div>
```

- [ ] **Step 6: Replace requirement label**

```tsx
<div className="field-label mb-2">{t.requirementLabel}</div>
```

- [ ] **Step 7: Replace difficulty/temperature labels and button values**

1. 审讯强度：
   ```tsx
   <div className="field-label mb-2">{t.difficultyLabel}</div>
   ```
   按钮：
   ```tsx
   {getDifficultyLabel(d, t)}
   ```
2. 腔调：
   ```tsx
   <div className="field-label mb-2">{t.temperatureLabel}</div>
   ```
   按钮：
   ```tsx
   {getTemperatureLabel(t, terminology)}
   ```

   同样存在变量名冲突：循环变量 `t` 与 terminology 变量 `t` 冲突。将温度循环变量重命名为 `temp`：
   ```tsx
   {[0.3, 0.7, 1.0].map(temp => (
     <button key={temp} ...>{getTemperatureLabel(temp, t)}</button>
   ))}
   ```

- [ ] **Step 8: Replace action buttons**

```tsx
<Button variant="ghost" onClick={closePreStudy}>{t.cancelButton}</Button>
<Button onClick={onConfirm}>{t.startButton}</Button>
```

- [ ] **Step 9: Run type check and tests**

Run: `npx tsc --noEmit`
Expected: PASS

Run: `npx vitest run tests/terminology.test.ts`
Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add src/components/PreStudyModal.tsx
git commit -m "feat(terminology): migrate PreStudyModal labels"
```

---

### Task 8: 扩展页重构与「我的语言」面板

**Files:**
- Modify: `src/pages/Extension.tsx`

- [ ] **Step 1: Rewrite Extension.tsx as sidebar navigation**

完整替换 `src/pages/Extension.tsx` 为以下实现：

```tsx
import { useEffect, useRef, useState } from 'react'
import { useStore } from '@/store'
import { SurfaceBackground } from '@/components/SurfaceBackground'
import { SwapPaintingButton } from '@/components/SwapPaintingButton'
import { useTerminology } from '@/lib/terminology'
import { DEFAULT_TERMINOLOGY } from '@/lib/terminology-defaults'
import { ipc } from '@/lib/ipc'
import type { Terminology } from '@shared/index'

type TabId = 'language' | 'paintings' | 'library' | 'agent'

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: 'language', label: '我的语言', icon: '🪶' },
  { id: 'paintings', label: '自选配图', icon: '🖼️' },
  { id: 'library', label: '学习库', icon: '📁' },
  { id: 'agent', label: '本地 Agent 打通', icon: '⚡' },
]

const GROUPS: { key: string; title: string; fields: (keyof Terminology)[] }[] = [
  {
    key: 'ritual',
    title: '仪式动词',
    fields: [
      'sessionName',
      'libraryName',
      'archiveVerb',
      'transcriptName',
      'burnVerb',
      'newTopicLabel',
      'continuePrompt',
      'unsavedSessionLabel',
    ],
  },
  {
    key: 'flow',
    title: '模式与流程',
    fields: [
      'modeProgress',
      'modeReview',
      'newTopicMode',
      'existingTopicMode',
      'archiveConfirmTitle',
      'archiveDismiss',
      'archiveConfirm',
    ],
  },
  {
    key: 'params',
    title: '参数标签',
    fields: [
      'difficultyLabel',
      'temperatureLabel',
      'difficultyHigh',
      'difficultyMid',
      'difficultyLow',
      'temperatureCold',
      'temperatureNeutral',
      'temperatureWarm',
    ],
  },
  {
    key: 'ui',
    title: '界面名词',
    fields: [
      'profileNameLabel',
      'profileFieldLabel',
      'profileTextLabel',
      'topicInputLabel',
      'subTopicLabel',
      'continueDirectionLabel',
      'requirementLabel',
      'homeGreeting',
      'startButton',
      'cancelButton',
    ],
  },
]

function TerminologyPanel() {
  const t = useTerminology()
  const custom = useStore(s => s.terminology)
  const patchTerminology = useStore(s => s.patchTerminology)
  const resetTerminology = useStore(s => s.resetTerminology)
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    ritual: true,
    flow: true,
    params: true,
    ui: false,
  })

  const update = (key: keyof Terminology, value: string) => {
    const next = { ...custom }
    if (value.trim() === '' || value.trim() === DEFAULT_TERMINOLOGY[key]) {
      delete next[key]
    } else {
      next[key] = value.trim()
    }
    patchTerminology(next)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-serif font-semibold text-ember">我的语言</h3>
        <button
          onClick={() => resetTerminology()}
          className="text-xs text-parchment/50 hover:text-parchment font-sans"
        >
          全部恢复默认
        </button>
      </div>

      {GROUPS.map(group => (
        <div key={group.key} className="border border-slate/20 rounded-lg overflow-hidden">
          <button
            onClick={() => setOpenGroups(g => ({ ...g, [group.key]: !g[group.key] }))}
            className="w-full flex items-center justify-between px-4 py-2.5 bg-parchment/5 hover:bg-parchment/10 transition-colors"
          >
            <span className="text-sm font-medium text-parchment">{group.title}</span>
            <span className="text-xs text-parchment/50">{openGroups[group.key] ? '收起' : '展开'}</span>
          </button>
          {openGroups[group.key] && (
            <div className="px-4 py-3 space-y-2.5">
              {group.fields.map(field => {
                const defaultValue = DEFAULT_TERMINOLOGY[field]
                const currentValue = t[field]
                const isCustom = custom[field] !== undefined
                return (
                  <div key={field} className="grid grid-cols-[1fr_1fr_auto] gap-3 items-center">
                    <div className="text-xs text-parchment/40 font-sans truncate" title={defaultValue}>
                      {defaultValue}
                    </div>
                    <input
                      type="text"
                      value={currentValue}
                      onChange={e => update(field, e.target.value)}
                      className="bg-ink/50 border border-slate/30 rounded px-2 py-1 text-sm text-parchment focus:outline-none focus:border-ember/50"
                    />
                    {isCustom && (
                      <button
                        onClick={() => update(field, defaultValue)}
                        className="text-[11px] text-parchment/40 hover:text-ember font-sans"
                      >
                        恢复
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      ))}

      <div className="bg-ink/40 border border-slate/20 rounded-lg p-4">
        <div className="text-[11px] text-parchment/40 font-sans mb-1.5">实时预览</div>
        <div className="text-sm text-parchment/80 font-sans">
          进入 <span className="text-ember">{t.sessionName}</span> · 打开 <span className="text-ember">{t.libraryName}</span> ·{' '}
          <span className="text-ember">{t.difficultyLabel}</span>：<span className="text-ember">{t.difficultyHigh}</span>
        </div>
      </div>
    </div>
  )
}

function PaintingsPanel({ paintingCount }: { paintingCount: number }) {
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-serif font-semibold text-ember">自选配图</h3>
      <div className="text-sm text-parchment/70 space-y-2">
        <p>支持手动增删配图，当前共 {paintingCount} 张。</p>
        <p className="text-xs text-parchment/50 mt-3">添加步骤：</p>
        <ol className="list-decimal list-inside text-xs text-parchment/60 space-y-1 pl-1">
          <li>把图片文件（.jpg / .png）放入项目根目录的 <code className="bg-ink px-1 rounded">Pictures/</code> 文件夹</li>
          <li>编辑 <code className="bg-ink px-1 rounded">Pictures/index.json</code>，在数组末尾追加一个 JSON 对象</li>
          <li>保存文件，重启应用生效</li>
        </ol>
        <div className="bg-ink/40 rounded-md p-3 mt-2 font-mono text-[11px] text-parchment/50 leading-relaxed">
{`{
  "id": "custom-1",
  "painter": "你的名字",
  "title": "作品名",
  "file": "文件名.jpg",
  "category": "custom",
  "year": 2026
}`}
        </div>
        <table className="w-full text-[11px] mt-2 border-collapse">
          <thead>
            <tr className="text-ember border-b border-slate/20">
              <th className="text-left py-1">字段</th>
              <th className="text-left py-1">必填</th>
              <th className="text-left py-1">说明</th>
            </tr>
          </thead>
          <tbody className="text-parchment/50">
            <tr className="border-b border-slate/10"><td className="py-1"><code className="bg-ink px-1 rounded">id</code></td><td className="text-ember">✓</td><td>唯一标识，任意字符串</td></tr>
            <tr className="border-b border-slate/10"><td className="py-1"><code className="bg-ink px-1 rounded">file</code></td><td className="text-ember">✓</td><td>图片文件名，必须和 Pictures/ 下的实际文件一致</td></tr>
            <tr className="border-b border-slate/10"><td className="py-1"><code className="bg-ink px-1 rounded">title</code></td><td className="text-ember">✓</td><td>作品名，在应用中显示</td></tr>
            <tr className="border-b border-slate/10"><td className="py-1"><code className="bg-ink px-1 rounded">painter</code></td><td className="text-parchment/30">—</td><td>作者名，显示在画面左下角。可写任意值</td></tr>
            <tr className="border-b border-slate/10"><td className="py-1"><code className="bg-ink px-1 rounded">category</code></td><td className="text-parchment/30">—</td><td>分类标签，仅用于筛选。可写 custom 或其他任意值</td></tr>
            <tr><td className="py-1"><code className="bg-ink px-1 rounded">year</code></td><td className="text-parchment/30">—</td><td>年份，填 null 或任意数字均可</td></tr>
          </tbody>
        </table>
        <p className="text-[11px] text-parchment/40 italic mt-2">
          删除配图：从 Pictures/ 移除图片文件，同时从 index.json 删除对应条目，重启生效。
        </p>
      </div>
    </div>
  )
}

function LibraryPanel({ libraryPath }: { libraryPath: string }) {
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-serif font-semibold text-ember">学习库</h3>
      <div className="text-sm text-parchment/70 space-y-2">
        <div className="flex items-center gap-2">
          <span>根目录：</span>
          <code className="bg-ink px-2 py-0.5 rounded text-xs text-parchment/60">{libraryPath}</code>
        </div>
        <div className="bg-ink/40 border-l-2 border-ember/50 pl-3 py-2 text-xs text-parchment/50">
          📌 扩展原理：所有学习内容统一保存到这里。<br />
          学习报告（study）、复习记录、寓言故事（fable）、流程图 —— 全部写入本目录，应用自动扫描显示。
        </div>
      </div>
    </div>
  )
}

function AgentPanel() {
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-serif font-semibold text-ember">本地 Agent 打通</h3>
      <div className="text-sm text-parchment/70 space-y-2">
        <p>已安装 skill：<code className="bg-ink px-1 rounded text-xs">study</code>、<code className="bg-ink px-1 rounded text-xs">fable</code></p>
        <p className="text-xs text-parchment/50">使用步骤：</p>
        <ol className="list-decimal list-inside text-xs text-parchment/60 space-y-1 pl-1">
          <li>把项目 <code className="bg-ink px-1 rounded">.claude/skills/</code> 下的 <code className="bg-ink px-1 rounded">study/</code> 和 <code className="bg-ink px-1 rounded">fable/</code> 复制到你的 Claude Code skills 目录</li>
          <li>在 agent 聊天里用 <code className="bg-ink px-1 rounded">/study</code> 或 <code className="bg-ink px-1 rounded">/fable</code> 触发</li>
        </ol>
        <div className="bg-ink/40 border-l-2 border-green-600/50 pl-3 py-2 text-xs text-parchment/50 space-y-1">
          <p>🔑 首次使用时，skill 会询问你的 Study Parlor 项目位置，读取 <code className="bg-ink px-1 rounded">.env</code> 中的 <code className="bg-ink px-1 rounded">STUDY_LIBRARY_PATH</code> 并永久保存到 skill 文件中。下次使用无需再配置。</p>
          <p className="text-ember/70">⚠️ 请确保 skill 配置的学习库路径与左侧"学习库"中显示的路径一致，否则生成的报告将不会在学习库中显示。</p>
        </div>
      </div>
    </div>
  )
}

export function Extension() {
  const goto = useStore(s => s.goto)
  const t = useTerminology()
  const [info, setInfo] = useState<{ libraryPath: string; paintingCount: number } | null>(null)
  const [activeTab, setActiveTab] = useState<TabId>('language')
  const scrollRef = useRef<HTMLDivElement>(null)
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    ipc.getExtensionInfo().then(setInfo).catch(() => setInfo({ libraryPath: '未知', paintingCount: 0 }))
  }, [])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onScroll = () => {
      const max = el.scrollHeight - el.clientHeight
      setProgress(max > 0 ? el.scrollTop / max : 0)
    }
    el.addEventListener('scroll', onScroll)
    return () => el.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <div className="fixed inset-0">
      <SurfaceBackground surface="home" />
      <SwapPaintingButton surface="home" className="absolute top-4 right-36 z-10" />

      <div className="absolute top-10 left-6 right-6 bottom-5 z-10">
        <div className="max-w-4xl mx-auto h-full">
          <div className="bg-ink/72 backdrop-blur-md border border-slate/30 rounded-xl flex flex-col h-full overflow-hidden">
            <div className="flex justify-between items-center px-6 pt-5 pb-3 border-b border-slate/25 shrink-0">
              <h2 className="text-2xl font-serif font-semibold">扩展</h2>
              <button
                onClick={() => goto('home')}
                className="text-parchment/70 hover:text-parchment text-sm bg-transparent border-none cursor-pointer font-sans"
              >
                返回{t.sessionName}
              </button>
            </div>
            <div className="h-0.5 bg-slate/10 shrink-0">
              <div className="h-full bg-ember/60 transition-[width] duration-150" style={{ width: `${progress * 100}%` }} />
            </div>
            <div className="flex flex-1 overflow-hidden">
              <aside className="w-44 shrink-0 border-r border-slate/25 overflow-y-auto">
                {TABS.map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`w-full text-left px-4 py-3 text-sm font-sans transition-colors flex items-center gap-2
                      ${activeTab === tab.id ? 'bg-parchment/10 text-parchment' : 'text-parchment/60 hover:bg-parchment/5 hover:text-parchment/80'}`}
                  >
                    <span>{tab.icon}</span>
                    <span>{tab.label}</span>
                  </button>
                ))}
              </aside>
              <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-5">
                {activeTab === 'language' && <TerminologyPanel />}
                {activeTab === 'paintings' && <PaintingsPanel paintingCount={info?.paintingCount ?? 0} />}
                {activeTab === 'library' && <LibraryPanel libraryPath={info?.libraryPath ?? '加载中...'} />}
                {activeTab === 'agent' && <AgentPanel />}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
```

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
- Modify: `tests/store.test.ts` (已在 Task 3 修改)

- [ ] **Step 1: Add persistence-focused terminology tests**

在 `tests/terminology.test.ts` 末尾追加：

```ts
import { act, renderHook } from '@testing-library/react'

describe('useTerminology integration', () => {
  it('reflects store terminology overrides', () => {
    useStore.setState({ terminology: { sessionName: '炉边谈话' } })
    const { result } = renderHook(() => useTerminology())
    expect(result.current.sessionName).toBe('炉边谈话')
    expect(result.current.libraryName).toBe(DEFAULT_TERMINOLOGY.libraryName)
  })
})
```

注意：需要确保 `@testing-library/react` 已安装且测试环境支持 React hooks。如果项目中未安装，可改为直接测试 `getTerminology` 而不引入 renderHook，或者用 `vi.mock` 处理。

如果 `@testing-library/react` 不存在，改为纯 store 测试：

```ts
describe('useTerminology integration', () => {
  it('reflects store terminology overrides', () => {
    useStore.setState({ terminology: { sessionName: '炉边谈话' } })
    const merged = getTerminology(useStore.getState().terminology)
    expect(merged.sessionName).toBe('炉边谈话')
    expect(merged.libraryName).toBe(DEFAULT_TERMINOLOGY.libraryName)
  })
})
```

- [ ] **Step 2: Run full test suite**

Run: `npm run test`
Expected: ALL PASS

- [ ] **Step 3: Run build**

Run: `npm run build`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add tests/terminology.test.ts
git commit -m "test(terminology): add persistence and integration tests"
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

**Plan complete and saved to `docs/superpowers/plans/2026-06-23-diy-terminology.md`. Two execution options:**

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
