# Quote 展示精细化设计文档

**日期**：2026-06-25  
**功能**：重构 `Quote` 组件在 Cover、Home、Study 三处的展示效果，解决字号过小、信息不完整的问题。  
**状态**：待实现  
**前置/相关文档**：取代 [[2026-06-21-writer-quotes-design]] 中关于 Quote 组件的展示决策。

## 1. 目标与体验

语录不应再是“看不清的小字标签”，而应成为暗色画作上的一枚清晰题签：

- **中文译文是绝对主角**，一眼可读。
- **原文、作者、出处同时展示**，保留双语声腔与来源信息。
- **三处位置统一风格**，但根据容器宽度调整对齐与最大宽度。
- **不干扰核心操作**：刷新按钮默认隐藏，hover / focus-visible 才出现。

## 2. 排版方案

采用**垂直堆叠**（方案 A）：

```
“中文译文，最大字号，居主位。”
原文（小字、斜体、更淡）
                    作者 · 《出处》
```

层级规则：

1. 中文译文：最大、最突出、不斜体。
2. 原文：次之，斜体、更淡、作为声腔补充。
3. 作者 / 出处：最小辅助信息。

对齐规则：

| 页面 | 位置 | 对齐 |
|------|------|------|
| Cover | 右下角 CTA 旁 | 右对齐 |
| Home | 学习库面板底部 | 居中对齐 |
| Study | 聊天区顶部、首条消息之前 | 居中对齐 |

## 3. 字号与样式

| 元素 | 字号 | 样式 |
|---|---|---|
| 中文译文 | **26px** | `font-serif`，正常（不斜体），行高 1.6，颜色 `text-parchment` |
| 原文 | 14px | `font-serif`，斜体，颜色 `text-parchment/60`，行高 1.5 |
| 作者 / 出处 | 14px | `font-sans`，颜色 `text-parchment/80`，用 `·` 分隔 |

可读性增强：

- 保留现有 `text-shadow: 0 1px 6px rgba(0,0,0,0.65)` 或更强阴影。
- 中文不使用 italic，避免中文斜体不自然。
- 在复杂画作背景上，依赖全局暗角与文字阴影保证可读性，不额外添加 Quote 背景遮罩。

## 4. 组件设计

### 4.1 `src/components/Quote.tsx`

```tsx
type Props = {
  surface: 'cover' | 'home' | 'study'
}
```

行为：

1. 挂载时从 `quotes` 中随机选一条（允许重复命中）。
2. 渲染中文 `text`、可选 `original`、可选 `source`、必填 `author`。
3. hover / focus-visible 时显示 ↻ 刷新按钮；点击后重新随机。
4. 没有 quote 时返回 `null`。
5. 长句截断：中文最多 3 行，原文最多 2 行。

样式变体：

- `surface="cover"`：右对齐，`max-w-[420px]`，与左侧 CTA 保持间距。
- `surface="home"`：居中对齐，容器内最大宽度 `max-w-3xl`。
- `surface="study"`：居中对齐，聊天区顶部，`max-w-3xl`。

### 4.2 页面集成

- `src/pages/Cover.tsx`：底部 flex 右侧保留 `<Quote surface="cover" />`。
- `src/pages/Home.tsx`：`StudyLibrary` 之后保留 `<Quote surface="home" />`。
- `src/pages/Study.tsx`：在聊天消息列表顶部插入 `<Quote surface="study" />`（在 `message-list` 内部、首条消息之前）。

## 5. 数据模型

沿用并扩展 `src/lib/quotes.ts` 中的 `Quote` 类型：

```ts
export type Quote = {
  id: string
  text: string        // 中文译文（必填）
  original?: string   // 原文（可选）
  author: string      // 作者中文名（必填）
  authorOriginal?: string // 作者原名（可选，本次不一定展示）
  source?: string     // 出处（可选）
}
```

- `original` 与 `source` 为空时不渲染对应行。
- 最终入库语录来自 `docs/superpowers/quotes-collection-draft-2026-06-22.md`，本次实现**不强制替换样本池**。

## 6. 行为规则

- **随机算法**：`pickRandomQuote({ excludeId })`，允许排除当前 id，但不保证必定不同。
- **手动刷新**：点击 ↻ 后重新随机。
- **生命周期**：不持久化，页面卸载后重置。
- **各 surface 独立**：Cover、Home、Study 的 Quote 各自随机。

## 7. 边界情况

- `quotes` 为空：组件返回 `null`，不抛错。
- 缺少 `original`：只显示中文 + 作者/出处。
- 缺少 `source`：只显示作者名，不渲染 `·`。
- 超长中文：最多 3 行，超出用 `line-clamp-3` 截断。
- 超长原文：最多 2 行，超出用 `line-clamp-2` 截断。
- 窄窗口 / 小屏幕：Cover 中 Quote 与 CTA 自动换行堆叠，不超出视口。

## 8. 测试

更新 `tests/quotes.test.ts`（若不存在则新增）：

- 验证 `quotes` 非空。
- 验证每条语录都有 `id`、`text`、`author`。
- 验证 `id` 唯一。

新增/更新 `tests/components/Quote.test.tsx`：

- 渲染后可见中文 `text`、作者 `author`、原文 `original`、出处 `source`。
- 缺少 `original` / `source` 时不渲染对应元素。
- 点击刷新按钮后内容可能变化（概率性断言，多次点击）。
- 三个 `surface` 变体渲染不报错。

## 9. 实现文件清单

| 文件 | 动作 | 说明 |
|------|------|------|
| `src/components/Quote.tsx` | 重写 | 新排版、新字号、三 surface 变体 |
| `src/pages/Cover.tsx` | 修改 | 调整 Quote 容器宽度与对齐 |
| `src/pages/Home.tsx` | 修改 | 保持位置，依赖 Quote 内部居中对齐 |
| `src/pages/Study.tsx` | 修改 | 在聊天区顶部插入 Quote |
| `src/lib/quotes.ts` | 可能修改 | 确认类型字段足够，可暂不替换样本池 |
| `tests/quotes.test.ts` | 新增/更新 | 数据校验 |
| `tests/components/Quote.test.tsx` | 新增/更新 | 组件行为与渲染 |

## 10. 明确不做

- 不将语录加入设置页编辑。
- 不持久化用户偏好或“今日语录”。
- 不调用 LLM 生成语录。
- 不进入 Profile、Settings、Extension 等页面。
- 本次不强制把 curated 语录全部替换进 `quotes.ts`（可后续单独入库）。

## 11. 验收标准

- [ ] 打开应用，Cover 右下角可见一句中文语录，字号明显可读，下方有原文与作者/出处。
- [ ] 进入 Home，学习库底部可见另一句语录，居中对齐。
- [ ] 进入 Study，聊天区顶部可见语录，居中对齐。
- [ ] 鼠标 hover 语录时出现 ↻ 按钮，点击后刷新。
- [ ] 缺少原文或出处时，对应行不显示，布局不崩。
- [ ] 超长语录被截断，不挤压页面。
- [ ] `npm run test` 中新增/更新测试全部通过。
- [ ] `npm run build` 无 TypeScript 错误。
