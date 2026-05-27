# GroupRecCard "从已知推未知" 重设计

**Date:** 2026-05-27  
**Scope:** `GroupRecCard` 组件、推荐 prompt 体系、策略切换 UI

---

## 1. 背景与问题

`GroupRecCard` 是首页"从已知推未知"区块的卡片组件，为每个分组推荐一个新学习主题。当前存在两个核心问题：

### 1.1 Bug: 刷新时卡片消失

`refresh()` 先同步删除缓存 (`removeGroupInspiration`)，再异步调用 `load()`。删除后组件立刻 re-render，此时 `recommendation=null` 且 `loading=false`，触发 `if (!recommendation) return null`，区块闪现消失。

### 1.2 Prompt 质量差: 推荐是延伸而非新主题

当前 `group-inspiration.md` 指令"向外推进一步，推荐一个足够 universal、有拓展价值的新主题"引导 LLM 做**已有主题的抽象延伸**（如学了 Agent 推荐"认知脚手架"），而非**知识空间中的新分支**（如学了 Agent 推荐 MCP）。Hook 也没有价值诱导约束，产出空泛。

---

## 2. 设计目标

1. 刷新全程卡片不消失，保留"正在浮现"动画
2. 推荐是"知识树上的另一个分支"，而非已有节点的深挖
3. Topic 粒度可控：30-45 分钟会话能覆盖核心概念
4. 支持多 prompt 变体 A/B 测试，用户可切换策略
5. 策略切换是**纯模式切换**，不触发任何刷新、不碰缓存

---

## 3. Bug 修复 — 刷新闪烁

### 3.1 根因

```
refresh()
  → removeGroupInspiration(group.id)   // 同步删缓存
  → load()                              // 异步开始

// 删缓存 → re-render → recommendation=null, loading=false
// → if (!recommendation) return null  // 卡片消失
// → load() 的 setLoading(true) 执行  // loading 骨架出现
```

### 3.2 修复方案

**改动一：移除 `refresh()` 中的 `removeGroupInspiration` 调用**

```typescript
// 当前
const refresh = useCallback(() => {
  removeGroupInspiration(group.id)  // ← 删除这行
  load()
}, [group.id, removeGroupInspiration, load])
```

`removeGroupInspiration` 只在组件 unmount 或分组被删除时清理，不在刷新时调用。

**改动二：loading 状态覆盖而非替换**

当前 loading 且无推荐时返回骨架 div。改为：
- 如果 `loading=true` 且 `recommendation` 存在 → 保留旧卡片，在内容区覆盖"正在浮现..."动画
- 如果 `loading=true` 且 `recommendation=null` → 返回骨架（首次加载场景）

**视觉表现**：点击刷新 → 卡片保持可见，按钮开始旋转（`animate-spin`），hook 文案区渐隐并显示"正在浮现..." → 新推荐到达后直接替换内容，无闪烁。

---

## 4. Prompt 重写 — 三个变体

### 4.1 设计原则（从用户反馈推导）

- 推荐是**同一知识空间中的另一个分支**，不是已有节点的深挖
- 弱化角色/场景硬关联，防止过拟合
- Topic 粒度：30-45 分钟覆盖核心概念，标题简洁
- Hook：说明该分支在知识树中的位置/角色，让用户意识到"值得了解"

### 4.2 v1 — 领域盲区

```markdown
你正在为一个知识领域推荐新学习主题。

领域: {{group_name}}
已覆盖的主题: {{topic_summaries}}

这个领域中，有哪些基础概念、常见技术或重要分支是学习者目前尚未覆盖的？推荐其中一个最值得了解的。

约束：
1. 不要推荐已有主题的变体、深挖、或抽象延伸。
2. 应该是该领域中"常见但你还没学"的东西——别人聊起这个领域时会默认你知道。
3. 是一个独立的、30-45分钟能覆盖核心概念的知识单元。
4. 不要硬拗与学习者个人身份的直接关联。
5. Hook 文案说明：为什么这个主题是该领域的"常识盲区"，不超过40字。

输出 JSON: { "topic": "主题名", "hook": "hook文案" }
```

### 4.3 v2 — 知识树分支（默认）

```markdown
你正在为一个知识领域推荐新学习主题。

领域: {{group_name}}
已点亮的节点: {{topic_summaries}}

这个领域是一棵知识树。已点亮的节点标记了学习者当前覆盖的位置。你的任务：在这棵树上，推荐一个尚未被点亮的、值得探索的新分支。

约束：
1. 推荐是知识树上的另一个分支，不是已有节点的深挖或抽象延伸。
2. 应该是一个独立的、30-45分钟能覆盖核心概念的知识单元。
3. 与已有节点可以有关（前置/伴生/互补/对比），但关系不必很强——关键是同属"{{group_name}}"这棵树。
4. 不要硬拗与学习者个人身份的直接关联。
5. 不要重复已有节点。
6. Hook 文案：说明这个节点在知识树中的位置/角色，让用户意识到"原来还有这个分支值得了解"。不超过40字。

输出 JSON: { "topic": "主题名", "hook": "hook文案" }
```

### 4.4 v3 — 知识闭环

