# 夜航简报 UI 升级设计文档

**日期**: 2026-06-27  
**功能**: B4 夜航简报 UI 升级 —— 双风格渲染与切换  
**状态**: 方案已确认，待实现  
**对应原型**: `.superpowers/brainstorm/1647-1782554016/content/briefing-academic-journal-v1.html`

---

## 1. 背景与目标

### 1.1 背景

夜航简报（Briefing）功能已在 V2 中作为 A0 落地：每天聚合 AI builders 的推文、播客和长文，生成中英双语日报并缓存到学习库。当前 V2 实现采用与学习页统一的深色油画背景 + 时间线布局，视觉上与"夜航"主题保持一致，但信息密度和日报阅读仪式感仍有提升空间。

### 1.2 目标

将夜航简报从单一时间线布局升级为**两种可选视觉风格**：

1. **学术期刊 · Academic Journal**：深色暖色、衬线字体、摘要/章节/参考文献结构，适合沉浸式深度学习。
2. **报纸活字 · Newspaper**：浅色纸张、双栏排版、头版标题、活字印刷感，适合快速扫读与复古阅读体验。

用户可在简报页面内一键切换风格，选择持久化到 `state.json`，下次进入自动恢复。

---

## 2. 决策摘要

| 决策项 | 选择 |
|-------|------|
| 保留风格 | **学术期刊** + **报纸活字** |
| 默认风格 | 学术期刊（与当前暗色主题一致，避免突兀切换） |
| 切换入口 | Briefing 页面顶部，与"往期"按钮并列 |
| 持久化 | `state.json.briefingTheme: 'academic' \| 'newspaper'` |
| 背景策略 | 学术期刊保留油画背景；报纸活字使用浅色纯色背景，避免与暗色画作冲突 |
| 内容结构 | 复用现有 `parseBriefingMarkdown` 输出，两种风格共享同一数据结构 |
| 字体策略 | 学术期刊正文用 serif，辅助信息用 sans-serif；报纸活字标题用高粗细 serif，元信息用 sans-serif |

---

## 3. 范围与非目标

### 3.1 范围

- 新增 `BriefingTheme` 类型与持久化字段。
- 重构 `Briefing.tsx`，根据 `briefingTheme` 渲染两种视觉风格。
- 新增 `AcademicBriefingLayout` 与 `NewspaperBriefingLayout` 两个展示组件。
- 在 `BriefingHeader` 中新增风格切换控件。
- 报纸活字风格需要适配浅色主题下的滚动条、边框、按钮颜色。
- 更新相关测试与类型。

### 3.2 非目标

- 不新增第三种风格。
- 不改已有 OKR 文档（`docs/6.27 V2 OKR.md` 与 `docs/6.27 V2 OKR Implementation.md`）。
- 不修改 feed 拉取、LLM pipeline、文件缓存逻辑。
- 不修改 `parseBriefingMarkdown` 的解析规则。
- 不在首页 Cover 或 Home 增加风格切换入口。

---

## 4. 风格一：学术期刊 · Academic Journal

### 4.1 视觉定位

深色暖色、衬线正文、期刊排版。像一本深夜阅读的学术文摘，强调"摘要—正文—参考文献"的完整结构。

### 4.2 颜色系统

| Token | 色值 | 用途 |
|-------|------|------|
| 背景 | `#1f1712` | 页面主背景 |
| 表面 | `#2a1f1a` | Header、Abstract、References 背景 |
| 边框 | `#4a3f35` | 分隔线、区块边框 |
| 强调 | `#d97757` | 章节编号、标签、链接 |
| 主文字 | `#e8d5b7` | 标题、正文 |
| 辅助文字 | `#8b7d6b` | 日期、卷号、元信息 |
| 次要正文 | `#d8c8b0` | Section body |
| 引用灰 | `#a89a86` / `#cbbba5` | 英文原文、摘要文字 |

### 4.3 布局结构

