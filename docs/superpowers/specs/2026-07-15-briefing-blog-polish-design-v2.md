# 夜航简报微调 v2 — 设计规格（修正版）

**日期**: 2026-07-16  
**状态**: 修正后待实现  
**范围**: 博客文章页 UI、旁注交互、导读侧边栏

---

## 问题清单（修正后）

| # | 问题 | 根因 | 类型 |
|---|------|------|------|
| 1 | 已导入博客文章边框只有橙色左边框；未导入文章残留白/灰上右下边框 | `AnthropicArticleRow` 基础 `border` 类使用 Tailwind 默认色，仅在 `isSaved` 分支覆盖三边 | 样式补全 |
| 2 | 选中文字后🖊幽灵笔不出现 + 高亮迅速消失 | `setTimeout` 时序不可靠 + `mousedown` 立即清除 + 无持久化高亮；可能与 `ArticleAssistantPanel` 的 `document.mouseup` 监听器竞争 | Bug |
| 3 | 搜索按钮无开关状态，点击即发送 | 无 toggle state，`handleSend(true)` 直接发送 | 交互 |
| 4 | 换画按钮重复（页级 + 文章内各一个） | `Briefing.tsx` 和 `AnthropicArticleReader` 各渲染一个 | 去重 |
| 5 | 导读左箭头无法点击 + resize 不实时 | 父容器 `overflow-hidden` 裁剪 + CSS transition 延迟 | Bug |
| 6 | 文章文字区域过窄（27寸不到一半屏宽） | 外层容器已加宽到 `w-[95%] max-w-[1600px]`，但 `MarkdownRenderer` 内部 `.md-body` 仍强制 `max-width: 720px; margin: 0 auto` | Bug |
| 7 | E2E 测试覆盖不健全 | 只验证了 CSS 类名，未验证实际 computed width / border color；未覆盖未导入文章边框 | 质量 |

---

## Issue 1: 博客边框颜色（修正范围）

### 当前状态

`AnthropicArticleRow.tsx:108` 的基础 className 包含 Tailwind `border`，即 `1px solid rgb(229 231 235)`（浅灰/白色）。  
- 已保存分支覆盖了 `border-l-*` 和上/右/下棕边 ✓  
- **未保存分支只覆盖了 `border-l-*`，其余三边仍显示默认 `border` 浅灰色** ✗

### 目标

所有状态的文章行都只保留左边框为状态色，其余三边为棕色（与未导入文章左边框同色）：

| 状态 | 左边框 | 上/右/下 |
|------|--------|----------|
| 已保存 - 学术 | `#d97757` (ember)，3px | `rgba(232,213,183,0.12)` |
| 已保存 - 报刊 | `#1a1a1a`，3px | `#c9c3b8`/30% |
| 未保存 - 学术 | `rgba(232,213,183,0.12)`，3px | `rgba(232,213,183,0.12)` |
| 未保存 - 报刊 | `#c9c3b8`/30，3px | `#c9c3b8`/30% |
| 导入中 - 学术 | ember 脉冲 | `rgba(232,213,183,0.12)` |
| 导入中 - 报刊 | `#1a1a1a` 脉冲 | `#c9c3b8`/30% |

### 实现

修改 `AnthropicArticleRow.tsx` 的 `borderClass`：

```tsx
if (importing) {
  borderClass = isAcademic
    ? 'border-l-[3px] border-l-ember border-t-[rgba(232,213,183,0.12)] border-r-[rgba(232,213,183,0.12)] border-b-[rgba(232,213,183,0.12)]'
    : 'border-l-[3px] border-l-[#1a1a1a] border-t-[#c9c3b8]/30 border-r-[#c9c3b8]/30 border-b-[#c9c3b8]/30'
} else if (article.isSaved) {
  borderClass = isAcademic
    ? 'border-l-[3px] border-l-ember border-t-[rgba(232,213,183,0.12)] border-r-[rgba(232,213,183,0.12)] border-b-[rgba(232,213,183,0.12)]'
    : 'border-l-[3px] border-l-[#1a1a1a] border-t-[#c9c3b8]/30 border-r-[#c9c3b8]/30 border-b-[#c9c3b8]/30'
} else {
  borderClass = isAcademic
    ? 'border-l-[3px] border-l-[rgba(232,213,183,0.12)] border-t-[rgba(232,213,183,0.12)] border-r-[rgba(232,213,183,0.12)] border-b-[rgba(232,213,183,0.12)]'
    : 'border-l-[3px] border-l-[#c9c3b8]/30 border-t-[#c9c3b8]/30 border-r-[#c9c3b8]/30 border-b-[#c9c3b8]/30'
}
```

**改动文件**: `src/components/anthropic/AnthropicArticleRow.tsx`

---

## Issue 2: 文字选中幽灵笔 + 高亮持久化

### 当前状态

