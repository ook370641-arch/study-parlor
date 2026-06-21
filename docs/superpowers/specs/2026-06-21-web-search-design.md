# 网络搜索（外部资料）功能设计文档

**日期**: 2026-06-21  
**功能**: 在学者夜话 progress 学习模式开始时，集中搜索一次主题资料，整理后作为上下文注入 system prompt，并归档到当前会话目录。  
**状态**: 待实现

---

## 1. 目标与范围

### 1.1 目标

为学者夜话的 progress 学习模式增加可选的“联网资料”能力：

- 用户在 preStudy 阶段可选择是否引入外部资料
- 若选择，应用在对话开始前集中搜索一次
- 搜索结果经 DeepSeek 整理为“导师备课笔记”格式
- 整理后的摘要注入 system prompt，作为苏格拉底辅导的背景知识
- 原始来源与摘要一并归档到 `sN/外部资料.md`
- review 模式不复用搜索，而是复用历史 progress 会话已归档的 `外部资料.md`

### 1.2 范围

- preStudy 界面增加“联网资料”开关
- Settings 页面增加 Tavily API key 配置（存入 OS keychain）
- Study 页面顶部增加可折叠的“外部资料”来源卡片
- 新增主进程搜索模块 `electron/lib/search.ts`
- 新增搜索相关 IPC handler
- `finalize` 阶段将运行时保存的外部资料写入 `sN/外部资料.md`
- `assemblePrompt` 中注入外部资料摘要

### 1.3 非目标

- 不在对话进行中多次搜索
- 不实现通用搜索引擎切换（固定 Tavily）
- 不实现用户自定义搜索查询词（由 LLM 生成）
- 不将外部资料直接展示为聊天消息
- 不在 AI 回复中显示 [1] [2] 引用标记（来源仅在 Study 顶部卡片中可见）
- 不在 review 模式下触发新的网络搜索

---

## 2. 用户流程

### 2.1 progress 模式首次学习

```
Home → 选择主题 / 输入新主题 → preStudy 模态
                                    │
                                    ▼
                           [联网资料] 开关（默认关闭）
                                    │
                                    ▼
                           用户开启开关 → 检查 Tavily key
                                    │
                                    ▼
                           进入 Study 页面
                           顶部显示 "外部资料" 卡片（加载中）
                                    │
                                    ▼
                           后台执行：
                             1. DeepSeek 生成 3 个搜索查询词
                             2. 并行调用 Tavily（每查询 max_results=5）
                             3. DeepSeek 整理成导师备课笔记
                             4. 注入 system prompt
                             5. 保存到运行时状态
                                    │
                                    ▼
                           卡片显示来源列表（标题 + URL）
                           用户开始苏格拉底对话
                                    │
                                    ▼
                           结束会话 → finalize
                           写入 sN/学习报告.md
                           写入 sN/外部资料.md
```

### 2.2 review 模式

```
Home → 选择已有主题 → preStudy 模态
                         │
                         ▼
                [联网资料] 开关不可见 / 禁用
                         │
                         ▼
                进入 Study 页面
                读取该主题最近一次 progress 的 sN/外部资料.md
                注入 system prompt
                顶部显示来源卡片（只读）
```

---

## 3. 视觉设计

### 设计哲学：辅助意识式（Subsidiary Awareness）

基于波兰尼的默会知识理论，搜索能力应处于“辅助意识”中：用户知道它存在，但它不抢走苏格拉底对话的焦点。因此采用 **方案 B（辅助意识式）**：

- PreStudy 提供清晰的复选框，让用户在开始前做出一次性决策；
- Study 页面顶部放置可折叠来源卡片，默认折叠，仅在用户需要时展开查看；
- AI 回复中**不显示 [1] [2] 引用标记**，保持对话的自然流动，来源仅在卡片中可见。

### 3.1 preStudy 模态

- 在“附加要求”之后、“审讯强度”之前增加一行：
  - 复选框：`引入联网资料（外部资料将归档到本次学习目录）`
  - 默认未选中
  - 若未配置 Tavily key，点击时 toast 提示“请先在设置中配置 Tavily API Key”
  - 仅在 `progress` 模式显示；`review` 模式不显示该开关

### 3.2 Study 页面

- 顶部 header 下方、对话区域上方增加可折叠卡片 `ExternalMaterialsCard`：
  - **折叠态**：左侧 🌐 图标 + “外部资料” + 来源数量 badge + 右侧“展开”文字
  - **展开态**：列出所有来源（标题 + URL），按编号排列
  - **加载态**：显示 spinner + “外部资料收集中…”
  - **失败态**：卡片内显示轻量提示“资料获取失败，本次不使用联网内容”，不阻断对话
  - **review 模式**：卡片为只读，不触发搜索，标题旁显示“来自历史学习”

### 3.3 Settings 页面

- 在“AI 服务”分组之后新增独立的 `联网搜索` 分组：
  - `Tavily API Key`：密码输入框 + 显示/隐藏按钮
  - `Tavily Base URL`（可选）：自定义端点，默认留空
  - 说明文字：Key 会加密存储在系统密钥库中，不会写入 .env；联网资料仅在你主动开启时使用

