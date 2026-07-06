# 夜航简报 UX 优化设计文档

**日期**: 2026-07-06  
**功能**: 夜航简报（Briefing）阅读体验与内容质量优化  
**状态**: 已确认，待实现  

---

## 1. 背景与目标

### 1.1 背景

夜航简报已上线双风格渲染（学术期刊 / 报纸活字）和基础 feed 聚合。经过初轮真实使用后，发现四个主要体验问题：

1. **顶部栏不统一**：两种版式下切换按钮位置不一致，「往期」按钮仅在生成今日简报后才出现。
2. **字体与信息噪音**：简报正文和标题字号偏小、字重偏轻；学术版在油画背景下阅读吃力，报纸版使用浅黄色小字；LLM 输出常带 `AI Builders Digest — Date`、`Vol.`、`档案编号`、`Briefing` 等装饰性刊头，以及顶部栏的「AI 行业日报」副标题，对普通读者是干扰。
3. **Feed 不稳定**：X 较稳定，但博客 feed 有时拉不到，导致简报内容时多时少。
4. **摘要太压缩**：从原始 JSON 到最终输出的字段过短，零基础读者难以理解某项内容的含义。

### 1.2 目标

在不改变底层 LLM pipeline（仍为主进程两次调用）的前提下，优化：

- 统一、稳定、始终可见的顶部栏。
- 可读性更强的排版 + 用户可控字号。
- 更健壮的 feed 拉取策略（重试 + 部分生成 + 源状态可见）。
- 更详细、面向零基础读者的摘要内容。

---

## 2. 决策摘要

| 决策项 | 选择 |
|-------|------|
| 整体方向 | 方案 B：阅读体验重设计 |
| Header 按钮 | A- / A+ / 重新生成 / 往期 / 主题切换，所有状态固定显示 |
| 换画按钮 | 仅在学术版出现，放到 Header 下方内容区左上角悬浮，不延伸 Header 高度 |
| 顶部信息 | 只保留「夜航简报 + 日期 + 时间」，去掉「AI 行业日报」和「生成于」 |
| 字号调节 | 全局持久化，四档：`sm` / `base(默认)` / `lg` / `xl` |
| Feed 失败 | 每个源重试 1 次；仍失败则部分生成，并在顶部显示源状态 |
| 摘要深度 | 扩展长度；新增 `explain_like_beginner` 字段；去掉装饰性刊头 |
| 双语策略 | 保留中英双语交替，中文段落内嵌小白解释 |
| 持久化字段 | `state.json.briefingFontSize` |

---

## 3. 范围与非目标

### 3.1 范围

- `src/pages/Briefing.tsx` Header 重构与状态分发。
- 新增 `BriefingHeader` 组件，统一加载/出错/成功三种状态的顶部栏。
- `AcademicBriefingLayout` 与 `NewspaperBriefingLayout` 排版、字号、颜色调整。
- 新增全局字号控制：store、持久化、A-/A+ 按钮、CSS 变量映射。
- `electron/ipc/briefing.ts` 增加 feed 重试与 `sourceStatus` 返回。
- Prompt 文件改造：增加 `explain_like_beginner`，扩展长度，禁止装饰性刊头。
- 相关单元测试、组件测试、E2E 测试更新。

### 3.2 非目标

- 不新增第三种视觉风格。
- 不改 LLM pipeline 的两次调用结构。
- 不改 `parseBriefingMarkdown` 解析规则。
- 不实现 feed 源自定义 / 后台预生成 / 内容策展（可后续二期）。

---

## 4. 顶部栏设计

### 4.1 结构

```
┌─────────────────────────────────────────────────────────────┐
│  ←      夜航简报              A-  A+  重新生成  往期  🎓/📰 │
│         2026 年 7 月 6 日 · 08:42 · X✓ 博客✗ 播客✓          │
└─────────────────────────────────────────────────────────────┘
```

- 左侧：返回封面按钮。
- 居中：刊头「夜航简报」+ 日期 + 生成时间 + 源状态标签。
- 右侧：A- / A+ / 重新生成 / 往期 / 主题切换。
- 五种按钮在**加载中、出错、未生成、生成后**均保持同一顺序和位置。

### 4.2 换画按钮

- 仅在学术版式下显示。
- 位置：Header 下方、内容区左上角悬浮小按钮，不占用 Header 高度。
- 报纸版式下完全隐藏。

### 4.3 顶部信息精简

- 去掉副标题「AI 行业日报」。
- 时间格式从「生成于 08:42」简化为「08:42」。
- 日期过去时显示完整日期 + 时间，例如 `2026 年 7 月 5 日 · 08:42`。

