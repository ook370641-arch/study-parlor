---
description: 夜航简报五项小升级：折叠列箭头居中、彩色边框替代文字标签、导入动画、移除摘要、文本备注系统。极乐迪斯科风格 × 波兰尼默会知识交互设计。
paths:
  - src/components/BriefingListColumn.tsx
  - src/components/BriefingSourceSidebar.tsx
  - src/components/anthropic/AnthropicBlogPanel.tsx
  - src/components/anthropic/AnthropicArticleRow.tsx
  - src/components/anthropic/AnthropicArticleReader.tsx
  - src/components/article-assistant/ArticleBodyChunks.tsx
  - docs/superpowers/specs/2026-07-14-briefing-polish-design.md
---

# 夜航简报五项小升级设计

> 日期：2026-07-14
> 状态：已完成
> 前置 spec：
> - `2026-07-11-briefing-blog-reader-ui-redesign-design.md`（统一三栏架构）
> - `2026-07-11-briefing-assistant-design.md`（旁注面板）

## 1. 问题概述

当前夜航简报存在五个可优化点：

1. **折叠列箭头未居中**：`BriefingSourceSidebar` 和 `BriefingListColumn` 折叠后，`▶` 箭头在 header 行内偏左，不在 `w-14` 列的水平居中位置。
2. **博客缩略图独立 rail**：`AnthropicBlogPanel` 折叠后，缩略图列表渲染在折叠列**右侧**的独立 `w-14` rail，而非收纳在折叠列内部的箭头下方。
3. **"已保存""导入阅读"文字标签挤占标题空间**：`AnthropicArticleRow` 右侧的状态标签占据约 `4.5rem` 宽度，导致长标题被截断。
4. **文章列表摘要冗余**：卡片内 `article.summary` 在标题下方显示 2 行摘要，信息密度过高。
5. **缺少文本备注能力**：阅读博客长文时无法对感兴趣的文段做本地笔记。

## 2. 设计目标

- 统一折叠列行为：箭头水平居中 + 缩略图收纳于折叠列内部。
- 以颜色（边框）取代文字传达状态，释放标题空间。
- 导入过程有可感知的动画反馈。
- 降低列表信息密度。
- 提供纯本地、无 LLM 依赖的文本备注功能，存储为独立 `.md` 文件。

## 3. 非目标

- 不新增 LLM 调用或 prompt。
- 不修改数据来源、导入逻辑、生成 pipeline。
- 不改变三种来源的顶层路由结构。
- 备注功能不联动旁注·MARGIN（该功能已独立运作）。

## 4. 关键决策

| 决策点 | 选择 | 理由 |
|--------|------|------|
| 状态标识 | 左侧 3px 边框颜色 | 暖橙 = 已保存，浅色 = 未导入；颜色即语言，无需文字 |
| 导入动画 | 光泽扫过（shimmer sweep） | 顶部一条暖橙光泽从左扫到右，优雅不吵闹 |
| 折叠缩略图 | 收纳于折叠列内部 | 与来源栏行为一致，不额外生成独立 rail |
| 备注存储 | 博客文章同目录 `annotations.md` | 与旁注聊天记录一致策略，备注跟着文章走 |
| 备注 Marker | 末字右上角 ✎ 笔标 | 类似角注，不占行距，明确关联到被标注文字 |
| 备注浮卡 | 文字上方弹出 + A 方案左框风格 | 不推动正文，暖橙左边框与迪斯科主题统一 |
| 备注交互 | 选中 → ✎ 出现在末字右上角 → 点开 → 编辑 → 保存 | 与原型交互一致 |

## 5. 详细改动

### 5.1 折叠列箭头居中 + 缩略图收纳

**文件**：`src/components/BriefingListColumn.tsx`、`src/components/BriefingSourceSidebar.tsx`

**`BriefingListColumn` 改动：**
- 折叠时 header 内箭头 `▶` 水平居中（`mx-auto` 或 `justify-center`），不再靠左。
- 折叠时 `<div className="flex-1 min-h-0 overflow-y-auto">` 仍然渲染，展示缩略图/日期标签，而非 `!collapsed &&` 隐藏全部 children。
- 博客列表折叠时的缩略图列表（当前在 `AnthropicBlogPanel` 内的独立 rail）移除，改为通过 `BriefingListColumn` 的 children 注入。

**`BriefingSourceSidebar` 改动：**
- 折叠时箭头 `▶` 水平居中，与 `BriefingListColumn` 一致。

