# DIY 仪式术语设计文档

**日期**：2026-06-22  
**范围**：扩展页（Extension）  
**关联功能**：`2026-06-05-extension-page-design.md`、`2026-06-14-settings-design.md`

---

## 0. 当前实现状态（2026-06-27）

- ✅ `StateJson.terminology` 字段已存在
- ✅ `src/store/index.ts` 已接入 `terminology` 状态、`patchTerminology` / `resetTerminology`
- ⚠️ `Terminology` 类型当前为 `Record<string, string>`，需改为本 spec 第 6.1 节的结构化类型
- ⚠️ `src/lib/terminology-defaults.ts` 当前为 `{}`，需填充第 6.2 节的默认值
- ❌ `src/lib/terminology.ts` helper 已存在但未被任何组件使用
- ❌ `getDifficultyLabel` / `getTemperatureLabel` 尚未支持自定义术语
- ❌ `Home / Study / Profile / PreStudyModal / Extension` 仍为硬编码文案
- ❌ 扩展页尚无「我的语言」面板
- ❌ 缺少 `tests/terminology.test.ts`

本 spec 保持原设计不变，作为剩余实现工作的唯一来源。

---

## 1. 目标

让用户可以自定义 Study Parlor 前端可见的核心仪式术语与参数标签，使工具的叫法贴合个人习惯，而不是被应用的默认词汇硬编码。

术语调整是**关系性的**：它不是「换皮肤」，而是用户和工具之间达成一套共同语言的过程。因此界面要把「改名」呈现为一种**调校仪式**，而不是普通设置项。

---

## 2. 范围边界

本次只做**前端可见文案的别名映射**，不做以下事情：

- 不改 prompt 中的内部指代（仍用英文/中性概念）。
- 不改归档文件名、frontmatter 字段、目录结构。
- 不改 LLM 返回内容的语义解析（例如归档触发仍检测「需要存档吗？」这一固定格式）。
- 不开放任意字符串替换或正则替换。

也就是说：用户把「夜话」改成「炉边谈话」，整个 UI 都跟着变，但代码内部仍然知道这是 `sessionMode == 'progress'` 的仪式名称。

---

## 3. 设计原则

### 3.1 默会知识（Tacit Knowledge）

波兰尼认为：真正的知识往往先于语言存在，通过使用和关系才变得可命名。允许用户改术语，就是承认「这个工具该叫什么」没有唯一正确答案——答案在用户的长期使用中浮现。

因此界面要提供：

1. **实时预览**：改一个词，立刻看到它在真实上下文里的样子。
2. **默认值始终可回退**：一键恢复默认，降低「叫错了」的心理负担。
3. **同一批全部开放**：本批次一次性提供所有可自定义术语，按语义分组只是为了编辑区组织，不做先后解锁。

### 3.2 仪式优先

扩展页不再是「附加功能列表」，而是进入工具前的调校空间。用户先定义语言，再使用外部能力（学习库、Agent、配图）。

### 3.3 改动最小化

只扩展 `StateJson`，增加一个 `terminology` 字段；渲染时通过统一的 helper 读取，不需要在每个组件里写条件分支。

---

## 4. 术语清单（本批次）

本批次一次性开放以下所有可自定义术语。表中按语义分为四类，仅用于「我的语言」面板中的折叠分组组织。

### 4.1 仪式动词（最高优先级）

| 默认 | key | 出现位置 |
|------|-----|----------|
| 夜话 | `sessionName` | 首页「新的小径」「继续」、Study 页 |
| 卷宗 | `libraryName` | 首页「学习库」按钮、扩展页 |
| 封存 | `archiveVerb` | Study 归档确认弹窗 |
| 笔录 | `transcriptName` | 首页「中断的笔录」 |
| 焚毁 | `burnVerb` | 首页焚毁按钮 |
| 新的小径 | `newTopicLabel` | 首页 |
| 推开下一扇门 | `continuePrompt` | 首页继续会话卡片 |
| 中断的笔录 | `unsavedSessionLabel` | 首页 |

### 4.2 模式与流程

