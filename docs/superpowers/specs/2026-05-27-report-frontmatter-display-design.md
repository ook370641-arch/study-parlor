# 学习报告 Frontmatter 统一与差异化渲染设计

## 目标

1. 统一管理所有学习报告和复习报告的 frontmatter 开头前缀，统一 YAML 格式、字段顺序和扩展字段
2. 在报告渲染页面开头以当前 Disco Elysium 风格显示筛选后的关键信息，避免大面积 raw YAML 干扰阅读

## 背景

当前 `MarkdownRenderer` 用 `gray-matter` 解析后丢弃 frontmatter，用户在应用内看不到任何元数据。复习报告当前用纯 markdown 正文写入，没有 frontmatter。原始对话和寓言也没有 frontmatter。旧学习报告存在字段不整齐、顺序不一致、缺少 `description` 等问题。

## 设计原则

- **核心共享 + 扩展差异**：所有文档类型共享核心字段，每种类型有自己专属的扩展字段
- **回写统一**：一个序列化引擎，按类型选择扩展模板
- **渲染差异化**：按类型决定显示哪些字段、用什么样的视觉权重
- **向后兼容**：旧文件无 `type` 时按文件名推断，无 `description` 时留空

## 1. Frontmatter Schema 设计

### 1.1 核心字段（所有类型共有，始终存在）

| 字段 | 类型 | 说明 |
|------|------|------|
| `title` | string | 文档标题 |
| `description` | string? | 副标题，一句话概括主题范围 |
| `type` | string | `progress` \| `review` \| `research` \| `fable` \| `transcript` |
| `created` | string | ISO 8601 时间戳 |
| `tags` | string[] | 标签列表 |

### 1.2 扩展字段（按类型分配）

**progress（学习报告）**：

| 字段 | 类型 | 说明 |
|------|------|------|
| `session_number` | number | 本次会话编号 |
| `difficulty` | `high` \| `mid` \| `low` | 学习难度 |
| `progress_summary` | string? | 一句话学习进度摘要 |
| `last_studied` | string? | 最后学习时间 |
| `review_count` | number | 累计被复习次数 |

**review（复习报告）**：

| 字段 | 类型 | 说明 |
|------|------|------|
| `review_index` | number | 这是第几次复习（1, 2, 3...） |
| `last_reviewed` | string | 本次复习时间 |
| `source_title` | string | 关联的原学习报告标题 |

**research（研究报告）**：

| 字段 | 类型 | 说明 |
|------|------|------|
| `difficulty` | `high` \| `mid` \| `low` | 研究难度 |
| `summary` | string? | 研究摘要 |

**fable（寓言）**：

| 字段 | 类型 | 说明 |
|------|------|------|
| `source_topic` | string | 关联的原主题 |

**transcript（原始对话）**：

| 字段 | 类型 | 说明 |
|------|------|------|
| `session_number` | number | 本次会话编号 |

### 1.3 字段写入顺序

核心字段始终在最前面，按固定顺序写入：

```yaml
---
title: Agent
description: Agent 规划方法：ToT、LLM+P、ReAct 的对比与实践现状
type: progress
created: '2026-05-23T00:00:00.000Z'
tags:
  - skill学习
  - Agent
  - LLM
session_number: 1
difficulty: mid
progress_summary: 精读 ReAct 原文术语...
review_count: 0
---
```

## 2. 回写引擎设计

### 2.1 序列化函数

`serializeFrontmatter(type, data, body)`：

1. 提取核心字段，按固定顺序放入 YAML
2. 根据 `type` 提取对应的扩展字段，按类型定义的顺序追加
3. 空值/undefined 字段跳过不写入
4. 调用 `matter.stringify(body, data)` 输出

### 2.2 需要修改的写文件路径

| 写入场景 | 文件 | 修改点 |
|---------|------|--------|
| 学习报告归档 | `electron/ipc/files.ts:writeProgress` | 加 `description` 字段，使用新的序列化函数 |
| 复习报告归档 | `electron/ipc/files.ts:writeReviewReport` | 新增 frontmatter 写入，type='review' |
| 原始对话归档 | `electron/ipc/files.ts:writeTranscript` | 新增 frontmatter 写入，type='transcript' |
| 寓言写入 | `src/lib/finalize.ts` + `electron/ipc/files.ts` | 修复当前寓言覆盖原始对话的问题，新增独立寓言写入路径，带 frontmatter |
| LLM 提取 prompt | `electron/prompts/archive-progress.md` | 增加 `description` 字段提取 |

### 2.3 description 来源

LLM 在归档学习报告时从对话中提取：

```json
{
  "title": "简短主题标题（8字以内）",
  "description": "副标题，一句话概括主题范围和内容",
  "body": "笔记正文...",
  "progress_summary": "学习进度摘要..."
}
```

`description` 是对 `title` 的补充说明，比 `title` 更具体但不等同于 `body` 内容。

## 3. 前端渲染组件设计

### 3.1 组件结构

新增 `src/components/md/ReportHeader.tsx`，由 `MarkdownRenderer` 在解析 frontmatter 后传入数据渲染。

```
MarkdownRenderer
├── ReportHeader — 类型化 frontmatter 渲染
│   ├── 类型徽章 + 元数据行
│   ├── 标题 + 副标题
│   ├── 标签行
│   └── 摘要/附加信息（按类型）
└── md-body — 正文渲染（现有，不变）
```

