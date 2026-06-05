# 续谈主题推荐统一化设计

## 1. 问题描述

当前 `topicContinueSuggestions` 缓存中存在**两种数据格式混存**：

- **旧格式**（早期 LLM 输出）：`{ title, reason }` — `reason` 是一个大字符串，内含三段内容
- **新格式**（当前 LLM 输出）：`{ title, context, rationale, benefit }` — 四个独立字段

渲染组件 `SuggestionCard` 只读取 `context`/`rationale`/`benefit`，导致旧格式缓存打开时**只有标题、无内容显示**。

同时存在以下机制缺陷：
- 缓存无过期检查，`generatedAt` 只记录不判断
- 每次打开 PreStudyModal 时，如果缓存命中就直接用，但学习历史可能已变化
- 后端 `updateContinueSuggestions` 调用 LLM 时把 `topic` 传成了 `dirName`，影响推荐质量

## 2. 设计目标

1. **统一数据格式**：所有缓存条目使用 `title/context/rationale/benefit` 四字段结构
2. **完善缓存机制**：基于学习会话数变化判断缓存有效性，避免无效重加载
3. **优化 UI 展示**：采用展开式卡片 + 图标标签，提升信息扫描效率
4. **修复后端 bug**：确保 LLM 调用时 `topic` 参数传递正确
5. **一次性迁移**：提供一次性脚本将旧缓存重生成新格式，脚本运行后删除

## 3. 数据模型

### 3.1 类型定义

```typescript
export type ContinueTopicSuggestion = {
  title: string
  context: string
  rationale: string
  benefit: string
}

export type TopicContinueCache = {
  generatedAt: string
  sessionCount: number        // ← 新增：缓存生成时的主题会话数
  suggestions: ContinueTopicSuggestion[]
}
```

`ContinueTopicSuggestion` 保持不变。`TopicContinueCache` 新增 `sessionCount` 字段，用于缓存失效判定。

### 3.2 缓存 key 结构

保持 `Record<string, TopicContinueCache>`，key 为 `dirName`。

## 4. UI 设计

### 4.1 布局：展开式卡片（Layout B）

每个续谈推荐以独立卡片展示，包含：
- **标题**：14px font-weight-600，主色 `#e8d5b7`
- **单选按钮**：右上角圆形选择器，选中态橙色边框 + 实心点
- **三段内容**：每段前带图标标签，横向 flex 排列

### 4.2 图标标签样式

| 字段 | 图标 | 语义 |
|------|------|------|
| `context` | 🔍 | 学习现状 |
| `rationale` | ➡ | 推荐理由 |
| `benefit` | 🎯 | 长期收益 |

标签为纯图标（无文字），图标大小 12px，与正文间隔 6px。未选中态图标透明度降至 40%。

### 4.3 选中 vs 未选中态

| 属性 | 选中态 | 未选中态 |
|------|--------|----------|
| 边框 | `border-ember/50` | `border-slate/20` |
| 背景 | `bg-ember/10` | 透明 |
| 标题 | `text-parchment` | `text-parchment/80` |
| 正文 | `text-parchment/70` | `text-parchment/50` |
| 图标 | 全不透明 | 40% 透明度 |
| 单选按钮 | 橙色实心 | 灰色空心 |

### 4.4 空状态处理

- 缓存加载中 → `SuggestionSkeleton`（2 条脉冲占位）
- 加载失败 → "推荐加载失败，请检查网络后重试"
- 无推荐 → "暂无推荐，自由发挥即可"

## 5. 缓存机制

### 5.1 缓存写入时机

1. **前端首次打开续谈模态框**（无缓存时）：调用 `llmGenerateContinueSuggestions` → 结果写入 store + `state.json`
2. **后端归档成功后**：`files:writeProgress` 成功后自动触发 `updateContinueSuggestions` → 结果写入 `state.json`
3. **后端删除会话后**：`deleteArchivedSession` 后自动触发 `updateContinueSuggestions`

### 5.2 缓存失效策略（会话数变化驱动）

在 `TopicContinueCache` 中新增 `sessionCount` 字段：

```typescript
export type TopicContinueCache = {
  generatedAt: string
  sessionCount: number        // ← 新增：缓存生成时的会话数
  suggestions: ContinueTopicSuggestion[]
}
```

**失效判定**：当 `PreStudyModal` 打开续谈场景时：
1. 从 `library` 中找到对应 `dirName` 的 `TopicMeta`
2. 比较 `cache.sessionCount` vs `topicMeta.sessionCount`
3. 如果不相等 → 缓存失效，重新调用 LLM 生成

这意味着：
- 新增学习报告 → 会话数增加 → 缓存失效 → 重新生成
- 删除学习报告 → 会话数减少 → 缓存失效 → 重新生成
- 会话数不变 → 缓存有效 → 直接使用

### 5.3 向后兼容

旧缓存（无 `sessionCount` 字段）视为**已失效**，触发重新生成。不需要在代码中长期保留旧格式兼容逻辑。

## 6. 旧数据迁移脚本

### 6.1 脚本定位

一次性脚本，放在 `scripts/migrate-continue-suggestions.ts`，不纳入应用运行时。

### 6.2 脚本逻辑

1. 读取 `~/.studyparlor/state.json`
2. 遍历 `topicContinueSuggestions`
3. 对每个条目检测格式：
   - 如果 `suggestions[0]` 有 `reason` 字段 → 旧格式，标记为需迁移
   - 如果 `suggestions[0]` 有 `context` 字段 → 新格式，跳过