**`AnthropicBlogPanel` 改动：**
- 删除 `listCollapsed &&` 分支中的独立 `w-14` 缩略图 rail。
- 改为将缩略图列表作为 `BriefingListColumn` 的 children 在折叠态下渲染：折叠列展开时显示完整列表（标题+搜索框+文章行），折叠时在 `w-14` 内显示缩略图列。

```
展开：                          折叠：
┌──────────────────┐           ┌────┐
│ 标题         ◀   │           │ ▶  │  ← 箭头水平居中
├──────────────────┤           │ 📄 │  ← 缩略图在箭头下方
│ 🔍 搜索…        │           │ 📄 │
│ 📄 文章标题1    │           │ 📄 │
│ 📄 文章标题2    │           │    │
└──────────────────┘           └────┘
```

### 5.2 边框标识 + 导入动画

**文件**：`src/components/anthropic/AnthropicArticleRow.tsx`

**移除：**
- 右侧 `shrink-0 flex flex-col items-end gap-2 min-w-[4.5rem]` 容器及其内的"已保存" `span` 和"导入阅读" `span`。
- 导入中的"取消"按钮（保留 AbortController 逻辑，但取消入口改为点击卡片本身或全局 loading 指示器）。

**新增：**
- 卡片左侧 3px 边框，颜色由 `isSaved` 决定：
  - 已保存：`border-l-[3px] border-l-ember`（暖橙 `#d97757`）
  - 未导入：`border-l-[3px] border-l-[rgba(232,213,183,0.12)]`（浅色）
- 导入中状态：边框呼吸动画 + 顶部光泽扫过（shimmer sweep）。CSS：
  - `@keyframes shimmer`：`left: -60% → 100%`，`background: linear-gradient(90deg, transparent, #d97757, transparent)`，duration 1.2s
  - `@keyframes borderPulse`：`border-left-color` 在 `#d97757` 和 `rgba(217,119,87,0.25)` 之间交替，duration 1s
- 导入中标题右侧显示旋转小图标（`import-spinner`），导入完成后消失。
- 导入完成 → 边框 0.3s transition 到稳定暖橙，图标消失。

**报纸主题适配：**
- 已保存：`border-l-[#1a1a1a]`
- 未导入：`border-l-[#c9c3b8]/30`
- 导入动画同上，颜色换为 `#1a1a1a`

**取消导入：**
- 导入中点击卡片 → 触发 `cancelImport()`，动画停止，卡片恢复未导入状态。
- 保留 `cancelAnthropicImport` store action。

### 5.3 移除文章摘要

**文件**：`src/components/anthropic/AnthropicArticleRow.tsx`

移除摘要相关代码：
```tsx
{/* 删除以下 */}
{article.summary && (
  <p className={`text-sm mt-2 line-clamp-2 ${secondaryText}`}>{article.summary}</p>
)}
```

搜索框仍然支持摘要搜索（`filter` 中保留 `a.summary` 匹配），只是不显示。

### 5.4 文本备注系统

#### 5.4.1 数据模型

**文件**：`src/types/index.ts`（新增类型）

```ts
export interface ArticleAnnotation {
  id: string            // unique id, e.g. "a1", "a2"
  selectedText: string  // the exact text selected by user
  note: string          // user's note content
  paragraphIndex: number // paragraph index (1-based) for positioning
  createdAt: string     // ISO date
  updatedAt: string     // ISO date
}
```

**存储格式**（与博客 `.md` 同目录，文件名为 `<article-filename>.annotations.md`）：

例如：博客文章 `anthropic-blog/claude-constitution.md` → 备注文件 `anthropic-blog/claude-constitution.annotations.md`

```markdown
---
article_url: https://www.anthropic.com/...
created_at: 2026-07-14
updated_at: 2026-07-14
---

## a1

**选中文字：** active reasoning partner
**备注：** 这里体现了波兰尼"焦点觉知"与"辅助觉知"的区分。
**段落：** §2
**创建：** 2026-07-14

---

## a2

**选中文字：** Polanyi's concept of personal knowledge
**备注：** 波兰尼在《个人知识》中论证，科学发现的核心是科学家个人的判断力。
**段落：** §4
**创建：** 2026-07-14
```

- 使用 gray-matter 解析 frontmatter，正文为每个 annotation 的 section
- `paragraphIndex` 用于重新打开文章时定位：遍历文章 DOM 段落，在第 N 段内搜索 `selectedText` 匹配

#### 5.4.2 IPC 接口

**新增 IPC**：`annotations:read`、`annotations:write`

