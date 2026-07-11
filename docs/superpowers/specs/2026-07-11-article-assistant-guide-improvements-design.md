# 文章旁注助手导读改进设计

> 状态：待实现  
> 来源：用户反馈（切换文章丢失导读、AI 日报不自动生成导读、左右分块对应不清、换画按钮位置、自由拉伸）  
> 依赖基线：`docs/superpowers/plans/2026-07-11-briefing-blog-reader-ui-redesign.md`（三栏 UI 升级计划）

---

## 1. 目标

在 2026-07-11 博客/日报阅读器 UI 升级的基础上，改进文章旁注助手的导读体验：

1. 切换文章再切回时，已生成的导读不丢失。
2. AI 日报首次生成/打开后，自动触发导读生成。
3. 左侧正文按右侧导读的 chunk 分段，块与块之间对应关系可见。
4. 换画按钮只保留在正文右上角。
5. 文章区与导读区之间的分隔栏可拖拽 resize；导读可折叠，拖至最右侧自动折叠。
6. 导读宽度持久化到 `state.json`。

---

## 2. 术语

- **parent article**：用户正在阅读的文章/博客/日报正文 `.md` 文件。
- **guide**：`ArticleAssistantGuide` 结构化对象，包含 `background` 和 `chunks[]`。
- **guide cache**：与 parent article 同目录、同名、后缀为 `.assistant.md` 的持久化文件，保存 guide。
- **article chunk**：正文按 guide chunk heading 拆分后的段落块，用于左右对照。

---

## 3. 需求详述

### 3.1 导读持久化

- 生成 guide 后，立即写入 `<parent>.assistant.md`（与 `electron/ipc/files.ts` 已有 `files:writeProgress` 等写入逻辑一致，复用 `serializeFrontmatter`）。
- `ArticleAssistantPanel` 在 `parentPath` 切换时：
  1. 先将当前 session 的 guide 保存到 disk（若已生成且未保存）。
  2. 再加载新 `parentPath` 对应的 guide cache。
  3. 若 cache 存在，恢复 guide 到 store 的 `assistantSession.guide`。
- 删除 `ArticleAssistantPanel` unmount 时关闭 session 的逻辑；session 跟随 `parentPath` 变化而切换/保存，不随组件卸载丢失。

### 3.2 AI 日报自动生成导读

- 当 `Briefing.tsx` 中 `source === 'digest'` 且 `result?.filePath` 有效时，渲染 `ArticleAssistantPanel` 并传入 `autoGenerateGuide = true`。
- `ArticleAssistantPanel` 在以下两个条件同时满足时自动调用 guide 生成：
  1. `autoGenerateGuide === true`。
  2. 当前 `parentPath` 没有对应 guide cache。
- 若 guide cache 已存在，只加载、不重新生成。
- 生成完成后按 3.1 保存到 disk。

### 3.3 正文分块与导读 chunk 对齐

- 在 `AnthropicArticleReader` 和 `Briefing.tsx` 的正文渲染层，根据当前 guide 的 `chunks[].heading` 将正文拆分为若干 `ArticleChunk`。
- 分块规则：
  - 使用 heading 文本做模糊匹配（忽略大小写、忽略标点、忽略前后空格）。
  - 正文中第一个匹配 heading 的位置作为 chunk 起点，下一个匹配 heading 或文末作为终点。
  - 未匹配到的正文尾部归入最后一个 chunk。
  - 若 guide 为空或 chunks 为空，则整个正文作为一个 chunk。
- 每个 chunk 渲染为带左边框的卡片：
  - 当前选中的 chunk（由 guide sidebar hover 或 scroll 同步）左边框颜色加深。
  - 非当前 chunk 保持较低透明度。
- chunk heading 显示为小块标题，放在 chunk 卡片顶部。

### 3.4 换画按钮位置

- 移除 `GuideSidebar` 上的换画按钮。
- 换画按钮仅保留在正文区域右上角（`AnthropicArticleReader` 和 `Briefing.tsx` 正文容器内）。

### 3.5 可拖拽分栏与折叠

- 在正文区与导读区之间增加 6px 宽拖拽条（resizer）。
- 拖拽条 cursor 为 `col-resize`；鼠标按下后拖动可改变文章区/导读区宽度。
- 宽度逻辑：
  - 文章区宽度 = `flex: 1`，占满左侧剩余空间。
  - 导读区宽度 = 用户拖拽后的像素宽度，最小 200px，最大不超过父容器宽度的 45%。
  - 拖拽时实时更新 guide sidebar 宽度。
- 折叠逻辑：
  - 导读区右侧有一个折叠按钮（或 resizer 本身双击/拖到最右）。
  - 将 resizer 拖至父容器最右侧（距右边缘 ≤ 20px）时，自动折叠导读区。
  - 折叠后仅显示一个 6px resizer + 一个「展开导读」按钮（位于 resizer 上或 resizer 左侧）。
  - 点击展开按钮恢复上次保存的宽度。
- 宽度持久化：
  - 将 `articleAssistantGuideWidth: number` 持久化到 `state.json`（单位 px）。
  - 默认值 320px。
  - 折叠状态 `articleAssistantGuideCollapsed: boolean` 也持久化。
  - 宽度改变或折叠状态改变时 debounce 写 state（≥ 300ms）。