`ArticleAnnotations.tsx:250-309` — `mouseup` → `requestAnimationFrame` + `setTimeout(0)` 读 `window.getSelection()`。  
`mousedown` 在 `document` 上，任何不在 ghost pen 或 `.anno-wrap` 上的点击都会清掉高亮。

### 目标

1. 左键选中文字后，🖊幽灵笔**可靠出现**在选区末尾
2. 选中文字保持**持久化高亮**（半透明 ember 底色），不随点击消失
3. 高亮持续到：用户点击🖊（创建标注）或点击其他区域（解散选区）

### 实现（已部分实现，需验证运行时行为）

保持现有 `requestAnimationFrame + setTimeout(0)` 时序和 `selectionHighlights` overlay。

重点排查并修复：
- `mouseup` 监听应挂在 `document` 上而非 `container` 上，确保拖拽选区结束后即使鼠标释放位置偏离 article 也能触发。
- `mousedown` 清除逻辑：仅当点击区域**不在高亮 overlay 内、不在 ghost pen 内、不在 `.anno-wrap` 内**时才清除。
- 验证 `ArticleAssistantPanel` 的 `document.mouseup` 不会吞掉 selection。

**改动文件**: `src/components/article-assistant/ArticleAnnotations.tsx`

---

## Issue 3: 搜索按钮开关态

同原 spec，已实现，本次无需改动（用户未报告此问题未解决）。

---

## Issue 4: 换画按钮去重

同原 spec，已实现，本次无需改动。

---

## Issue 5: 导读箭头可点击 + resize 实时

同原 spec，已实现，本次无需改动。

---

## Issue 6: 文章宽度修复（修正根因）

### 当前状态

外层容器已改为 `w-[95%] max-w-[1600px]`，但实际文章内容仍被内部 `MarkdownRenderer` 的 `.md-body` 限制为 `max-width: 720px; margin: 0 auto`。

在 27 寸 2560px 屏幕上：
- 外层容器 ~1600px ✓
- `.md-body` 内部实际渲染宽度 ~720px（仅占屏幕 28%）✗
- 左侧灰色竖杠来自 `ArticleBodyChunks` 的 `border-l-4` chunk 边框

### 目标

让文章正文真正使用外层容器宽度，同时保持合理的行高/字号可读性。  
移除 `.md-body` 在 briefing 场景下的 `max-width: 720px` 限制。

### 实现

方案 A（推荐）：为 briefing 文章场景新增专用 class，覆盖 `.md-body` 的 `max-width`。

`src/components/md/markdown.css`：

```css
/* 在 briefing 文章阅读器中使用全宽容器 */
.briefing-article-body .md-body {
  max-width: none;
  margin: 0;
}
```

`AnthropicArticleReader.tsx`：在内容容器上添加 `briefing-article-body` class：

```tsx
<div className="relative w-[95%] max-w-[1600px] min-w-[520px] mx-auto px-6 py-10 pb-24 briefing-article-body">
```

`AcademicBriefingLayout.tsx` 和 `NewspaperBriefingLayout.tsx` 同样添加。

灰色竖杠问题：`ArticleBodyChunks` 的 `border-l-4` 是导读 chunk 的高亮边框，属于设计元素，不应移除。若用户觉得它像“灰色竖杠”，可通过降低颜色透明度来弱化，而不是移除结构。需与用户确认。

**改动文件**:
- `src/components/md/markdown.css`
- `src/components/anthropic/AnthropicArticleReader.tsx`
- `src/components/briefing/AcademicBriefingLayout.tsx`
- `src/components/briefing/NewspaperBriefingLayout.tsx`

---

## Issue 7: E2E 测试（补全）

### 7a. 博客边框

- 覆盖**已保存**和**未保存**两种状态
- 断言 computed `border-top-color` / `border-right-color` / `border-bottom-color`，而不仅是 className

### 7b. 文章宽度

- 断言 `article p` 的实际宽度接近外层容器宽度（`> 1000px` on 1920px+ viewport）
- 断言 `.md-body` 无 `720px` max-width 限制

### 7c. 幽灵笔 + 高亮

- 同时通过真实鼠标拖拽和 E2E helper 触发
- 断言 ghost pen 可见、highlight overlay 可见、位置正确
- 断言点击外部后两者消失

---

## 验收清单

- [ ] 已导入博客文章左橙 + 三边棕（两个主题均正确）
- [ ] 未导入博客文章四边均为棕色/半透明（无白/灰边）
- [ ] 选中文字后🖊出现 + 高亮保持
- [ ] 高亮在点击区域外时解散
- [ ] 🔍 按钮 toggle 有视觉差异，不立即发送
- [ ] 搜索开关跨消息持久化
- [ ] 仅一个换画按钮，位置固定不随滚动消失
- [ ] 导读箭头可点击折叠/展开
- [ ] 拖拽导读 divider 实时变化宽度
- [ ] 文章正文在 27 寸全屏下实际宽度 > 1000px
- [ ] E2E 全部通过
- [ ] 报刊主题无回归