### 3.2 按类型差异化渲染

**progress（学习报告）**：

```
[学习报告] [中等难度]              Session #1 · 2026.05.23
Agent
Agent 规划方法：ToT、LLM+P、ReAct 的对比与实践现状
[skill学习] [Agent] [LLM]
────────────────────────────────────────
精读 ReAct 原文术语（action space / language space / observation），
理解 ReAct 的扩展 action space 机制与 Harness 分工
```

**review（复习报告）**：

```
[复习报告]                         第 1 次复习 · 2026.05.27
Agent
Agent 规划方法：ToT、LLM+P、ReAct 的对比与实践现状
[skill学习] [Agent] [LLM]
```

**research（研究报告）**：

```
[研究报告] [中等难度]              2026.05.23
ReAct 的规划机制
一篇关于 ReAct 论文的深度研究报告
[skill学习] [Agent]
────────────────────────────────────────
梳理了 ReAct 论文中 action space 与 language space 的边界...
```

**fable（寓言）**：

```
[寓言]
The Owl and the Three Planners
来源主题：Agent
```

**transcript（原始对话）**：

```
[原始对话]                         Session #1 · 2026.05.23
Agent
```

### 3.3 样式规范

沿用当前 Disco Elysium 调色板：

| 元素 | 样式 |
|------|------|
| 类型徽章 | 背景色按类型：progress=ember(#d97757)，review=wine(#8a3a3a)，research=slate(#3a5a6a)，fable=深褐+金色边框，transcript=暗灰 |
| 难度徽章 | slate(#3a5a6a) 背景 |
| 标题 | 24px，serif，#e8d5b7 |
| 副标题 | 14px，#a09080 |
| 标签 | 边框 1px #3a3028，圆角 2px |
| 摘要 | 12px，#8a8070，斜体，顶部 1px 分隔线 |
| 元数据行 | 12px，#8a8070，右对齐 |

## 4. MarkdownRenderer 集成

`MarkdownRenderer` 当前用 `gray-matter` 解析后丢弃 frontmatter。改为：

```typescript
const parsed = matter(content)
const frontmatter = parseFrontmatter(parsed.data)  // 新函数，按类型规范化
const body = parsed.content

return (
  <div className="md-container">
    <ReportHeader frontmatter={frontmatter} />
    <div className="md-body ...">...</div>
  </div>
)
```

`parseFrontmatter` 做两件事：

1. 按 `type` 字段选择对应的 schema 解析扩展字段
2. 兼容旧数据：旧文件没有 `type` 的，按文件名推断类型；没有 `description` 的，留空

## 5. 兼容性策略

| 旧数据情况 | 处理方式 |
|-----------|---------|
| 无 `type` 字段 | 按文件名推断：`学习报告.md`→progress，`复习报告.md`→review，`寓言*.md`→fable，`原始对话.md`→transcript |
| 无 `description` | 留空，不显示副标题行 |
| 旧 review 文件的 `review_count` | 该字段仅用于 progress，review 用 `review_index` |
| 旧 `last_reviewed` 在 progress 中 | 无意义，忽略 |
| `difficulty` 值为 `mid`（旧）vs `medium`（新） | 解析时统一为 `mid`，显示时映射为"中等难度" |

## 6. 修改文件清单

| 文件 | 修改类型 | 说明 |
|------|---------|------|
| `src/types/index.ts` | 修改 | 更新 `Frontmatter` 类型，拆分为核心+扩展 |
| `electron/lib/frontmatter.ts` | 重写 | 序列化函数改为按类型组织；解析函数增加类型推断和兼容处理 |
| `electron/ipc/files.ts` | 修改 | `writeProgress` 加 `description`；`writeReviewReport` 加 frontmatter；`writeTranscript` 加 frontmatter |
| `electron/ipc/files.ts`（新增 IPC） | 新增 | 新增寓言写入 IPC（或复用现有写入路径） |
| `src/lib/finalize.ts` | 修改 | 更新 finalizeProgress 调用，传入 description；更新寓言写入 |
| `electron/prompts/archive-progress.md` | 修改 | 增加 `description` 字段提取 |
| `src/components/md/ReportHeader.tsx` | 新增 | 类型化 frontmatter 渲染组件 |
| `src/components/md/MarkdownRenderer.tsx` | 修改 | 解析 frontmatter 后传入 ReportHeader |
| `src/components/md/fileType.ts` | 无需修改 | 当前已实现 frontmatter `type` 字段优先，无需变更 |
| `src/lib/ipc.ts`（或 ipc 封装） | 修改 | 更新 IPC 调用签名，传入 `description` |

## 7. 风险与注意事项

1. **旧文件不回写**：本设计只影响新写入的文件。旧文件的 frontmatter 格式不会被自动迁移，但解析时会兼容处理
2. **review 报告 breaking change**：当前复习报告是纯 markdown 无 frontmatter，新增 frontmatter 后旧复习报告在 `readMd` 时 frontmatter 为空，需要兼容
3. **LLM prompt 变更**：`archive-progress.md` 要求 LLM 多输出一个 `description` 字段，需要验证提取成功率