4. 对旧格式条目，调用 `generateContinueSuggestions(dirName, title)` 重新生成
5. 更新后的缓存写入 `state.json`
6. 输出迁移报告（哪些主题已迁移、哪些失败）
7. 脚本运行后由用户手动删除

### 6.3 注意事项

- 脚本需要 `.env` 配置（KIMI_API_KEY 等），因为它直接调用 LLM
- **串行执行**：逐条调用 `generateContinueSuggestions`，避免触发 API 速率限制
- 失败的主题保留原缓存（不覆盖），并在报告中标红
- 脚本**不修改** `state.json` 中的其他字段

## 7. 渲染逻辑

### 7.1 PreStudyModal 中的加载流程

```
打开续谈模态框
  │
  ├─ 从 store 读取 topicContinueSuggestions[dirName]
  │
  ├─ 从 library 读取 topicMeta.sessionCount
  │
  ├─ 判断缓存有效性：
  │   ├─ 无缓存 → 调用 LLM 生成
  │   ├─ 有缓存但无 sessionCount（旧格式）→ 视为失效，调用 LLM 生成
  │   ├─ 有缓存但 sessionCount != topicMeta.sessionCount → 失效，调用 LLM
  │   └─ 有缓存且 sessionCount 匹配 → 直接使用缓存
  │
  └─ LLM 生成结果写入 store + state.json（含 sessionCount）
```

### 7.2 SuggestionCard 渲染

保持不变的四字段读取逻辑：
```tsx
<div className="text-xs leading-relaxed space-y-1">
  {suggestion.context && (
    <div className="flex gap-1.5">
      <span className="text-xs shrink-0 mt-0.5">🔍</span>
      <p>{suggestion.context}</p>
    </div>
  )}
  {suggestion.rationale && (
    <div className="flex gap-1.5">
      <span className="text-xs shrink-0 mt-0.5">➡</span>
      <p>{suggestion.rationale}</p>
    </div>
  )}
  {suggestion.benefit && (
    <div className="flex gap-1.5">
      <span className="text-xs shrink-0 mt-0.5">🎯</span>
      <p>{suggestion.benefit}</p>
    </div>
  )}
</div>
```

## 8. 后端修复

### 8.1 `updateContinueSuggestions` 中 topic 参数修正

当前：`generateContinueSuggestions(cfg, { topic: dirName, dirName })`  
改为：`generateContinueSuggestions(cfg, { topic: args.topic, dirName })`

修改 `updateContinueSuggestions` 的函数签名，由调用方传入正确的 `topic`（主题标题）：

```typescript
async function updateContinueSuggestions(dirName: string, topic: string)
```

调用方（`files:writeProgress` 和 `deleteArchivedSession`）在已有上下文中可获取主题标题（从报告的 frontmatter 或传入参数中），直接传入即可。

### 8.2 `TopicContinueCache` 写入时包含 `sessionCount`

后端更新缓存时，读取当前主题的会话数并写入 `sessionCount`：
```typescript
const cache: TopicContinueCache = {
  generatedAt: new Date().toISOString(),
  sessionCount: getSessionCount(dirName),  // ← 新增
  suggestions
}
```

## 9. 测试策略

### 9.1 新增测试

- `llm-tasks.test.ts`：验证 `generateContinueSuggestions` 返回的 JSON 包含 `context/rationale/benefit` 字段
- 缓存失效逻辑测试：模拟 sessionCount 变化，验证是否触发重新生成
- 旧格式缓存测试：模拟 `reason` 字段存在时，验证是否触发重新生成

### 9.2 现有测试保持通过

- `types.test.ts`：验证 `StateJson` 不包含已废弃字段
- 不影响 `recommend.test.ts` 等无关测试

## 10. 实施范围

### 修改文件清单

| 文件 | 修改内容 |
|------|----------|
| `src/types/index.ts` | `TopicContinueCache` 新增 `sessionCount` 字段 |
| `src/components/PreStudyModal.tsx` | 图标标签渲染 + 缓存失效判断逻辑 |
| `src/store/index.ts` | `topicContinueSuggestions` 默认值兼容 |
| `electron/ipc/files.ts` | `updateContinueSuggestions` 传入正确 topic + 写入 sessionCount |
| `electron/lib/llm-tasks.ts` | （可能）`generateContinueSuggestions` 参数类型优化 |
| `scripts/migrate-continue-suggestions.ts` | 新增：一次性迁移脚本 |

### 不修改的文件

- `electron/prompts/continue-suggestions_prompt_v2.md` — 提示词本身已要求四字段输出，无需修改
- `electron/ipc/llm.ts` — IPC 接口不变
- `electron/ipc/state.ts` — StateJson 类型通过 `src/types/index.ts` 自动更新

## 11. 验收标准

1. 打开任意主题的续谈模态框，推荐卡片展示标题 + 🔍➡🎯 图标标签 + 三段内容
2. 旧缓存主题打开后自动重新生成（显示 loading → 新内容）
3. 完成一次学习并归档后，再次打开同一主题的续谈，推荐内容已更新
4. 删除一次学习记录后，再次打开续谈，推荐内容已更新
5. 迁移脚本运行后，所有旧缓存条目转换为新格式