```
┌─────────────────────────────────────────┐
│ ← 返回    AI Industry Digest            │
│           夜航简报 · NIGHT BRIEFING     │
│           Vol. 2026 · No. 178 · Date    │  往期 · 🖼
├─────────────────────────────────────────┤
│                                         │
│          AI 行业每日文摘                │
│     A bilingual digest of builder ...   │
│  ─────────────────────────────────────  │
│                                         │
│  Abstract · 摘要                        │
│  [摘要正文]                             │
│  Keywords: LLM · Agents · ...           │
│                                         │
│  1  今日航标 · North Star               │
│     [中文正文]                          │
│     [English italic]                    │
│                                         │
│  2  Builder 动态 · Builder Signals      │
│     @karpathy                           │
│     [正文]                              │
│     [English italic]                    │
│                                         │
│  3  播客与长文 · Podcasts & Essays      │
│     [1] Latent Space #157 ...           │
│     [2] The Bitter Lesson Revisited ... │
│                                         │
│  ───── Spark · 一句话火种 ─────         │
│      "The agents that win..."           │
│            — 胜出的 Agent ...           │
│                                         │
│  References · 原始来源                  │
│  [1] @karpathy — On verifiable ...      │
│  [2] @swyx — Agent infra ...            │
│                                         │
└─────────────────────────────────────────┘
```

### 4.4 排版细节

- **Header**：三栏布局。左侧返回，中间刊头（小字 `AI Industry Digest` + 大字 `夜航简报 · NIGHT BRIEFING` + 卷号/日期），右侧"往期"按钮与换画按钮。
- **Title block**：居中对齐，标题 `font-size: 26px; font-weight: normal`，副标题斜体、辅助色，底部 2px 强调色下边框。
- **Abstract box**：背景表面色，1px 边框，左侧 3px 强调色边框；标签全大写、小字、字间距 2px；正文 13px、斜体、行高 1.7；Keywords 用 sans-serif 11px。
- **Section**：每个章节左侧大号数字编号（24px、ember、无衬线），右侧标题（16px、衬线、字间距 1px），正文缩进 36px，13px 行高 1.8。
- **Builder Signals**：每个 builder 一个小节，handle 用 ember 色 11px 标签，中文正文 + 英文斜体。
- **Spark**：上下 1px 边框包裹，标签小字全大写，引用 15px 斜体居中，翻译 12px 辅助色。
- **References**：表面色背景 + 边框，标签小字全大写，条目 11px sans-serif，链接 ember 色。

### 4.5 字体栈

```css
font-family: Georgia, "Times New Roman", serif; /* 正文与标题 */
font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif; /* 标签、元信息、编号 */
```

---

## 5. 风格二：报纸活字 · Newspaper

### 5.1 视觉定位

浅色纸张、双栏排版、头版感。像一份清晨摊开的报纸，信息密度高、扫描感强，与深色学术期刊形成强烈反差。

### 5.2 颜色系统

| Token | 色值 | 用途 |
|-------|------|------|
| 背景 | `#f7f5f0` | 报纸纸张色 |
| 主文字 | `#1a1a1a` | 标题、正文 |
| 辅助文字 | `#555555` | 副标题、翻译、Spark 标签 |
| 边框 | `#1a1a1a` / `#cccccc` | 顶部分隔线、分栏线、引用边框 |
| 链接 | `#1a1a1a` 下划线 | References 链接 |

### 5.3 布局结构

```
┌─────────────────────────────────────────┐
│        THE NIGHT BRIEFING               │
│   AI Industry Daily · Vol. 178 · Date   │
│   6 Builders · 2 Podcasts · 3 Essays    │
│ ═══════════════════════════════════════ │
│                                         │
│     推理效率、Agent 落地与开源工具 ...    │
│       A bilingual digest of builder...  │
│ ─────────────────────────────────────── │
│  ┌───────────────┐ ┌───────────────┐   │
│  │ NORTH STAR    │ │ PODCASTS &    │   │
│  │ 今日航标      │ │ ESSAYS        │   │
│  │               │ │ 播客与长文    │   │
│  │ OpenAI 新...  │ │ [1] Latent... │   │
│  │ [英文]        │ │ [英文]        │   │
│  │               │ │ [2] The ...   │   │
│  │ BUILDER       │ │ [英文]        │   │
│  │ SIGNALS       │ │               │   │
│  │ Builder 动态  │ │  ┌─────────┐  │   │
│  │ @karpathy...  │ │  │  SPARK  │  │   │
│  │ @swyx...      │ │  │ 一句话  │  │   │
│  │               │ │  │ 火种    │  │   │
│  │               │ │  │ "The... │  │   │
│  │               │ │  └─────────┘  │   │
│  └───────────────┘ └───────────────┘   │
│ ─────────────────────────────────────── │
│ References · 原始来源                   │
│ [1] @karpathy — ...                     │
│ [2] @swyx — ...                         │
└─────────────────────────────────────────┘
```

