# 续谈主题推荐系统设计

## 背景与问题

点击「续谈」后，用户和 AI 需要花 1-2 轮对话才能确定本次具体学什么。这是因为当前 PreStudyModal 只让用户选择难度和腔调，没有把"学习方向"传进 LLM 的 system prompt。

## 目标

- 续谈一进去，LLM 就带着预先规划好的细分主题等用户
- 每次聊天前，让用户明确知道"这次学什么"以及"为什么推荐这个"
- 新主题学习和复习场景下，也允许用户附加可选学习要求

## 方案总览

**方案一：预生成缓存**（选中）

- 每次归档/新session/删除session时，异步调 LLM 生成 2-3 个续谈推荐
- 写入 `state.json` 的 `topicContinueSuggestions` 字段
- 点击续谈时直接读取展示，零等待
- 删除 topic 时同步删除其续谈推荐缓存

## UI 设计

### 续谈弹窗（替代现有 PreStudyModal）

点击「续谈」后弹出主题选择窗口：

- 顶部：topic 名称 + "续谈 · 第N次"
- 主体：2-3 个推荐主题卡片（单选，默认第一个）
  - 标题：一句话描述具体学习子主题
  - 推荐理由：基于历史记录的一句话解释
- 附加要求（可选）：自由文本框，"你对这次学习还有什么要求？"
- 底部：难度 + 腔调选择（沿用上次设置，可修改）
- 操作：撤回 / 开始

### 新主题 / 复习弹窗（增强现有 PreStudyModal）

在现有 PreStudyModal 中新增「附加要求」文本框：

- 新主题：主题输入框 + 附加要求 + 难度/腔调
- 复习：topic 名称展示 + 附加要求 + 难度/腔调
- 无主题推荐（主题已确定）

### 三种场景对比

| 场景 | 主题展示 | 主题推荐 | 附加要求 | 难度/腔调 |
|------|----------|----------|----------|-----------|
| 🆕 新主题 | 自由输入框 | 无 | ✅ | ✅ |
| 🔄 续谈 | 显示topic名 | ✅ 2-3个AI推荐 | ✅ | ✅ |
| 🔁 复习 | 显示topic名 | 无 | ✅ | ✅ |

## 数据模型

### StateJson 扩展

```typescript
type ContinueTopicSuggestion = {
  title: string   // 推荐主题标题（15字以内）
  reason: string  // 推荐理由（引用历史记录具体线索）
}

type TopicContinueCache = {
  generatedAt: string                    // ISO 时间戳
  suggestions: ContinueTopicSuggestion[]
}

// 新增到 StateJson
topicContinueSuggestions: Record<string, TopicContinueCache>
// key = dirName, value = 该topic的续谈推荐缓存
```

### 新增 IPC 类型

```typescript
llmGenerateContinueSuggestions: (args: {
  topic: string
  dirName: string
  reportSummaries: string[]  // 该topic下所有报告的摘要
}) => Promise<ContinueTopicSuggestion[]>
```

### Session 扩展

```typescript
type Session = {
  // ... 现有字段 ...
  userRequirement?: string  // 用户附加的学习要求
}
```

## 触发时机

**触发续谈推荐重新生成的 4 种事件：**

| 事件 | 处理 |
|------|------|
| 新报告归档成功 | 触发异步更新该 topic 的续谈推荐 |
| 新 session 开始（progress 模式） | 触发异步更新 |
| 删除 session | 触发异步更新 |
| 删除 topic | 直接删除 `topicContinueSuggestions[dirName]` |

**更新流程：**

```
触发事件 ─→ 主进程收集该 topic 全部报告摘要
            ├─ 如果报告数=0（兜底）：生成通用推荐
            └─ 调 llmGenerateContinueSuggestions
                ├─ 成功：写回 state.json，覆盖旧缓存
                └─ 失败：静默失败，保留旧缓存；首次则缓存为空
```