---

## 4. 数据流与架构

采用主进程封装方案，符合学者夜话现有 IPC 三层架构。

```
Renderer (preStudy / Study)
        │
        │ ipc.searchPrepare({ topic, dirName? })
        ▼
Main Process (electron/ipc/search.ts)
        │
        ├── 1. 读取 keychain 中的 Tavily key
        │     缺失 → 返回错误，UI 引导用户配置
        │
        ├── 2. 调用 electron/lib/search.ts
        │     generateSearchQueries(topic) → 3 个查询词
        │
        ├── 3. 并行调用 Tavily API
        │     searchWeb(query, { max_results: 5 })
        │
        ├── 4. 调用 DeepSeek 整理结果
        │     generateTutorBrief(rawResults) → 结构化摘要
        │
        └── 5. 返回 { summary, sources }
        │
        ▼
Renderer (Study.tsx)
        │
        ├── 将 summary 存入 Zustand store
        ├── 在 assemblePrompt 时注入 system prompt
        ├── 顶部卡片展示 sources
        └── 对话结束后随 finalize 落盘
```

---

## 5. IPC API 设计

在 `src/types/index.ts` 的 `IpcApi` 中新增：

```typescript
// 仅用于 progress 模式：执行一次网络搜索并返回整理后的资料
searchPrepare: (args: {
  topic: string
}) => Promise<SearchResult>

// 检查 Tavily key 是否已配置
searchCheckConfig: () => Promise<{ configured: boolean }>
```

review 模式不调用 `searchPrepare`，而是复用已有 `sN/外部资料.md`，通过现有 `files:readSessionFile` 或类似机制读取。

新增类型：

```typescript
type SearchResult = {
  summary: string         // 整理后的导师备课笔记（≤ 4000 tokens）
  sources: SearchSource[]
}

type SearchSource = {
  title: string
  url: string
  snippet?: string        // 原始摘要，可选展示
}
```

### 5.1 错误类型

```typescript
type SearchErrorCode =
  | 'MISSING_API_KEY'      // Tavily key 未配置
  | 'NETWORK_ERROR'        // Tavily 网络错误（已重试一次仍失败）
  | 'LLM_ERROR'            // 查询生成或整理失败
  | 'NO_RESULTS'           // 搜索返回空结果
```

---

## 6. 模块设计

### 6.1 `electron/lib/search.ts`

搜索核心模块，职责单一：与 Tavily 交互、生成查询、整理摘要。

```typescript
// 生成搜索查询词
export async function generateSearchQueries(topic: string): Promise<string[]>

// 调用 Tavily 搜索
export async function searchWeb(
  query: string,
  opts?: { maxResults?: number }
): Promise<TavilyResult[]>

// 整理为导师备课笔记
export async function generateTutorBrief(
  topic: string,
  results: TavilyResult[]
): Promise<{ summary: string; sources: SearchSource[] }>
```

### 6.2 `electron/lib/credentials.ts`（新建或扩展）

封装 OS keychain 读写：

```typescript
export async function getSearchApiKey(): Promise<string | null>
export async function setSearchApiKey(key: string): Promise<void>
```

技术选型：优先使用 Electron 内置 `safeStorage` 加密后存入 `~/.studyparlor/search-key.enc`，避免引入 `keytar` 原生依赖。若 `safeStorage` 在目标平台不可用，再降级为 `keytar`。

### 6.3 `electron/ipc/search.ts`（新建）

IPC handler 入口：

- `search:prepare`：协调查询生成、搜索、整理
- `search:checkConfig`：检查 Tavily key 是否已配置
- 内部实现重试逻辑（ Tavily 失败自动重试 1 次）

### 6.4 `electron/lib/prompts.ts`

在 `assemblePrompt` 中，于 `learner-base.md` 之后、`mode-progress.md` 之前插入：

```markdown
【外部资料摘要】
{summary}

以上资料仅供你作为背景知识使用。请继续以苏格拉底方式引导用户，不要直接引用资料给出答案。
```

### 6.5 `src/lib/finalize.ts`

progress finalize 时：

- 从 store 读取当前会话的 `externalMaterials`
- 调用 `files:writeExternalMaterials(dirName, sessionNumber, materials)`
- 写入 `sN/外部资料.md`

---

## 7. 文件保存规则

### 7.1 progress 模式

- **路径**：`{STUDY_LIBRARY_PATH}/{dirName}/s{sessionNumber}/外部资料.md`
- **创建时机**：finalize 时与 `学习报告.md` 一起写入
- **frontmatter**：
  ```yaml
  ---
  title: 外部资料
  type: external-materials
  created: 2026-06-21T12:00:00.000Z
  session: 1
  topic: {topicTitle}
  ---
  ```
- 需要在 `DocType` 中新增 `'external-materials'`，但 `files:scan` 不应将其作为独立 topic 展示。
- **正文格式**：
  ```markdown
  ## 摘要
  {LLM 整理后的 tutor brief}

  ## 来源
  1. [标题](URL) — 原始摘要
  2. [标题](URL) — 原始摘要
  ```