### 5.4 排版细节

- **Header**：居中大报头 `THE NIGHT BRIEFING`（42px、900 字重、全大写、letter-spacing -1px），下方副标题横排（`AI Industry Daily · Vol. 178 · Date · 统计`），11px sans-serif、全大写、字间距 1px，与报头之间用 3px double `#1a1a1a` 分隔。
- **Headline**：主标题居中，28px、900 字重、行高 1.15。
- **Deck**：副标题居中，14px 斜体、辅助色，与主标题共同营造头版 lead 感。
- **Rule**：主标题下方 1px 全宽横线。
- **双栏**：`grid-template-columns: 1fr 1fr; gap: 24px;`，中间 1px `#cccccc` 竖线分隔。
- **Section title**：13px、700 字重、全大写、字间距 1px、下边框 1px `#1a1a1a`、padding-bottom 6px。
- **Article title**：15px、700 字重、无衬线感标题。
- **Article body**：12.5px、行高 1.7、`text-align: justify`（两端对齐）。
- **English italic**：11px、辅助色、斜体。
- **Spark**：嵌入右栏底部，上下 1px 边框，标签小字全大写，引用 16px 700 字重，翻译 12px。
- **References**：顶部 1px 边框，标题 11px 全大写 700 字重 sans-serif，条目 11px 辅助色。

### 5.5 栏位分配规则

```
左栏: 今日航标 + Builder 动态
右栏: 播客与长文 + 一句话火种
```

如果未来 section 数量变化，按顺序奇偶分配；若仅有 1 个 section 则独占双栏。

### 5.6 字体栈

```css
font-family: Georgia, "Times New Roman", serif; /* 报头、标题、正文 */
font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif; /* 副标题、标签、References */
```

---

## 6. 风格切换机制

### 6.1 入口位置

在 `BriefingHeader` 右侧，与"往期"按钮、换画按钮并列。使用一个图标或文字按钮：

- 学术期刊模式下显示：「📰 报纸活字」
- 报纸活字模式下显示：「🎓 学术期刊」

点击后切换主题并重新渲染，不重新生成简报内容。

### 6.2 持久化

```typescript
// src/types/index.ts
export type BriefingTheme = 'academic' | 'newspaper'
```

```typescript
// state.json
{
  "briefingTheme": "academic" // 默认
}
```

读取顺序：
1. 启动时 `loadState()` 读取 `state.json`。
2. `store.briefingTheme` 初始化。
3. 进入 Briefing 页面时按 `store.briefingTheme` 渲染。
4. 用户切换时调用 `store.setBriefingTheme(theme)` 写入 `state.json`。

### 6.3 默认策略

- 新用户/未设置时默认 `academic`，与当前 V2 暗色主题一致。
- 升级时不强制迁移，未设置字段即视为 `academic`。

---

## 7. 数据解析与内容映射

### 7.1 复用现有解析器

两种风格均复用 `src/lib/parse-briefing-markdown.ts`：

```typescript
export type BriefingSection = { title: string; body: string }
export type BriefingSourceGroup = { title: string; items: string[] }
export type ParsedBriefing = { sections: BriefingSection[]; sources: BriefingSourceGroup[] }
```

### 7.2 Section 到 UI 的映射

| Markdown 标题 | 学术期刊 | 报纸活字 |
|--------------|---------|---------|
| `## 今日航标` | 第 1 章，顺序单栏 | 左栏顶部 |
| `## Builder 动态` | 第 2 章，顺序单栏 | 左栏中部 |
| `## 播客与长文` | 第 3 章，顺序单栏 | 右栏顶部 |
| `## 一句话火种` | Spark 区块 | 右栏底部 Spark 区块 |
| `## 原始来源` | References 底部 | References 底部 |

### 7.3 Abstract 处理

当前 LLM 输出未明确要求 Abstract。升级后有两种方案：

1. **推荐方案**：在 prompt 中要求 LLM 在正文前输出 `## 摘要` 或 `## Abstract`，`parseBriefingMarkdown` 将其作为普通 section，UI 特殊渲染为 Abstract。
2. **兜底方案**：若解析结果无摘要 section，用第一段自动生成（取前 120 字）。