```markdown
你正在为一个知识领域推荐新学习主题。

领域: {{group_name}}
已有主题: {{topic_summaries}}

这些主题之间可能存在缺口——学了 A 和 C，但中间的 B 还没学；或者学了理论但缺一个对比视角；或者学了工具但缺协议。推荐一个能填补这种缺口的概念。

约束：
1. 推荐不是已有主题的延伸，而是让已有知识更完整的一个"连接件"。
2. 是一个独立的、30-45分钟能覆盖核心概念的知识单元。
3. 不要硬拗与学习者个人身份的直接关联。
4. 不要重复已有节点。
5. Hook 文案：暗示这个主题与已有知识的连接方式（如"如果说 X 是 Y，那 Z 就是 W"），不超过40字。

输出 JSON: { "topic": "主题名", "hook": "hook文案" }
```

### 4.5 文件结构

```
electron/prompts/
  group-inspiration-v1.md   # 领域盲区
  group-inspiration-v2.md   # 知识树分支（默认）
  group-inspiration-v3.md   # 知识闭环
```

---

## 5. 策略切换 UI

### 5.1 位置

[Home.tsx](src/pages/Home.tsx) 中"从已知推未知"标题行最右侧，与文字同一行。

```tsx
<div className="flex items-center justify-between px-1">
  <span className="text-xs text-parchment/40 font-sans">从已知推未知</span>
  <StrategyToggle />
</div>
```

### 5.2 视觉设计

| 属性 | 值 |
|------|-----|
| 尺寸 | 20×20px 圆角按钮 |
| 内容 | 当前版本号文字 `v1` / `v2` / `v3` |
| 字体 | 10px 等宽数字，font-sans |
| 色标 | v1=`#d97757`(暖橙) / v2=`#7c9cb5`(石板蓝) / v3=`#6b8f71`(苔藓绿) |
| 默认态 | 文字 + 细边框（边框颜色=色标 50% 透明度） |
| Hover | 边框亮度提升，显示 tooltip |
| Tooltip | `"当前策略: v1 领域盲区 · 点击切换"` |

### 5.3 交互

- 点击后循环切换: v1 → v2 → v3 → v1
- **只改全局状态，不触发任何刷新**
- 持久化到 `state.json`
- 各分组的 `groupInspirations` 缓存完全保留

---

## 6. 数据流与状态管理

### 6.1 新增状态

```typescript
// StateJson 扩展
type StateJson = {
  // ...existing fields
  inspirationStrategy: 'v1' | 'v2' | 'v3'  // 默认 'v2'
}
```

### 6.2 IPC 扩展

```typescript
// IpcApi 扩展
llmGroupInspiration: (args: {
  groupName: string
  topics: { dirName: string; title: string }[]
  profile: Profile
  strategy?: 'v1' | 'v2' | 'v3'  // 新增，默认 'v2'
}) => Promise<NewTopic>
```

### 6.3 数据流

```
用户点击策略切换按钮
  → Zustand setInspirationStrategy('v3')
  → ipc.patchState({ inspirationStrategy: 'v3' })
  → state.json 持久化
  → 所有卡片无变化（缓存不动）

用户点击某卡片刷新
  → GroupRecCard.load() 读取当前全局 strategy
  → ipc.llmGroupInspiration({ ..., strategy })
  → electron/lib/llm-tasks.ts 读取 group-inspiration-{strategy}.md
  → LLM 调用
  → 新推荐写入该分组的 groupInspirations 缓存
```

---

## 7. 改动清单

### 7.1 文件改动

| 文件 | 改动 |
|------|------|
| `src/components/GroupRecCard.tsx` | 移除 `removeGroupInspiration` 调用；loading 时保留旧卡片并覆盖"正在浮现"动画 |
| `src/pages/Home.tsx` | 标题行右侧添加 `StrategyToggle` 组件 |
| `src/components/StrategyToggle.tsx` | 新增：策略切换按钮组件 |
| `src/store/index.ts` | 新增 `inspirationStrategy` 状态及 setter；`setGroupInspiration` 读取 strategy 传递给 IPC |
| `src/types/index.ts` | `StateJson` 新增 `inspirationStrategy`；`IpcApi.llmGroupInspiration` 新增 `strategy` 参数 |
| `electron/ipc/state.ts` | `getState` 返回默认值 `v2`；`patchState` 透传 strategy |
| `electron/ipc/llm.ts` | `llmGroupInspiration` handler 接收并传递 `strategy` |
| `electron/lib/llm-tasks.ts` | `generateGroupInspiration` 根据 `strategy` 读取对应 prompt 文件 |
| `electron/prompts/group-inspiration-v1.md` | 新增 |
| `electron/prompts/group-inspiration-v2.md` | 新增（默认） |
| `electron/prompts/group-inspiration-v3.md` | 新增 |
| `electron/prompts/group-inspiration.md` | 删除（被三个变体替代） |

### 7.2 无改动文件

`electron/lib/recommend.ts` 和 `tests/recommend.test.ts` 与此设计无关，保持不变。

---

## 8. 测试策略

### 8.1 Prompt A/B 测试流程

1. 固定一个分组（如"AI产品经理"）和一组已有主题
2. 分别用 v1/v2/v3 策略各刷新 3-5 次，记录输出
3. 评估维度：
   - 是否出现了抽象延伸/隐喻（如"认知脚手架"）→ 扣分
   - 是否是知识空间中的新分支（如 MCP）→ 加分
   - Hook 是否让人产生"想学"的冲动 → 加分
   - Topic 粒度是否在 30-45 分钟可讲完 → 加分
4. 选出最佳策略设为默认，其余保留供后续对比

### 8.2 回归测试

- 刷新卡片时卡片不消失
- 策略切换不触发任何 API 调用
- 切换策略后刷新卡片使用新 prompt
- 持久化：重启后保持上次选择的策略
