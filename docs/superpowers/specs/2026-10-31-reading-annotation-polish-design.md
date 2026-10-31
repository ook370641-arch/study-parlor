---
status: planned
note: 2026-10-31 用户批准设计；备注卡取消保存按钮，三路并行实施
---

# 阅读、划词备注与记事板体验打磨 — 设计稿（2026-10-31）

## 1. 范围

本批处理记事板中除博客更新故障外的 7 项需求。博客更新故障由用户确认似乎已经修复，本批不改博客抓取代码。

1. 书籍记忆最后阅读章节与章节内滚动位置，行为照搬博客。
2. 书籍正文相邻段落有清楚的段间距。
3. 旁注聊天打开时，迭代记事板入口与已打开面板仍可访问。
4. 博客与书籍共用的划词工具增加持久化高亮。
5. 划词 🖊 备注卡锚定原段落，随正文滚动。
6. 备注始终有删除入口；点击外部自动保存并关闭；取消“保存”按钮。
7. 书卡删除入口改为小垃圾桶图标，保留现有确认弹窗。

不做 PDF 解析、博客更新、笔记书架、旁注聊天本身的重构，不引入第三方图标或颜色选择器依赖。

## 2. 共享划词工具

### 2.1 选区工具条

`ArticleAnnotations` 继续作为博客与书籍的唯一实现。划词结束后，在原 🖊 旁显示高亮主按钮与粘连的颜色下拉按钮：

- 点 🖊：沿用现有流程，创建空备注并打开备注卡。
- 点高亮主按钮：使用当前颜色立即创建并持久化高亮，不打开卡片。
- 点下拉按钮：展开 ember / gold / green / blue 四色；选择只修改当前颜色并持久化，选区工具条保持可用。
- 默认色为 gold。当前色存 `state.json` 的 `annotationHighlightColor`，应用重启后保留。

保留 `anno-ghost-pen` testid；新增 `anno-highlight-button`、`anno-highlight-color-toggle`、`anno-highlight-color-menu` 与 `anno-highlight-color-<color>`。

### 2.2 数据与旧文件兼容

`ArticleAnnotation` 增加两个可选字段：

```ts
export type AnnotationHighlightColor = 'ember' | 'gold' | 'green' | 'blue'

export type ArticleAnnotation = {
  id: string
  selectedText: string
  note: string
  paragraphIndex: number
  createdAt: string
  updatedAt: string
  kind?: 'note' | 'highlight'
  highlightColor?: AnnotationHighlightColor
}
```

缺省 `kind` 按 `note` 处理，旧 `.annotations.md` 无需迁移。高亮在伴生文件中增加 `**类型：** highlight` 与 `**高亮色：** <color>`；普通备注不写这两个字段。解析器接受缺失或未知扩展字段，未知颜色回退 gold。

### 2.3 持久标记与卡片

- 备注沿用现有暖橙浅底与 🖊 标记。
- 高亮只显示所选颜色的文字底色，不显示 🖊。
- 点击高亮打开同一定位卡片：显示四个色板与删除按钮，不显示备注输入框；换色立即写盘，删除立即移除标记并写盘。
- 备注卡始终显示删除按钮，包括空备注；删除不需要二次确认，因为范围仅为当前标注且原文不受影响。
- 备注卡移除“保存”按钮。文本变化仍在点击卡片外或按 Esc 时自动保存并关闭，空文本也允许保存。
- 新备注创建时仍立即写入空备注，避免用户未输入就丢失锚点。

## 3. 书籍阅读

### 3.1 章节与位置记忆

复用 `useScrollMemory`，块选择器与博客一致：`.md-body > div > *`。新增三个持久字段：

```ts
booksLastChapter: string | null
bookScrollMemory: ScrollMemorySlot | null
annotationHighlightColor: AnnotationHighlightColor
```

`selectChapter` 成功后记录 `booksLastChapter`。`selectBook` 加载目录后，仅当持久章节路径属于当前书且仍在目录中时自动调用 `selectChapter`。`BookReader` 在切章、离开阅读器与窗口关闭时通过 `flushBookScrollPosition` 同步落盘；重开章节时恢复首可见块，沿用现有平滑滚动和用户接管逻辑。

删除当前书时，若持久章节属于该书，同时清理 `booksLastChapter` 与匹配的 `bookScrollMemory`，避免恢复到已不存在的路径。

### 3.2 备注锚点与段落

书籍滚动容器增加 ref、`onScroll` 与 `book-reader-scroll` testid。正文与 `ArticleAnnotations` 的共同内容层建立 `relative` 定位包含块，使备注卡与幽灵工具使用正文坐标并随内容滚动；共享组件不改定位坐标系。

仅为书籍正文增加相邻段落下间距：`.book-chapter-reader .md-body p + p`。不影响博客、笔记与写作排版，不使用首行缩进。

### 3.3 删除入口

`BookListColumn` 仅把当前书的“删除”文本替换为小垃圾桶 SVG，保留 `book-delete-<i>` testid、点击阻止冒泡与 `BookPanel` 现有 `ConfirmDialog`。不移动按钮，不改变删除 IO。

## 4. 旁注状态下的记事板

`NotepadFab` 不再因 `assistantSession.isOpen` 隐藏入口。旁注打开时，入口与面板从右下角移到左下角；旁注关闭后恢复右下角，避免覆盖旁注默认右下发送区。

`NotepadPanel` 的外点关闭逻辑放行旁注开关与聊天窗内部点击，使用户能在记事板和旁注之间切换而不意外收起；点击其他页面区域或按 Esc 仍关闭。面板已有草稿和条目状态继续由组件内 state 与 Zustand 保留。

## 5. 并行边界

- **共享划词任务**：只改 `ArticleAnnotations`、标注 IPC 与其测试；按本设计消费共享 store 接口。
- **书籍与共享状态任务**：独占 `src/types/index.ts`、`src/store/index.ts`、`electron/ipc/state.ts`，同时实现书籍阅读与书卡改动。
- **记事板任务**：只改 Notepad 组件与其测试。
- 控制器负责 `e2e/source-map.json`、文档索引、最终集成与验证，避免三个任务争写。

## 6. 测试与验收

每个实现任务先写失败测试并确认预期失败，再写最小实现。单元测试覆盖：

- 旧标注解析、备注/高亮序列化往返、未知颜色回退。
- 高亮创建、当前色持久化调用、点击高亮换色/删除。
- 空备注删除入口、保存按钮不存在、外点自动保存。
- 书籍最后章节恢复、滚动位置 flush、内容层定位、段落样式钩子、垃圾桶入口。
- 旁注打开时记事板入口存在、面板左移、旁注交互不触发外点关闭。

补充 Playwright 场景到现有 `article-annotations.spec.ts`、`books.spec.ts`，新增 `notepad-assistant.spec.ts`，并维护 `e2e/source-map.json`。本轮没有用户明确授权启动第二个 Electron 实例，因此只编写 E2E，不执行；交付前运行相关 Vitest、TypeScript/production build 与 `npm run docs:check`。

最终验收以当前工作区快照为基线，主工作区不被编辑、合并、切分支或重启。