实现时先采用方案 2 兜底，后续再逐步迁移到方案 1。

### 7.4 双语内容分离

学术期刊和报纸活字都需要区分中文和英文段落。当前 LLM 输出已经是中英交替段落，渲染时通过以下启发规则识别：

- 包含明显中文字符（`一-鿿`）的段落视为中文。
- 否则视为英文，用斜体/辅助色渲染。

未来可在 prompt 中要求使用 Markdown 引用块 `> ` 包裹英文，以便更精确解析。

---

## 8. 组件结构

### 8.1 新增组件

| 组件 | 路径 | 职责 |
|-----|------|------|
| `AcademicBriefingLayout` | `src/components/briefing/AcademicBriefingLayout.tsx` | 学术期刊风格完整布局 |
| `NewspaperBriefingLayout` | `src/components/briefing/NewspaperBriefingLayout.tsx` | 报纸活字风格完整布局 |
| `BriefingThemeToggle` | `src/components/briefing/BriefingThemeToggle.tsx` | 顶部风格切换按钮 |
| `BriefingAbstract` | `src/components/briefing/BriefingAbstract.tsx` | 摘要区块（两风格共用） |
| `BriefingSpark` | `src/components/briefing/BriefingSpark.tsx` | 一句话火种区块（两风格共用） |
| `BriefingReferences` | `src/components/briefing/BriefingReferences.tsx` | 原始来源区块（两风格共用） |

### 8.2 修改组件

| 组件 | 路径 | 变更 |
|-----|------|------|
| `Briefing` | `src/pages/Briefing.tsx` | 根据 `briefingTheme` 分发到对应 Layout |
| `BriefingHeader` | `src/components/BriefingHeader.tsx` 或内联 | 新增主题切换按钮 |
| `SurfaceBackground` | `src/components/SurfaceBackground.tsx` | 报纸活字模式下可禁用或替换为背景色 |

### 8.3 组件分发逻辑

```tsx
// src/pages/Briefing.tsx 核心分发
const theme = useStore(s => s.briefingTheme)

return (
  <div className={theme === 'newspaper' ? 'bg-[#f7f5f0] text-[#1a1a1a]' : 'relative'}>
    {theme === 'academic' ? (
      <AcademicBriefingLayout parsed={parsed} result={result} />
    ) : (
      <NewspaperBriefingLayout parsed={parsed} result={result} />
    )}
  </div>
)
```

---

## 9. 状态管理

### 9.1 新增类型

```typescript
// src/types/index.ts
export type BriefingTheme = 'academic' | 'newspaper'
```

### 9.2 Store 变更

```typescript
// src/store/index.ts
export interface AppStore {
  // ... 现有字段
  briefingTheme: BriefingTheme
  setBriefingTheme: (theme: BriefingTheme) => void
}
```

### 9.3 持久化

在 `src/store/index.ts` 的 `loadState` / `saveState` 逻辑中加入：

```typescript
briefingTheme: loaded.briefingTheme ?? 'academic'
```

`state.json` 结构：

```json
{
  "profile": { ... },
  "lastUsed": { ... },
  "groupInspirations": { ... },
  "topicContinueSuggestions": { ... },
  "session_count": 12,
  "terminology": { ... },
  "briefingTheme": "academic"
}
```

---

## 10. LLM 输出调整（可选，向后兼容）

### 10.1 推荐改动

在 `electron/prompts/briefing/digest-intro.md` 中增加：

```markdown
### Abstract

在正文前用 100-150 字写一段中文摘要，放在 `## 摘要` 标题下。
摘要后列出 3-5 个英文关键词，格式为 `Keywords: word1 · word2 · ...`。

### Structure

