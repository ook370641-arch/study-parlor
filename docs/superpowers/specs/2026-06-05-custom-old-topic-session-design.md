# 「新的小径」自定义旧主题新 Session 设计

**日期**: 2026-06-05
**状态**: 已确认
**关联**: [[2026-06-03-continue-topic-suggestions-design]]（续谈建议功能）

---

## 1. 需求概述

### 1.1 背景

当前 Home 页「新的小径」按钮只支持开启**全新主题**的学习 session。用户若想在已有主题下开启一个**自定义方向**的新 session，只能通过学习库中该主题的「续谈」按钮。但「续谈」的特点是 LLM 主动推荐方向，用户被动选择——无法满足用户自己定义细分学习方向的需求。

### 1.2 目标

在「新的小径」入口下新增一个分支：**选择已有主题 → 输入自定义细分方向 → 开启新 session**。归档时归入该已有主题的目录下。

### 1.3 核心区别

| 维度 | 自定义旧主题新 session | 续谈 |
|------|----------------------|------|
| 入口 | 「新的小径」→ 已有主题 | 学习库主题卡片上的「续谈」按钮 |
| 主题来源 | 用户手动输入细分方向 | LLM 基于已有 session 生成推荐 |
| 续谈建议卡片 | 无（纯用户自定义） | 有（LLM 生成的 2~3 个方向） |
| 归档归属 | 归入所选旧主题的 dirName | 归入对应主题的 dirName |

---

## 2. 交互设计

### 2.1 入口

Home 页「新的小径」按钮行为不变：点击打开 `PreStudyModal`。

### 2.2 PreStudyModal 内部结构

在 Modal 顶部增加「全新主题」/「已有主题」切换按钮组，默认选中「全新主题」。

```
┌─────────────────────────────────────┐
│  [全新主题]  [已有主题]               │  ← 新增切换
├─────────────────────────────────────┤
│                                     │
│  全新主题模式：                       │
│  ┌───────────────────────────────┐  │
│  │ 今夜想学                       │  │
│  │ 主题或一个问题...               │  │  ← 现有输入框
│  └───────────────────────────────┘  │
│                                     │
│  已有主题模式：                       │
│  ┌───────────────────────────────┐  │
│  │ 🔍 搜索已有主题...              │  │  ← 搜索过滤
│  └───────────────────────────────┘  │
│  ┌───────────────────────────────┐  │
│  │ 🔘 React Hooks        5份·3天前 │  │  ← 主题列表
│  │   TypeScript 进阶     3份·昨天  │  │
│  │   设计模式            2份·1周前 │  │
│  └───────────────────────────────┘  │
│  ┌───────────────────────────────┐  │
│  │ 本次细分方向                   │  │  ← 细分方向输入
│  │ useDeferredValue的具体场景...  │  │
│  └───────────────────────────────┘  │
│                                     │
│  附加要求 · 审讯强度 · 腔调（共用）   │  ← 现有组件不变
│                                     │
│              [撤回]  [开始]          │
└─────────────────────────────────────┘
```

### 2.3 状态切换规则

- **默认状态**: 打开 Modal 时显示「全新主题」内容（与当前行为一致）
- **切换时**: 清空当前已选主题和细分方向输入，保留附加要求/审讯强度/腔调设置
- **从「已有主题」切换回「全新主题」**: 主题列表隐藏，显示主题输入框

### 2.4 主题列表

- **数据来源**: `library`（Zustand store 中的 TopicMeta 数组）
- **排序规则**: 按 `last_studied` 倒序（最近学习过的排前面）
- **搜索过滤**: 只匹配主题 `title`，实时过滤，不区分大小写
- **空状态**: 搜索无结果时显示提示文字「未找到匹配的主题」
- **选中态**: 点击主题后该主题高亮（ember 边框 + 背景），记录其 `dirName`

### 2.5 细分方向输入

- **显示条件**: 仅在「已有主题」模式下且已选中一个主题时显示
- **placeholder**: 提示用户输入本次 session 的具体方向
- **校验**: 开始按钮仅在已选主题且细分方向非空时才可点击
- **session title**: Study 页面顶部显示细分方向内容

### 2.6 共用组件

以下组件在两种模式下完全共用，状态切换时不重置：
- 附加要求 textarea
- 审讯强度选择（high/mid/low）
- 腔调选择（0.3/0.7/1.0）