| 默认 | key | 出现位置 |
|------|-----|----------|
| 探索新知 | `modeProgress` | PreStudy 弹窗、Study 页头部 |
| 复习检测 | `modeReview` | PreStudy 弹窗、Study 页头部 |
| 全新主题 | `newTopicMode` | PreStudy 弹窗 |
| 已有主题 | `existingTopicMode` | PreStudy 弹窗 |
| 是否封存？ | `archiveConfirmTitle` | Study 归档确认 |
| 暂不封存 | `archiveDismiss` | Study 归档确认 |
| 封存。它从此成为档案。 | `archiveConfirm` | Study 归档确认 |

### 4.3 参数标签

| 默认 | key | 出现位置 |
|------|-----|----------|
| 审讯强度 | `difficultyLabel` | PreStudy、Profile |
| 腔调 | `temperatureLabel` | PreStudy、Profile |
| 强 / 中 / 弱 | `difficultyHigh` / `difficultyMid` / `difficultyLow` | PreStudy、Profile |
| 坚硬 / 适中 / 活泼 | `temperatureCold` / `temperatureNeutral` / `temperatureWarm` | PreStudy、Profile |

### 4.4 界面名词

| 默认 | key | 出现位置 |
|------|-----|----------|
| 代号 | `profileNameLabel` | Profile |
| 领域 | `profileFieldLabel` | Profile |
| 侧写 | `profileTextLabel` | Profile |
| 今夜想学 | `topicInputLabel` | PreStudy |
| 细分方向 | `subTopicLabel` | PreStudy |
| 续谈方向 | `continueDirectionLabel` | PreStudy |
| 附加要求 | `requirementLabel` | PreStudy |
| 晚安，{name} | `homeGreeting` | Home |
| 开始 | `startButton` | PreStudy |
| 撤回 | `cancelButton` | PreStudy |

---

## 5. UI 布局

### 5.1 方案：侧边栏导航（B 变体）

用户选择 B，但顺序调整为：

1. **我的语言**（置顶，作为调校入口）
2. **自选配图**
3. **学习库**
4. **本地 Agent 打通**

理由：「我的语言」是进入扩展页首先要做的事；配图决定氛围，紧随其后；学习库和 Agent 是外部能力，排在后面。

### 5.2 页面结构

```
┌─────────────────────────────────────────────┐
│  扩展                                        │
├──────────┬──────────────────────────────────┤
│ 🪶 我的语言 │  当前选中项的详情                  │
│ 🖼️ 自选配图 │  （例如：仪式动词列表 + 实时预览）   │
│ 📁 学习库  │                                   │
│ ⚡ Agent  │                                   │
└──────────┴──────────────────────────────────┘
```

### 5.3 「我的语言」详情区

分四个折叠面板：

1. **仪式动词**（夜话、卷宗、封存、笔录、焚毁等）
2. **模式与流程**（探索新知、复习检测、归档确认等）
3. **参数标签**（审讯强度、腔调及等级）
4. **界面名词**（默认折叠）

每个字段展示：

- 左侧：默认值（不可编辑，作为参照）
- 中间：输入框（用户自定义）
- 右侧：若已修改，显示「恢复默认」小按钮

### 5.4 实时预览

详情区底部固定一个预览卡片：

> 预览：进入 **{sessionName}** · 打开 **{libraryName}** · **{difficultyLabel}**：{difficultyHigh}

用户在输入时，预览文字实时更新。

### 5.5 旧卡片改造

- 「学习库」卡片：从纵向大卡改为右侧详情区的一屏，保留当前路径、扫描状态、打开目录按钮。
- 「自选配图」卡片：右侧详情区一屏，保留换画按钮和当前画作信息。
- 「本地 Agent 打通」卡片：右侧详情区一屏，保留当前说明和状态。

---

## 6. 数据模型

### 6.1 StateJson 扩展

在 `src/types/index.ts` 的 `StateJson` 中新增 `terminology` 字段：

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

### 6.2 默认值

新增 `src/lib/terminology-defaults.ts`：