### 7.2 review 模式

- 不写入新的 `外部资料.md`
- 读取最近一次 progress 的 `sN/外部资料.md` 注入上下文
- 若历史资料不存在，则 review 模式不使用外部资料

---

## 8. Prompt 策略

### 8.1 查询生成 Prompt

```markdown
用户将要学习主题为："{topic}"

请生成 3 个搜索查询词，用于帮助一位苏格拉底式导师准备该主题的背景资料。

要求：
- 查询词应覆盖主题的核心概念、常见误解、实际应用
- 每个查询词简短，适合交给搜索引擎
- 只输出 JSON 数组，不要解释

输出格式：
["查询1", "查询2", "查询3"]
```

### 8.2 摘要整理 Prompt

```markdown
你是一位苏格拉底式导师的备课助手。以下是从网络搜索得到的关于 "{topic}" 的原始资料。

请整理成一份"导师备课笔记"，用于后续辅导时作为背景知识。

要求：
1. 控制在 3000 中文字以内
2. 包含：核心概念（2-4 个）、关键区分点、常见误解（2-3 个）、应用场景（1-2 个）、前置知识
3. 每个关键观点后附上原始来源编号 [1] [2] ...
4. 不要写成"教学大纲"，而要写成"导师知道但不直接告诉学生"的背景笔记

原始资料：
{sources}
```

---

## 9. 状态管理

在 `src/store/index.ts` 中新增：

```typescript
externalMaterials: {
  summary: string | null
  sources: SearchSource[]
  loading: boolean
  error: SearchErrorCode | null
} | null
```

新增 action：

```typescript
prepareExternalMaterials(topic: string): Promise<void>
setExternalMaterials(materials: SearchResult): void
setExternalMaterialsError(error: SearchErrorCode): void
clearExternalMaterials(): void
```

---

## 10. 错误处理

| 错误场景 | 处理方式 |
|---------|---------|
| Tavily key 未配置 | preStudy 开关点击时提示“请先在设置中配置 Tavily API Key” |
| Tavily 网络失败 | 自动重试 1 次；仍失败则 toast “外部资料获取失败，本次不使用联网内容”，降级继续 |
| 查询生成失败 | 同上降级 |
| 摘要整理失败 | 同上降级 |
| 搜索返回空结果 | toast “未找到相关外部资料”，降级继续 |
| review 模式历史资料缺失 | 静默不使用外部资料 |

---

## 11. 测试计划

- `tests/search.test.ts`：Tavily API 调用、查询生成、摘要整理
- `tests/search-ipc.test.ts`：IPC handler 重试、降级、错误码
- `tests/prompts.test.ts`（扩展）：验证外部资料注入位置
- `tests/finalize.test.ts`（扩展）：验证 `外部资料.md` 写入
- 手动测试：preStudy 开关、key 缺失提示、Study 卡片展开/折叠、finalize 后文件存在

---

## 12. 风险与限制

1. **Tavily API 可用性与成本**：依赖第三方服务，每次 progress 学习调用一次搜索 + 两次 LLM 整理
2. **隐私**：学习主题会发送到 Tavily，需在 UI 中明确告知用户
3. **资料时效性**：归档的 `外部资料.md` 只反映学习时的网络信息，后续可能过时
4. **噪声控制**：摘要质量直接影响苏格拉底辅导效果，需持续调优 prompt
5. **keychain 跨平台差异**：Windows/macOS/Linux 的凭据存储实现需测试

---

## 13. 后续可扩展

- 支持 review 模式也允许重新搜索（用户明确需要时）
- 支持多搜索引擎后端（SerpAPI、Bing 等）
- 支持在对话中引用具体来源编号
- 支持外部资料的手动编辑

---

## 14. 决策摘要

| 决策项 | 选择 |
|-------|------|
| 触发时机 | preStudy 阶段用户手动勾选“联网资料” |
| 搜索次数 | 每个 progress 会话仅一次 |
| 搜索模型 | DeepSeek V4 Pro（查询生成 + 摘要整理） |
| 搜索服务商 | Tavily |
| 查询数量 | 3 个 |
| 每查询结果数 | 5 条 |
| 摘要长度 | 固定 4000 tokens（约 3000 中文字） |
| 资料存储 | 运行时 Zustand store，finalize 写入 `sN/外部资料.md` |
| key 存储 | OS keychain / safeStorage，不写入 `.env` |
| 注入方式 | 拼入 system prompt |
| UI 展示 | Study 页面顶部可折叠“外部资料”来源卡片 |
| UI 哲学 | 辅助意识式（Subsidiary Awareness）：搜索在背景中支持对话，不抢占焦点 |
| UI 方案 | B：PreStudy 清晰复选框 + Study 顶部可折叠卡片（默认折叠） |
| AI 引用 | 不显示 [1] [2] 引用标记，来源仅在卡片中可见 |
| 失败处理 | 自动重试 1 次，仍失败则 toast 提示并降级 |
| 模式范围 | 仅 progress 模式触发搜索；review 模式复用历史资料 |