**点击续谈时的读取流程：**

```
点击续谈 ─→ 查找 topicContinueSuggestions[dirName]
            ├─ 有缓存（≥1条）：直接展示弹窗
            ├─ 无缓存/缓存为空：弹窗显示 loading 骨架 → 实时生成 → 展示
            └─ 生成失败：退化为"自由输入方向"输入框
```

## LLM Prompt 设计

### Prompt A：生成续谈推荐

```markdown
你正在为"学者夜话"设计续谈主题。请根据学习者在该主题下的历史，推荐 2-3 个具体的续谈方向。

主题：{{topic}}
历史学习记录：
{{reportSummaries}}

约束：
1. 每个推荐是一个独立的、单次会话能讲完的具体子主题。
2. 推荐理由必须引用历史记录中的具体线索（如"你在第X次学习提到…"）。
3. 推荐之间要有区分度：覆盖深化理解、横向拓展、薄弱环节、前沿联系等不同维度。
4. 若历史显示某处有明确困惑，优先推荐针对性方向。
5. 首次学习（无历史记录）时，推荐该 topic 下的 3 个经典入门切入点。

【格式强制要求】
- 只输出 JSON 数组，不要任何其他内容
- 不要 markdown 代码块，不要解释说明
- 回复必须直接以 [ 开头，以 ] 结尾
- 示例：[{"title":"收敛性证明","reason":"你在第3次报告中提到对收敛条件理解不透彻，这次从贝尔曼方程逐步推导。"}]
```

### Prompt B：附加要求融入 System Prompt

在 `prompts.ts` 的装配链中，于 `learner-base.md` 之后、模式注入之前插入：

```markdown
【本次学习方向】
{{#if selectedTopic}}
聚焦主题：{{selectedTopic}}
{{/if}}
{{#if userRequirement}}
学习者额外要求：{{userRequirement}}
{{/if}}
```

- `selectedTopic`：续谈时为用户选中的推荐主题，新主题/复习时为空
- `userRequirement`：用户在所有三种场景下可选填的附加要求

## 错误处理

| 场景 | 行为 |
|------|------|
| 缓存生成中（首次点击续谈） | 弹窗显示骨架屏 + "正在为你规划续谈方向..." |
| 缓存生成失败，但有旧缓存 | 静默失败，展示旧缓存 |
| 缓存为空且生成失败 | 弹窗退化为"自由输入方向"文本框 |
| 有缓存但条目<2条 | 用通用方向补齐到 2 条 |
| 附加要求超长（>200字） | 前端截断并提示 |

## 接口变更清单

### 前端

- `PreStudyModal.tsx`：大幅改造
  - 根据 `mode` + `dirName` 决定展示形态（新主题/续谈/复习）
  - 新增主题推荐卡片 UI
  - 新增附加要求文本框（所有场景）
  - 难度/腔调选择保留
- `store/index.ts`：`Session` 类型新增 `userRequirement`；`startSession` 接收 `userRequirement`
- `src/types/index.ts`：`IpcApi.llmStart` 增加 `userRequirement` 参数；新增 `llmGenerateContinueSuggestions`

### 后端

- `electron/lib/llm-tasks.ts`：新增 `generateContinueSuggestions` 函数
- `electron/prompts/continue-suggestions.md`：新增 prompt 文件
- `electron/prompts.ts`：装配链插入【本次学习方向】段
- `electron/ipc/llm.ts`：新增 `llmGenerateContinueSuggestions` IPC 处理器
- `electron/ipc/state.ts`：扩展 `StateJson` schema
- `electron/ipc/files.ts`：归档/删除 session 后触发续谈推荐更新

## 不做的（YAGNI）

- 不做过期清理（时间不是决定要素）
- 不做缓存预加载（按需生成即可）
- 不做推荐历史记录（只保留最新一批）
- 不做用户反馈闭环（不记录用户选了哪个推荐来优化后续推荐）