---

## 5. 字号与排版

### 5.1 字号档位

新增全局状态 `briefingFontSize`，四档：

| 档位 | 学术版正文 | 学术版字重 | 报纸版正文 | 报纸版字重 |
|------|-----------|-----------|-----------|-----------|
| `sm` | 14px | 400 | 14px | 500 |
| `base`（默认） | 15px | 500 | 15px | 600 |
| `lg` | 16px | 600 | 16px | 600 |
| `xl` | 17px | 600 | 17px | 700 |

- 行高统一 1.8–1.85。
- 英文段落比中文小 1–2px，斜体，使用辅助色（学术版 `#a89a86`，报纸版 `#555`）。

### 5.2 标题与层级

- 学术版主标题：20px，衬线，700 字重，米褐色 `#e8d5b7`。
- 报纸版主标题：24px，衬线，800 字重，纯黑 `#1a1a1a`。
- 章节标题同步放大 1–2 档，保持足够对比。

### 5.3 颜色

- 学术版：保留深褐油画背景，正文米褐色 `#e8d5b7`，避免浅色低对比文字。
- 报纸版：浅纸色 `#f7f5f0` 背景，正文纯黑 `#1a1a1a`，取消浅黄色小字。

### 5.4 实现方式

- 在 `Briefing.tsx` 根容器注入 CSS 变量，例如 `--briefing-body-size`。
- `AcademicBriefingLayout` 与 `NewspaperBriefingLayout` 使用 Tailwind 的 `text-[length:var(--briefing-body-size)]` 或等效类名读取变量。
- A- / A+ 按钮调用 `store.decreaseBriefingFontSize()` / `increaseBriefingFontSize()`。

---

## 6. Feed 稳定性

### 6.1 重试策略

在 `electron/ipc/briefing.ts` 中：

```typescript
async function fetchJsonWithRetry<T>(url: string, retries = 1, delay = 2000): Promise<T | null>
```

- 每个 feed 失败时自动重试 1 次，间隔 2 秒。
- 重试仍失败则记录 warn，返回 `null`。
- 三个 feed 全部失败或全部为空时才抛 `FEED_EMPTY`。

### 6.2 源状态

`BriefingResult` 增加：

```typescript
sourceStatus: {
  x: 'ok' | 'failed'
  podcasts: 'ok' | 'failed'
  blogs: 'ok' | 'failed'
}
```

- 顶部栏日期后显示状态标签：`X ✓ 博客 ✗ 播客 ✓`。
- 鼠标悬停或点击可查看具体哪个源失败。
- 缓存文件未带 `sourceStatus` 时（旧缓存），默认三个源均为 `ok`。

### 6.3 日志

失败原因打印到主进程控制台，便于排查是网络、JSON 解析还是源本身为空。

---

## 7. Prompt 与内容策略

### 7.1 提取阶段（第一次 LLM 调用）

在 `electron/prompts/briefing/summarize-*.md` 中：

- 增加字段 `explain_like_beginner`：要求用一句话向零基础读者解释「这件事到底是什么、为什么重要」。
- 增加长度目标：
  - X builder：`3–5 句`（原 2–4 句）。
  - 博客：`200–400 词`（原 100–300 词）。
  - 播客：`300–500 词`（原 200–400 词）。
- 要求结构化输出（JSON schema）包含 `explain_like_beginner`。

### 7.2 组装阶段（第二次 LLM 调用）

在 `electron/prompts/briefing/digest-intro.md` 中：

- **禁止**输出 `AI Builders Digest — [Date]`、`Vol.`、`档案编号`、`Briefing`、`学习卷宗` 等装饰性刊头。
- 正文里**不要写大标题**，标题由 UI 统一渲染为「夜航简报」。
- 每个 builder / blog / podcast 保留中英双语交替：先英文摘要，再中文解释。
- 中文段落必须包含 `explain_like_beginner` 的小白解释，文字清晰、简明、结构化。
- 保留原始链接和一句 memorable quote。
- 去掉底部「Generated through the Follow Builders skill...」版权行（与产品无关，干扰阅读）。

### 7.3 面向零基础读者的具体约束

Prompt 中明确：

- 遇到专有名词（如 RAG、fine-tuning、MCP）首次出现时给出一句通俗解释。
- 不要假设读者知道公司、产品或技术背景。
- 用类比和具体场景帮助理解，避免抽象罗列。
- 中文要自然、像人在说话，不要翻译腔。

---