```ts
// electron/ipc/files.ts 或新文件 electron/ipc/annotations.ts
ipcMain.handle('annotations:read', async (_event, articlePath: string) => {
  // 读取 <articlePath>.annotations.md，返回 ArticleAnnotation[]
})

ipcMain.handle('annotations:write', async (_event, articlePath: string, annotations: ArticleAnnotation[]) => {
  // 写入 <articlePath>.annotations.md
})
```

- `annotations:read`：文件不存在时返回 `[]`
- `annotations:write`：原子写入（先写临时文件再 rename）

#### 5.4.3 渲染层

**文件**：新增 `src/components/article-assistant/ArticleAnnotations.tsx`

组件职责：
1. 接收 `articlePath`，通过 IPC 加载 annotations
2. 在 `AnthropicArticleReader` 的正文渲染后，扫描 DOM 中匹配的文本节点，包裹为 `.anno-wrap` + 插入笔标
3. 管理笔标的展开/收起状态
4. 管理浮卡的新建/编辑/保存/删除

**笔标渲染逻辑：**
- 解析 annotations，按 `selectedText` 在正文 HTML 中查找匹配
- 将匹配文本包裹为：
  ```html
  <span class="anno-wrap" data-anno-id="a1">
    <span class="anno-text">active reasoning partner</span>
    <span class="anno-pen has-note" data-anno-id="a1">✎</span>
  </span>
  ```
- `.anno-text`：`background: rgba(217,119,87,0.13)` + `border-bottom: 1px dashed rgba(217,119,87,0.3)`
- `.anno-pen`：`position:absolute; top:-9px; right:-7px`，圆形 18px，空心/实心按 `has-note` 切换

**选中 → 新建备注（核心交互）：**
1. `mouseup` 事件 → 检测是否有选中文字在文章区域内
2. 有选中 → 计算 `window.getSelection().getRangeAt(0)` 的 `endRect`
3. 在 `endRect.right - articleRect.left + 2px`, `endRect.top - articleRect.top - 14px` 处渲染 ghost pen（脉冲动画的空心 ✎）
4. 点击 ghost pen → 包裹选中文字为 `.anno-wrap` → 打开浮卡
5. 点击其他位置 → ghost pen 消失

**浮卡组件（内嵌于 `.anno-wrap`）：**
- `position:absolute; bottom:calc(100% + 10px); left:-4px`
- 左侧 3px `#d97757` 边框，圆角 `0 6px 6px 0`
- 背景 `#241b16`，小三角指向下方文字
- `textarea` 直接可编辑，点击「保存」写入 annotations.md
- 点击卡片外部 → 自动保存并关闭
- 有「删除」按钮

#### 5.4.4 集成点

**`AnthropicArticleReader`**：
- 正文渲染完成后挂载 `ArticleAnnotations`
- 传入 `filePath` 作为 annotations 的查找路径

**`ArticleBodyChunks`**：
- 无需改动。Annotations 在更外层操作 DOM。

#### 5.4.5 报纸主题适配

- `.anno-text` 背景改为 `rgba(217,119,87,0.08)`
- `.anno-pen` 背景 `#fff`，边框 `#d97757`
- 浮卡背景 `#f5f2ed`，文字 `#1a1a1a`，左边框保持 `#d97757`

## 6. 组件变更清单

| 组件/文件 | 变更 |
|-----------|------|
| `BriefingListColumn.tsx` | 箭头水平居中；折叠态渲染 children（缩略图/日期） |
| `BriefingSourceSidebar.tsx` | 箭头水平居中 |
| `AnthropicBlogPanel.tsx` | 删除独立缩略图 rail；缩略图注入折叠列 children |
| `AnthropicArticleRow.tsx` | 移除状态标签和摘要；新增左框颜色 + 导入 shimmer 动画 |
| `AnthropicArticleReader.tsx` | 集成 `ArticleAnnotations` |
| `ArticleAnnotations.tsx` | **新增**：备注渲染、选中检测、笔标、浮卡、CRUD |
| `electron/ipc/annotations.ts` | **新增**：`annotations:read` / `annotations:write` IPC |
| `src/types/index.ts` | 新增 `ArticleAnnotation` 类型；IPC API 声明 |
| `electron/preload.ts` | 暴露 `annotations:read` / `annotations:write` |

## 7. 状态与数据流

- 备注状态为本地组件状态，不进入 Zustand store。
- `ArticleAnnotations` 内部维护 `annotations: ArticleAnnotation[]`。
- 加载：`useEffect` → `ipc.annotations:read(filePath)` → setState。
- 保存：每次编辑后调用 `ipc.annotations:write(filePath, annotations)`。
- 导入中的 `AbortController` 逻辑保持不变，仅在 UI 层替换为动画 + spinner。