按以下顺序输出：
1. ## 摘要
2. ## 今日航标
3. ## Builder 动态
4. ## 播客与长文
5. ## 一句话火种
6. ## 原始来源
```

### 10.2 向后兼容

即使 LLM 不输出摘要，`BriefingAbstract` 组件也会用第一段内容兜底生成摘要，避免空状态。

---

## 11. 测试计划

### 11.1 单元测试

- `tests/parse-briefing-markdown.test.ts`（已存在）：验证解析器对摘要 section 的识别。
- `tests/briefing-theme.test.ts`（新增）：
  - 默认 theme 为 `academic`。
  - `setBriefingTheme('newspaper')` 更新 store 并持久化。
  - 从 `state.json` 加载时恢复 theme。

### 11.2 组件渲染测试（可选，Vitest + React Testing Library）

- `AcademicBriefingLayout` 渲染深色背景、Abstract、References。
- `NewspaperBriefingLayout` 渲染双栏、报头、Spark 在右栏。
- `BriefingThemeToggle` 点击触发 `setBriefingTheme`。

### 11.3 E2E 测试

详见第 12 节。

---

## 12. E2E 关注点

- Cover → Briefing 导航后，默认展示学术期刊风格。
- 点击主题切换按钮 → 切换到报纸活字风格，背景变为浅色，文字变为深色。
- 切换风格不触发新的 LLM 调用，loading 状态不变。
- 关闭应用重新进入 Briefing → 恢复上次选择的风格。
- 学术期刊风格：可见 Abstract、章节编号、Spark、References。
- 报纸活字风格：可见双栏布局、报头、分栏线、Spark 位于右栏。
- 往期抽屉在两种风格下均正常工作。
- 返回封面按钮在两种风格下均可见且可点击。

---

## 13. 风险与限制

| 风险 | 影响 | 缓解 |
|-----|------|------|
| 报纸活字浅色背景与全局暗色主题冲突 | 滚动条、弹窗、抽屉可能不协调 | 为该风格单独覆盖滚动条颜色；抽屉使用与主题一致的浅/深背景 |
| 双栏布局在小屏幕或窄窗口下拥挤 | 报纸风格可读性下降 | 在宽度 < 720px 时自动退化为单栏 |
| LLM 输出结构不稳定 | Abstract 或 section 缺失 | 用兜底摘要 + 按标题动态映射 |
| 用户可能期望更多风格 | 后续维护成本 | 本次只实现两种，明确非目标 |

---

## 14. 决策摘要表

| 决策项 | 选择 |
|-------|------|
| 保留风格 | 学术期刊 + 报纸活字 |
| 默认风格 | 学术期刊 |
| 切换入口 | Briefing 页面 Header |
| 持久化字段 | `state.json.briefingTheme` |
| 背景处理 | 学术期刊保留油画；报纸活字用纯色 `#f7f5f0` |
| 解析器 | 复用 `parseBriefingMarkdown`，不修改 |
| 新增组件 | `AcademicBriefingLayout`、`NewspaperBriefingLayout`、`BriefingThemeToggle` 等 |
| LLM 改动 | 可选：prompt 增加摘要要求，向后兼容 |
| 响应式 | 报纸活字在窄屏退化为单栏 |
| 文档约束 | 不修改已有 OKR 文档 |

---

## 15. 工程进度与缺口

> 基于 2026-06-27 代码审计结果更新。

### 15.1 已实现基础

| 模块 | 状态 | 位置 |
|---|---|---|
| Cover 入口 | ✅ | `src/pages/Cover.tsx` |
| IPC `briefing:generate` / `briefing:list` | ✅ | `electron/ipc/briefing.ts` |
| 缓存命中/生成、FEED_EMPTY、cacheWriteFailed | ✅ | `electron/ipc/briefing.ts` |
| Store `briefing` / `briefingHistory` | ✅ | `src/store/index.ts` |
| Markdown 解析器 | ✅ | `src/lib/parse-briefing-markdown.ts` |
| 历史侧栏 | ✅ | `src/components/BriefingHistoryDrawer.tsx` |
| 单元测试 | ✅ | `tests/briefing.test.ts`、`tests/briefing-parser.test.ts` |

### 15.2 当前缺口

| 缺口 | 影响 | 解决方案 |
|---|---|---|
| 无"重新生成"按钮 | OKR Implementation 的 E2E 矩阵要求 | 在 `BriefingHeader` 增加，触发 `briefing:generate({ force: true })` |
| FEED URL 硬编码 | 无法稳定复现 FEED_EMPTY/网络失败 | 支持 `BRIEFING_FEED_X_URL` 等环境变量覆盖 |
| 无 `seedBriefing` helper | E2E 缓存命中场景难以构造 | 在 `e2e/helpers/test-library.ts` 新增 |
| 无 briefing E2E spec | OKR 验收要求 A0 全流程 E2E | 新增 `e2e/specs/briefing.spec.ts` |
| B4 双风格 UI 未实现 | 本 spec 核心目标 | 新增类型、store、Layout、Toggle |