## 8. 数据流与组件结构

### 8.1 新增/修改类型

```typescript
// src/types/index.ts
export type BriefingFontSize = 'sm' | 'base' | 'lg' | 'xl'

export type BriefingResult = {
  // ... 现有字段
  sourceStatus: {
    x: 'ok' | 'failed'
    podcasts: 'ok' | 'failed'
    blogs: 'ok' | 'failed'
  }
}
```

### 8.2 Store 变更

```typescript
// src/store/index.ts
briefingFontSize: BriefingFontSize
increaseBriefingFontSize: () => void
decreaseBriefingFontSize: () => void
```

- 启动时从 `state.json` 读取 `briefingFontSize`，缺失默认 `base`。
- 切换时写入 `state.json`。

### 8.3 组件清单

| 组件 | 路径 | 变更 |
|------|------|------|
| `Briefing` | `src/pages/Briefing.tsx` | Header 抽离；注入字号 CSS 变量；分发 sourceStatus |
| `BriefingHeader` | `src/components/BriefingHeader.tsx` | 新增：统一 Header，含 A-/A+/重新生成/往期/主题切换 |
| `AcademicBriefingLayout` | `src/components/briefing/AcademicBriefingLayout.tsx` | 字号/字重/颜色调整；换画按钮移至内容区 |
| `NewspaperBriefingLayout` | `src/components/briefing/NewspaperBriefingLayout.tsx` | 字号/字重/颜色调整；取消浅黄色文字 |
| `BriefingThemeToggle` | `src/components/briefing/BriefingThemeToggle.tsx` | 位置固定到 Header 右侧 |
| `SwapPaintingButton` | `src/components/SwapPaintingButton.tsx` | 学术版在 Header 下方悬浮调用 |
| `electron/ipc/briefing.ts` | `electron/ipc/briefing.ts` | 增加 fetchJsonWithRetry、sourceStatus、去除装饰性标题规则 |

---

## 9. 错误处理

| 场景 | 处理方式 |
|------|---------|
| 单个 feed 失败（重试后） | 部分生成，顶部显示该源 `✗` |
| 全部 feed 失败 | 显示「暂时无法连接夜航信号，请检查网络后重试」 |
| 全部 feed 为空 | 显示「今日海面平静，暂无新信号」 |
| LLM 调用失败 | 显示错误码与重试按钮 |
| 缓存写入失败 | 显示「（本次未写入缓存）」，内容仍展示 |

---

## 10. 测试计划

### 10.1 单元测试

- `tests/briefing.test.ts`：
  - feed 重试 1 次后成功。
  - feed 重试后仍失败时返回 `sourceStatus` 且不为 `FEED_EMPTY`。
  - 全部 feed 失败时抛 `FEED_EMPTY`。
- `tests/store.test.ts`：
  - 默认字号 `base`。
  - A-/A+ 循环限制边界。
  - 持久化到 `state.json` 后重启恢复。
- `tests/briefing-prompts.test.ts`：
  - prompt 文件包含 `explain_like_beginner`。
  - prompt 禁止装饰性刊头关键词。

### 10.2 组件测试

- `tests/briefing-header.test.tsx`：
  - 加载、出错、成功三种状态都渲染 A-/A+/重新生成/往期/主题切换。
  - 点击 A-/A+ 触发 store action。
- `tests/briefing-layout.test.tsx`：
  - 学术版与报纸版在不同字号下正确应用 CSS 变量。

### 10.3 E2E 测试

- 进入简报页即见固定 Header 按钮。
- 切换字号后关闭重进保持。
- 主题切换保持。
- 博客源失败时仍能生成，且源状态显示 `博客 ✗`。

---

## 11. 风险与缓解

| 风险 | 影响 | 缓解 |
|------|------|------|
| 摘要加长后 token 成本上升 | 每次生成费用增加 | 只调 prompt 长度目标，不增加调用次数；可后续加「精简模式」 |
| 报纸版式小屏下大字号拥挤 | 可读性下降 | 窄屏（<720px）时自动退化为单栏，字号最大只到 `lg` |
| LLM 仍输出装饰性刊头 | 信息噪音复发 | prompt 明确禁止 + 解析阶段兜底过滤 |
| 字号持久化字段与旧 state.json 冲突 | 类型错误 | 读取时缺失默认 `base` |

---

## 12. 后续可扩展

- 按 source 自定义开关（屏蔽某 builder / blog）。
- 后台启动时预生成今日简报。
- 「一句话火种」独立收藏。
- 阅读进度 / 已读标记。