---

## 3. 数据流

### 3.1 启动流程

```
1. 用户点击「新的小径」
   → openPreStudy({ mode: 'progress', topic: '' })

2. Modal 打开，默认「全新主题」模式
   → 与当前行为完全一致

3. 用户切换到「已有主题」
   → 显示搜索框 + 主题列表（按 last_studied 倒序）

4. 用户搜索过滤
   → 实时匹配 title，过滤 library

5. 用户选中主题
   → 记录 selectedDirName
   → 显示「细分方向」输入框

6. 用户输入细分方向
   → 记录 customTopic

7. 用户点击「开始」
   → startSession({
       mode: 'progress',
       topic: customTopic,           // 细分方向作为 session 标题
       dirName: selectedDirName,     // 已有主题的 dirName
       difficulty,
       temperature,
       userRequirement,
     })

8. Study 页面
   → header 显示 customTopic（细分方向）

9. 归档
   → 自动归入 selectedDirName 目录下
   → session_number = 该主题现有 sessionCount + 1
```

### 3.2 与现有数据结构的兼容性

无需修改任何类型定义。`startSession` 的参数结构已经支持 `dirName` + `topic` 的组合：

```typescript
startSession(a: {
  mode: Mode;
  topic: string;        // 细分方向
  dirName?: string;     // 已有主题目录
  difficulty: Difficulty;
  temperature: number;
  userRequirement?: string;
})
```

归档逻辑在 `finalize.ts` 中已处理 `dirName` 存在时的写入逻辑，无需改动。

---

## 4. 组件改动范围

### 4.1 PreStudyModal (`src/components/PreStudyModal.tsx`)

**新增状态:**
- `topicSource: 'new' | 'existing'` — 主题来源切换状态
- `selectedDirName: string | null` — 选中的已有主题 dirName
- `searchQuery: string` — 搜索过滤关键词
- `customTopic: string` — 细分方向输入内容

**新增逻辑:**
- 主题列表过滤：`library.filter(t => t.title.toLowerCase().includes(searchQuery.toLowerCase()))`
- 主题列表排序：按 `last_studied` 倒序
- 校验逻辑：「已有主题」模式下必须 `selectedDirName && customTopic.trim()` 才能开始
- 切换模式时重置：清空 `selectedDirName`、`searchQuery`、`customTopic`

**UI 新增:**
- 顶部切换按钮组（全新主题 / 已有主题）
- 搜索输入框（仅在已有主题模式）
- 主题列表（可滚动，带记录数和最近学习时间）
- 细分方向输入框（仅在已有主题模式且已选中主题）

### 4.2 无改动文件

以下文件**不需要**修改：
- `src/pages/Home.tsx` — 按钮行为不变
- `src/store/index.ts` — `startSession` 接口已支持
- `src/pages/Study.tsx` — header 显示逻辑不变
- `src/lib/finalize.ts` — 归档逻辑已支持
- `src/types/index.ts` — 类型定义已支持
- `src/lib/session-runtime.ts` — session 启动逻辑不变

---

## 5. 边界情况

| 场景 | 处理方式 |
|------|---------|
| 学习库为空 | 「已有主题」选项可点击但列表为空，显示提示 |
| 搜索无结果 | 显示「未找到匹配的主题」提示 |
| 用户切换模式后切回 | 重置该模式下的选择状态，保留共用设置 |
| 已选中主题但细分方向为空 | 「开始」按钮禁用 |
| 未选中主题 | 不显示细分方向输入框 |
| 用户从学习库直接点「续谈」 | 不受影响，走原有逻辑（带 dirName 的 progress 模式，加载 LLM 建议） |

---

## 6. 视觉规范

遵循现有暗色主题：
- 切换按钮组：选中态用 `bg-ember text-ink`，未选中用透明背景 + `border-slate/30`
- 主题列表项：默认 `bg-ink/40 border-slate/20`，悬停 `hover:bg-ember/5 hover:border-slate/40`
- 选中态：`bg-ember/10 border-ember/40`
- 搜索框：复用现有 `Input` 组件样式
- 细分方向输入框：复用现有 `Input` 组件样式
- 记录数/时间标签：`text-parchment/40 font-sans text-xs`