```ts
export const DEFAULT_TERMINOLOGY: Terminology = {
  sessionName: '夜话',
  libraryName: '卷宗',
  archiveVerb: '封存',
  transcriptName: '笔录',
  burnVerb: '焚毁',
  newTopicLabel: '新的小径',
  continuePrompt: '推开下一扇门',
  unsavedSessionLabel: '中断的笔录',

  modeProgress: '探索新知',
  modeReview: '复习检测',
  newTopicMode: '全新主题',
  existingTopicMode: '已有主题',
  archiveConfirmTitle: '是否封存？一旦归档，就不再更改。',
  archiveDismiss: '暂不封存',
  archiveConfirm: '封存。它从此成为档案。',

  difficultyLabel: '审讯强度',
  temperatureLabel: '腔调',
  difficultyHigh: '强',
  difficultyMid: '中',
  difficultyLow: '弱',
  temperatureCold: '坚硬',
  temperatureNeutral: '适中',
  temperatureWarm: '活泼',

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

### 6.3 读取 helper

新增 `src/lib/terminology.ts`：

```ts
import { DEFAULT_TERMINOLOGY } from './terminology-defaults'
import type { Terminology } from '@shared/index'

export function getTerminology(custom: Terminology | undefined): Required<Terminology> {
  return { ...DEFAULT_TERMINOLOGY, ...(custom ?? {}) }
}

// 用于组件内部解构
export function useTerminology(): Required<Terminology> {
  const custom = useStore(s => /* terminology 待接入 store */)
  return getTerminology(custom)
}
```

所有涉及默认文案的组件，改从 `useTerminology()` 读取，不再硬编码。

---

## 7. Store 集成

在 `src/store/index.ts` 中：

1. 增加状态字段：`terminology: Terminology`
2. `init` 时从 `state.terminology` 读取，缺失则 `{}`。
3. 增加 action：`patchTerminology(patch: Partial<Terminology>)`，调用 `ipc.patchState({ terminology: next })`。
4. 增加 action：`resetTerminology()`，调用 `ipc.patchState({ terminology: {} })` 并清空 store 中缓存。

---

## 8. 组件改造点

| 文件 | 改造内容 |
|------|----------|
| `src/pages/Home.tsx` | 「晚安」「学习库」「新的小径」「推开下一扇门」「中断的笔录」「焚毁」等改用 `useTerminology()` |
| `src/pages/Study.tsx` | 模式标签、归档确认文案改用 `useTerminology()`；退席按钮 aria-label 可先用中性词，不开放自定义 |
| `src/pages/Profile.tsx` | 「代号」「领域」「侧写」「审讯强度」「腔调」等改用 `useTerminology()` |
| `src/components/PreStudyModal.tsx` | 「全新主题」「已有主题」「今夜想学」「细分方向」「续谈方向」「附加要求」「审讯强度」「腔调」、等级文字改用 `useTerminology()`；`getDifficultyLabel` / `getTemperatureLabel` 读取自定义术语 |
| `src/lib/difficulty-label.ts` | 改为接收自定义映射，或提供默认映射 |
| `src/lib/temperature-label.ts` | 同上 |
| `src/pages/Extension.tsx` | 重构为侧边栏导航，新增「我的语言」面板 |

---

## 9. 回退与迁移

- `terminology` 字段可选，旧 `state.json` 没有该字段时，全部使用默认值。
- 用户清空某个输入框时，视为「恢复默认」，存储时删除该 key（不发空字符串）。
- 提供「全部恢复默认」按钮，直接写入 `{}`。

---

## 10. 实现里程碑

1. **数据结构 + helper**：新增类型、默认值、读取函数（无 UI 改动）。
2. **Store 接入**：init/patch/reset。
3. **组件文案替换**：Home / Study / Profile / PreStudy / difficulty-label / temperature-label。
4. **扩展页重构**：侧边栏导航 + 「我的语言」面板 + 实时预览。
5. **测试**：默认值测试、helper 回退测试、持久化测试。

---

## 11. 风险与依赖

1. **未解决的 git 冲突**：当前 `src/types/index.ts` 和 `src/store/index.ts` 存在 `<<<<<<< HEAD` 等冲突标记（web-search 分支与主分支的合并冲突），实现前必须先解决，否则类型与 store 无法正常工作。
2. **字符串替换遗漏**：硬编码文案分散在多个组件，helper 接入后需要逐个确认。
3. **LLM 解析依赖**：归档触发仍依赖固定中文检测 `需要存档吗？`，若用户改了归档相关术语，不影响内部触发逻辑；但未来若想把触发语也开放，需要单独设计。
4. **国际化与模板字符串**：`homeGreeting` 当前拆成「晚安」+ `{name}`，不开放整句模板，避免注入和格式化复杂度。