### 3.6 与 UI 升级基线的整合

- 在 AI 日报场景：左侧为 `BriefingListColumn`（日期列），中间为正文区，右侧为 guide sidebar。
- 在 Anthropic 博客场景：左侧为 `BriefingListColumn`（博客列表列），中间为正文区，右侧为 guide sidebar。
- 正文容器统一使用 `w-[90%] max-w-[1250px] min-w-[520px] mx-auto`。
- 所有主题（academic/newspaper）下 resizer 和 guide sidebar 的配色与当前主题一致。

---

## 4. 数据结构

### 4.1 state.json 新增字段

```ts
interface State {
  // ...existing fields...
  articleAssistantGuideWidth: number   // 默认 320
  articleAssistantGuideCollapsed: boolean // 默认 false
}
```

- 在 `src/store/index.ts` 的 `DEFAULT` 和 `init()` 中提供默认值。
- 在 `e2e/helpers/test-library.ts` 的 `BASE_STATE` 中同步补充。

### 4.2 文件缓存格式

`<parent>.assistant.md` 使用与父文件相同的 frontmatter 风格：

```yaml
---
type: assistant-guide
parent_path: "relative/path/to/parent.md"
generated_at: "2026-07-11T12:00:00.000Z"
---

# 背景

...

## §1 Heading

摘要...

**上下文（context）**：...
```

- `type` 固定为 `assistant-guide`。
- `parent_path` 为相对路径，便于移动后仍可识别。
- 解析时从正文按 `## §` 提取 chunks。

### 4.3 新增内部类型

```ts
// src/types/index.ts
export interface ArticleChunk {
  heading: string
  body: string
  startIndex: number // 在正文中的字符起始位置
}
```

---

## 5. 组件与文件变更

| 文件 | 变更 |
|------|------|
| `src/store/index.ts` | 新增 `articleAssistantGuideWidth`、`articleAssistantGuideCollapsed` 字段及持久化 |
| `electron/ipc/files.ts` | 新增 `files:writeAssistantGuide` / `files:readAssistantGuide` |
| `electron/lib/frontmatter.ts` | 新增 `assistant-guide` 到 `DocType` 推断/渲染映射 |
| `src/types/index.ts` | 新增 `ArticleChunk`、IPC 返回类型 |
| `src/lib/article-assistant.ts`（或新建） | guide cache 读写封装 |
| `src/components/article-assistant/GuideSidebar.tsx` | 支持 collapsible、移除换画按钮、绑定宽度/折叠状态 |
| `src/components/article-assistant/ArticleAssistantPanel.tsx` | 持久化/恢复 guide、autoGenerate、resize 处理 |
| `src/components/article-assistant/ArticleChunkDivider.tsx`（新建） | 可拖拽 resizer + 折叠按钮 |
| `src/components/article-assistant/ArticleBodyChunks.tsx`（新建） | 按 guide chunks 拆分渲染正文 |
| `src/components/anthropic/AnthropicArticleReader.tsx` | 接入 ArticleBodyChunks、换画按钮移到正文右上角、接入 guide panel |
| `src/pages/Briefing.tsx` | 接入 ArticleBodyChunks、换画按钮位置、接入 guide panel |
| `tests/article-assistant/*.test.ts` | 新增/更新测试 |
| `e2e/helpers/selectors.ts` | 新增 resizer、guide sidebar、chunk 选择器 |
| `e2e/specs/article-assistant*.spec.ts` | 新增 E2E 用例 |

---

## 6. 错误处理

- guide cache 写入失败时，在 toast 提示用户“导读已生成但保存失败”，不阻塞当前阅读。
- guide cache 读取失败或格式损坏时，视为无缓存，允许重新生成。
- 正文分块失败（heading 无法匹配）时，回退到单一 chunk 显示，不报错。
- resizer 宽度计算失败时，回退到默认值 320px。

---

## 7. 测试策略

### 7.1 单元测试

- `files:readAssistantGuide` / `writeAssistantGuide`：覆盖正常读写、缺字段、文件不存在。
- 正文分块算法：覆盖多 heading 匹配、大小写/标点忽略、无 guide 回退、未匹配尾部。
- guide 宽度/折叠状态持久化：覆盖默认值、读写 state.json。

### 7.2 组件测试

- `GuideSidebar`：折叠/展开按钮、宽度样式、无换画按钮。
- `ArticleBodyChunks`：根据 guide chunks 渲染正确数量的 chunk 块。
- `ArticleAssistantPanel`：parentPath 切换时保存旧 guide、加载新 guide。

### 7.3 E2E 测试

- 切换文章后返回，guide 不丢失。
- AI 日报首次打开自动生成 guide。
- 拖拽 resizer 改变宽度，重启后宽度保持。
- 拖至最右侧自动折叠，点击展开恢复。
- 换画按钮只在正文右上角存在。

---

## 8. 非目标

- 不改 prompt 生成逻辑（`digest-guide.md` 已本地化）。
- 不改聊天窗口的浮动/拖拽行为。
- 不实现 guide 的跨设备同步。
- 不实现 guide 的手动编辑。