## 8. 边界与错误处理

- annotations 文件不存在 → 返回 `[]`，首次保存时创建。
- 正文中找不到匹配文本 → 跳过该 annotation（可能原文已变更），不报错。
- 同一段文字多次选中 → 允许，创建独立 annotation（不同 id）。
- IPC 写失败 → toast 提示用户，不静默丢失。
- 导入被取消 → 动画停止，边框恢复未导入状态。
- 导入失败 → 错误提示，边框恢复，可重试。

## 9. 测试计划

### 组件测试

| 测试项 | 文件 |
|--------|------|
| `BriefingListColumn` 折叠时箭头居中、children 渲染 | 现有测试扩展 |
| `BriefingSourceSidebar` 折叠时箭头居中 | 现有测试扩展 |
| `AnthropicArticleRow` 不渲染状态标签和摘要 | 现有测试更新 |
| `AnthropicArticleRow` 渲染正确左框颜色（saved/unsaved） | 新增 |
| `AnthropicArticleRow` 导入中渲染 shimmer 动画 + spinner | 新增 |
| `ArticleAnnotations` 渲染笔标、展开/收起浮卡 | 新增 |
| `ArticleAnnotations` 选中文字 → ghost pen 出现 | 新增（jsdom 模拟） |
| `annotations:read/write` IPC 读写 | 新增 |

### E2E 测试

E2E 覆盖范围判定：五点中仅 **Point 3（彩色边框 + shimmer 导入动画）** 和 **Point 5（文本标注系统）** 需要 E2E——前者涉及导入态完整生命周期（状态转换 + IPC），后者涉及 DOM 操作 + 文件持久化 + 跨重开恢复。其余三点为纯 CSS 布局或渲染变更，单元测试已充分覆盖。

| 测试ID | 覆盖功能 | 文件 | 描述 |
|--------|----------|------|------|
| E2E-8 | Point 3: 导入边框动画 | `anthropic-blog-ui.spec.ts` | 未保存文章无 ember 边框 → 点击导入 → shimmer+spinner+"导入中…"可见 → 导入完成 ember 边框+saved testid 可见 |
| E2E-A1 | Point 5: 标注全生命周期 | `article-annotations.spec.ts`（新建） | 导入文章 → 模拟文本选中 → 幽灵笔出现 → 点击打开备注卡 → 输入保存 → 标注标记可见 → `.annotations.md` 写盘 → 重开文章标注持久化 → 编辑 → 删除标记移除 |

**新增 selector：**
```ts
annotations: {
  ghostPen: '[data-testid="anno-ghost-pen"]',
  noteCard: '[data-testid="anno-note-card"]',
  noteTextarea: '[data-testid="anno-note-textarea"]',
  saveButton: '[data-testid="anno-save-button"]',
  deleteButton: '[data-testid="anno-delete-button"]',
  markerPen: '[data-testid="anno-marker-pen"]',
  markedText: '[data-testid="anno-marked-text"]',
}
```

**E2E 兼容性：** `anthropic-article-saved` testid 以隐藏 `<span>` 形式保留在 `AnthropicArticleRow` 中（`className="sr-only"`），确保现有 `anthropic-blog.spec.ts` 的 `filter({ has: ... })` 选择器不受边框替代文字标签的影响。

## 10. 验收标准

- [ ] 折叠列箭头在 `w-14` 内水平居中。
- [ ] 博客列表折叠后缩略图排列在箭头下方，无独立 rail。
- [ ] 文章行以左侧 3px 边框颜色区分已保存/未导入，无文字标签。
- [ ] 导入中：边框呼吸 + 顶部光泽扫过 + 标题旁旋转图标。
- [ ] 导入完成：0.3s 过渡到稳定暖橙边框。
- [ ] 文章行不显示摘要。
- [ ] 拖拽选中文字 → ✎ 出现在末字右上角 → 点击弹出浮卡 → 可编辑保存。
- [ ] 保存后文字有琥珀底色 + 实心笔标，下次打开默认收起。
- [ ] 备注持久化到 `annotations.md`，跨会话保留。
- [ ] 学术/报纸双主题下颜色正确适配。
- [ ] 所有相关单元测试通过（465 tests, 66 files）。
- [ ] E2E-8：导入 shimmer 动画 + 边框状态转换通过。
- [ ] E2E-A1：标注创建、持久化、重开、编辑、删除全生命周期通过。