### 15.3 实现后补充

以下是在实现过程中发现并已修复的问题：

1. **Electron IPC 错误包装**：renderer 端收到的 `err.message` 是 `"Error invoking remote method 'briefing:generate': Error: FEED_EMPTY"`，无法直接用 `=== 'FEED_EMPTY'` 匹配。store 中通过子串提取还原为 `'FEED_EMPTY'`。
2. **网络失败与 FEED_EMPTY 区分**：最初 `fetchJson` 对 HTTP 非 2xx 返回 `null`，导致网络失败被误判为 `FEED_EMPTY`。改为抛出 `NETWORK_ERROR`。
3. **E2E 并发 CDP 端口冲突**：`main.ts` 在 `NODE_ENV === 'test'` 时强制 `9222` 端口，多个 Electron 进程并发时冲突。改为识别 `E2E_CONFIG_DIR` 时不强制端口，使用 fixture 传入的动态端口。
4. **Hook 调用位置**：`Briefing.tsx` 最初在 JSX 属性中调用 `useStore`，生产构建下触发 React error #310。已改为在组件顶层提取 `historyError` 变量。

### 15.4 Section 语义映射（兼容现有缓存）

当前 LLM prompt 输出的 section 标题为英文（`X / Twitter`、`Official Blogs`、`Podcasts`），且没有独立的"摘要"和"一句话火种"章节。为了兼容已生成的缓存文件，两种 Layout 采用以下**语义化映射**而非字面标题匹配：

| 语义 | 来源 | 学术期刊渲染 | 报纸活字渲染 |
|---|---|---|---|
| Abstract / 摘要 | 第一个非来源 section 的前 120 字（可配置） | 顶部 Abstract 区块 | 报头下方的 Lead/Abstract |
| 内容 sections | 第一个至倒数第二个非来源 section | 顺序编号章节 | 按奇偶分配到左/右栏 |
| Spark / 一句话火种 | 最后一个非来源 section | 居中 Spark 区块 | 右栏底部 Spark 区块 |
| References / 原始来源 | `parsed.sources` | 底部 References 区块 | 底部 References 区块 |

> 若未来调整 prompt 输出 `## 摘要` 和 `## 一句话火种`，可直接识别并替换上述兜底逻辑。

### 15.5 E2E 覆盖矩阵

| 场景 | 标记 | 前置条件 | 关键断言 |
|---|---|---|---|
| Cover → Briefing 导航 | `@smoke` | 应用启动到 Cover | 点击 briefing button 后进入 briefing 页面 |
| 默认学术期刊风格 | `@smoke` | 进入 Briefing | 可见 `data-testid="briefing-academic-layout"` |
| 切换到报纸活字风格 | `@smoke` | 在 Briefing 页面 | 点击 toggle 后可见 `data-testid="briefing-newspaper-layout"` |
| 风格持久化 | `@smoke` | 切换到 newspaper | `state.json.briefingTheme` 变为 `"newspaper"` |
| 有缓存时直接展示 | `@smoke` | `seedBriefing` 预写当天简报 | 标题、日期、内容区渲染；不触发 LLM |
| 无缓存时展示 loading | `@unstable` | 无缓存 | `BriefingSkeleton` 出现 |
| 历史侧栏切换 | `@smoke` | 预写多份不同日期简报 | 点击"往期"后列出日期；点击日期切换内容 |
| 重新生成 | `@unstable` | 有缓存 | 点击重新生成后触发 `briefing:generate({ force: true })` |
| FEED_EMPTY 错误 | `@smoke` | feed URL 指向返回空数组的本地 server | 显示"今日海面平静，暂无新信号。" |
| 网络失败错误 | `@smoke` | feed URL 指向返回 500 的本地 server | 显示错误提示与重试按钮 |
| cacheWriteFailed | `@smoke` | 学习库目录只读 | 页面显示"（本次未写入缓存）" |
| 真实生成 happy path | `@unstable` | 外网正常、Kimi 可用 | 内容非空、文件写入 `夜航简报/` |
