---
description: Anthropic 博客阅读器 UI 优化：可收起文章列表、新文章自动检测、标题悬停展开、精简行内文案。
paths:
  - src/components/anthropic/**
  - src/pages/Briefing.tsx
  - src/store/index.ts
  - docs/superpowers/specs/2026-07-11-anthropic-blog-ui-redesign-design.md
---

# Anthropic 博客阅读器 UI 优化设计

> 状态：已批准，待实现计划。

## 背景与目标

当前 Briefing 页面的 Anthropic 博客来源存在以下问题：

1. 文章列表固定占一列，阅读器空间被压缩。
2. 刷新按钮常驻，视觉上比较吵闹。
3. 文章标题被截断，用户无法一眼看完长标题。
4. 列表行内存在多余的“点击导入 / 阅读”提示文字。

本设计目标：在不改变数据来源和核心导入逻辑的前提下，优化列表与阅读器的空间利用、刷新提示、标题展示和文案精简。

## 改动范围

- `src/components/anthropic/AnthropicBlogPanel.tsx`
- `src/components/anthropic/AnthropicArticleRow.tsx`
- `src/pages/Briefing.tsx`（可选：来源切换时的自动触发时机）
- `src/store/index.ts`（可选：discover 调用的并发守卫）
- 相关单元/组件/E2E 测试

## 1. 布局

```
┌─────────┬───────────────────────┬──────────────────────────────┐
│ 来源栏  │  文章列表（可收起）   │        阅读器区域            │
│         │  [标题栏 ▲隐藏]      │                              │
│         │  [搜索框]             │   未选择文章时显示占位提示    │
│         │  [文章行]             │   或显示 AnthropicArticleReader│
│         │  [文章行]             │                              │
└─────────┴───────────────────────┴──────────────────────────────┘
```

- **来源栏**：保持现有最左侧导航（AI 日报 / Anthropic 博客），不改动。
- **文章列表**：由固定宽度面板改为可收起面板。
  - 展开时：宽度约 `320px`，显示标题栏、搜索、文章列表。
  - 收起时：宽度压缩为 `8–10px` 的垂直把手，位于来源栏与阅读器之间，悬停高亮，点击展开。
- **阅读器区域**：列表收起时占满剩余宽度；展开时自适应剩余空间。
- **无文章选中时**：阅读器区域仍显示占位提示；列表默认展开，避免用户不知道存在内容。

## 2. 组件改动

### 2.1 `AnthropicBlogPanel`

- 内部维护 `listVisible` 状态，默认值 `true`。
- 把现有列表包装为可收起结构：
  - 展开：渲染完整列表面板。
  - 收起：渲染一条垂直把手，把手中央可显示极小展开图标或 tooltip“展开列表”。
- 新增 `newArticleCount` 本地状态，用于显示刷新提示。

### 2.2 列表标题栏

- 右侧放置“隐藏列表”图标按钮（例如 `◀` 或 sidebar-collapse 图标）。
- 标题保持 `Anthropic Engineering`。
- 搜索框仍在标题栏下方。
- 错误状态：自动拉取失败时，标题栏显示警告图标 + tooltip，提供手动重试入口，不弹大错误。

### 2.3 `AnthropicArticleRow`

- 标题默认单行截断；整行悬停时取消截断，完整展开。
- 摘要保持 `line-clamp-2`，不展开。
- **移除**“点击导入 / 阅读”提示文字。
- 保留：
  - 左侧缩略图（来自博客卡片第一张 `<img>`，无图则显示“无配图”占位）。
  - 右侧“已保存”或“导入阅读”徽章。
  - 导入中的“取消”按钮。

### 2.4 新文章提示条

- 位置：列表顶部、搜索框下方。
- 文案：`发现 N 篇新文章 · 刷新`。
- 点击后刷新列表并隐藏提示条。
- 若列表处于收起状态，新文章提示通过把手上的小红点/数字徽标提示；点击把手展开后，用户看到提示条。

## 3. 数据流

1. **进入 Anthropic 来源时自动检测**
   - `Briefing.tsx` 切换到 `briefingSource === 'anthropic'` 后，`AnthropicBlogPanel` 在 `useEffect` 中调用 `discoverAnthropicArticles()`，带并发守卫避免重复触发。
   - 该调用会打开 Electron BrowserWindow 后台抓取 Anthropic Engineering 列表页。

2. **判断是否有新文章**
   - 拿到返回的 `articles` 后，与 `anthropicBlogCache.articles` 按 `url` 去重比较。
   - 计算 `newUrls = fetchedUrls.filter(url => !cachedUrls.has(url))`。
   - 若 `newUrls.length > 0`，设置 `newArticleCount = newUrls.length`，显示提示条。

3. **刷新列表**
   - 用户点击提示条后，把新抓取到的文章合并到 `anthropicBlogCache`（新文章前置，保留已有顺序），清空 `newArticleCount`。
   - 建议直接使用已抓取结果合并，避免再启动一次 Chromium。

4. **收起/展开**
   - 纯本地状态，不持久化。切换来源后重置为展开，避免用户找不到列表。

## 4. 错误与边界处理

- **自动抓取失败**：不阻塞页面，列表标题栏显示警告图标 + tooltip，提供手动重试入口。
- **导入失败**：保持现有行内错误提示。
- **空列表**：保持现有空态。
- **并发**：store 层 `discoverAnthropicArticles` 已有 `loading` 标志；组件内再加 `checking` 标志，防止快速切换来源时重复调用。
- **列表收起且无文章选中**：阅读器占位提示保留“选择一篇文章开始阅读”，不强制展开列表。

## 5. 测试覆盖

### 5.1 单元测试

- 新文章检测逻辑：空缓存、全部旧、部分新、URL 重复、大小写差异。
- 收起/展开本地状态切换。

### 5.2 组件测试

- 标题悬停时完整展开。
- “点击导入/阅读”提示文字不存在。
- 隐藏按钮点击后列表收起并显示把手；点击把手展开。
- 新文章提示条渲染正确数量，点击后调用刷新。

### 5.3 E2E 测试

- 切换到 Anthropic 来源后自动触发 discover。
- mock 返回包含新文章时，提示条出现；点击后列表更新。

## 6. 验收清单

- [ ] 文章列表可收起，收起后阅读器占满剩余宽度。
- [ ] 列表标题栏右上角有隐藏按钮；隐藏后左侧有垂直把手可展开。
- [ ] 进入 Anthropic 来源自动拉取列表，检测到新文章时显示提示条。
- [ ] 提示条显示新文章数量，点击后更新列表并隐藏提示。
- [ ] 列表收起时若检测到新文章，把手上有徽标提示。
- [ ] 文章标题悬停展开显示完整，摘要保持两行截断。
- [ ] 移除“点击导入/阅读”提示文字，保留“已保存/导入阅读”徽章。
- [ ] 缩略图逻辑不变（博客卡片第一张图，无图显示“无配图”）。
- [ ] 自动拉取失败不阻塞 UI，提供轻量重试入口。
- [ ] 单元/组件/E2E 测试通过。

## 参考

- 当前实现：`src/components/anthropic/AnthropicBlogPanel.tsx`、`AnthropicArticleRow.tsx`、`AnthropicArticleReader.tsx`
- 缩略图来源：`electron/lib/anthropic-scraper.ts` 中 `findCardImage` 读取卡片内第一张 `<img>`。
