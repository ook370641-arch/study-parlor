# 意外之径（随机推荐）功能设计文档

**日期**: 2026-06-21  
**功能**: 在 Home 页新增一个与学习者历史无关的跨学科主题推荐  
**状态**: 待实现

---

## 1. 目标与范围

### 1.1 目标

在学者夜话首页的「推开下一扇门」区域顶部，新增一个名为「意外之径」的独立推荐卡片。它会读取用户整个学习库的历史主题，推荐一个**完全不相关但极具吸引力**的新主题，例如熵增、量子物理、脑科学、经济学原理等，给用户一次「毫无预谋的闯入」。

### 1.2 范围

- Home 页左侧新增一个置顶推荐卡片
- 视觉上与现有分组推荐明显区分（紫罗兰色条 + 「意外之径」徽章）
- 用户可手动刷新推荐；不刷新则保持不变
- 推荐结果持久化到 `state.json`
- 新增独立 prompt 与 IPC 调用

### 1.3 非目标

- 不实现自动定时刷新（如每日/每次进入刷新）
- 不推荐与用户现有主题相关的主题
- 不在每个分组内单独插入 wild card

---

## 2. 用户流程

```
启动应用
  └── 封面页
        └── 点亮灯火 → Home 页
                         │
                         ├── 若 state.json 中已有 wildCardInspiration
                         │     → 直接展示「意外之径」卡片
                         │
                         ├── 若没有
                         │     → 调用 LLM 生成
                         │     → 展示卡片
                         │
                         └── 用户点击刷新图标
                               → 重新调用 LLM
                               → 替换卡片内容
```

---

## 3. 视觉设计

### 3.1 位置

- 位于 Home 页左侧「推开下一扇门」区域的最顶部
- 在所有 `GroupRecCard` 之上
- 与分组推荐卡片并列，但独立存在

### 3.2 卡片样式

采用 **A 方案：紫罗兰色条 + 「意外之径」徽章**。

- 背景：`#231b16`（与 group card 一致）
- 左侧 4px 色条：`#8b7fb8`（violet）
- 边框：1px `rgba(139, 127, 184, 0.35)`
- 圆角：10px
- 内边距：14px

### 3.3 内容层级

```
┌─────────────────────────────────────┐
│ ✦ 意外之径                    ↻    │  ← 徽章 + 刷新图标
│                                     │
│ 熵增定律                            │  ← topic，15px， parchment
│ 它解释为什么房间总会变乱，也解释    │  ← hook，12px， parchment-dim
│ 宇宙最终的命运。                    │
└─────────────────────────────────────┘
```

- 徽章：「✦ 意外之径」，11px，violet 色，低透明度背景
- topic：标题，15px，font-weight 500
- hook：说明文案，12px，弱化色
- 刷新图标：右下角，默认 30% 透明度，hover 显示「换一条」

### 3.4 交互状态

- hover：卡片整体 `translateY(-1px)`，轻微浮起
- 点击 topic：与分组推荐一致，调用 `openPreStudy({ mode: 'progress', topic })`
- 点击 hook 区域：同点击 topic
- 点击刷新图标：仅触发重新生成，不进入学习流程
- 刷新中：图标旋转，topic/hook 区域显示 skeleton 占位
- 错误：卡片底部出现一行 small warning 文案，保留重试按钮

---

## 4. 数据流与架构

采用主进程封装方案，复用现有 `chatNonStream` 能力。

```
Renderer (Home.tsx / WildCardRecCard.tsx)
        │
        │ 1. 读取 store.wildCardInspiration
        │    存在 → 直接渲染
        │
        │ 2. 不存在 → ipc.llmWildCardInspiration({ profile, topics })
        ▼
Main Process (electron/ipc/llm.ts 或新增 llm-wild-card.ts)
        │
        ├── 读取 prompts/wild-card-v1.md
        │     替换变量：{{profile}}, {{topic_list}}
        │
        ├── 调用 chatNonStream
        │
        ├── 解析 JSON { topic, hook }
        │
        └── 返回 NewTopic

Renderer
        │
        └── store.setWildCardInspiration(result) → 持久化到 state.json
```

---

## 5. IPC API 设计

在 `src/types/index.ts` 的 `IpcApi` 中新增：

```typescript
llmWildCardInspiration: (args: {
  profile: string
  topics: string[]
}) => Promise<NewTopic>
```

复用已有的 `NewTopic` 类型：

```typescript
type NewTopic = {
  topic: string
  hook: string
}
```

### 5.1 主进程处理器

建议在 `electron/ipc/llm.ts` 中新增处理器，与 `llmGroupInspiration` 并列：

```typescript
'llm:wildCardInspiration': async (_, { profile, topics }) => {
  return generateWildCardInspiration(profile, topics)
}
```

具体生成逻辑封装在 `electron/lib/llm-tasks.ts` 中，与 `generateGroupInspiration` 并列。

---

## 6. Prompt 策略

新建 `electron/prompts/wild-card-v1.md`。

### 6.1 角色设定

「意外之径推荐官」：你熟悉人类知识的各个领域，善于把远离学习者舒适区的概念包装成一次诱人的探索邀请。

### 6.2 输入变量

- `{{profile}}`：用户 profile 文本
- `{{topic_list}}`：学习库中所有 topic title 的列表，每行一个

### 6.3 任务要求

1. 读取用户学习历史（`{{topic_list}}`）。
2. 推荐一个与这些主题**毫不相关**的新主题。
3. 主题应来自以下跨学科候选域（但不限于）：
   - 热力学 / 熵增
   - 量子物理
   - 脑科学 / 神经科学
   - 经济学原理
   - 复杂系统
   - 认知偏差
   - 信息论
   - 进化论
   - 社会网络
   - 语言学底层结构
4. 用一句话 hook 说明：为什么一个完全不了解这个领域的人也会觉得它有趣。
5. 不要强行关联用户身份或已有主题。
6. 不要推荐列表中已存在的主题或其变体。

### 6.4 输出格式

严格 JSON，无 markdown 代码块，无额外说明：

```json
{ "topic": "熵增定律", "hook": "它解释为什么房间总会变乱，也解释宇宙最终的命运。" }
```

### 6.5 Hook 约束

- 不超过 40 个汉字
- 优先使用日常可感知的比喻
- 强调「反直觉」或「底层解释力」

---

## 7. 状态管理

在 `src/store/index.ts` 中新增：

```typescript
wildCardInspiration: NewTopic | null
setWildCardInspiration: (topic: NewTopic | null) => void
refreshWildCardInspiration: () => Promise<void>
```

### 7.1 持久化

通过 Zustand 的 persist 中间件自动写入 `~/.studyparlor/state.json`：

```json
{
  "wildCardInspiration": {
    "topic": "熵增定律",
    "hook": "它解释为什么房间总会变乱，也解释宇宙最终的命运。"
  }
}
```

### 7.2 生命周期

- 应用启动时从 `state.json` 恢复
- 用户点击刷新时：
  1. 设置 loading 状态
  2. 调用 IPC
  3. 成功后更新 store 并持久化
  4. 失败时保留旧值（如有）并显示错误提示

---

## 8. 组件清单

| 组件 | 路径 | 职责 |
|-----|------|------|
| `WildCardRecCard` | `src/components/WildCardRecCard.tsx` | 展示「意外之径」卡片，含刷新交互 |
| `Home` | `src/pages/Home.tsx` | 在分组推荐列表顶部插入 WildCardRecCard |
| `generateWildCardInspiration` | `electron/lib/llm-tasks.ts` | 读取 prompt、调用 LLM、解析结果 |
| `wild-card-v1.md` | `electron/prompts/wild-card-v1.md` | prompt 模板 |

---

## 9. 错误处理

| 错误场景 | 处理方式 |
|---------|---------|
| LLM 调用失败 | 卡片显示「这次闯入失败了」，提供重试按钮 |
| JSON 解析失败 | 记录日志，显示通用错误，保留刷新按钮 |
| 推荐内容与已有主题重复 | 在 prompt 中明确要求避免；若仍重复，用户刷新即可 |
| 学习库为空 | Prompt 降级为「推荐一个适合初学者的跨学科有趣主题」 |

---

## 10. 测试计划

- `wild-card-prompt.test.ts`：验证 prompt 变量替换、输出格式约束
- `llm-tasks.test.ts` 补充：验证 `generateWildCardInspiration` 调用与解析
- 手动测试：
  - 首页展示位置与样式
  - 刷新按钮交互
  - 持久化与重启后恢复
  - 错误状态展示

---

## 11. 风险与限制

1. **LLM 可能推荐相关主题**：prompt 虽要求「毫不相关」，但 LLM 对「相关」的判断可能不够严格，需要迭代 prompt。
2. **推荐质量不稳定**：不同运行结果差异可能较大，可通过候选域提示和 hook 约束缓解。
3. **用户刷新成本**：每次刷新都消耗一次 LLM 调用，但由用户主动触发，频率可控。

---

## 12. 后续可扩展

- 允许用户屏蔽某些领域
- 记录用户点击/刷新历史，优化推荐
- 把 wild card 主题也加入「学习库」作为学习入口
- 支持用户自定义候选域列表

---

## 13. 决策摘要

| 决策项 | 选择 |
|-------|------|
| 功能名称 | 意外之径 |
| 位置 | Home 左侧「推开下一扇门」区域顶部 |
| 视觉方案 | A：紫罗兰色条 + 「意外之径」徽章 |
| 刷新策略 | 用户手动刷新，不刷新不换 |
| 缓存策略 | 持久化到 `state.json` 的 `wildCardInspiration` |
| Prompt 位置 | `electron/prompts/wild-card-v1.md` |
| IPC | `llmWildCardInspiration` |
| 推荐约束 | 与学习历史毫不相关的跨学科主题 |
| 输出格式 | JSON `{ topic, hook }` |
