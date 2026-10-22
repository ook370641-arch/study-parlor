# 笔记专辑墙 + 笔记页重设计（2026-10-22 visual brainstorm 定稿）

## 背景

笔记 tab 现状：第二列（来源列与主页面之间的列表列）里 5 个分类 pill + 排序 select + 文字「导入已读」+「＋ 新笔记」，下面书脊卡列表；主区无打开笔记时只有一行空状态文案。用户诉求：① 主区要有专辑墙式笔记主页；② 第二列工具栏重构（分类收下拉框、排序独立一行、导入纯图标且在排序左侧）；③ 正文页与第二列列表页视觉重做。

方案经 visual companion 三屏点选定稿：主页=B（专辑墙）、正文页=A（阅读室）、第二列=C（封面行）。

## 页面结构（定稿）

笔记 tab 激活时：

```
来源列(rail) │ 第二列：笔记列表（封面行）│ 主区：专辑墙 或 阅读室正文页
```

- 主区默认显示**专辑墙**（无打开笔记时）；点专辑 → 主区切换为**阅读室正文页**，左上「← 返回笔记墙」回到专辑墙。
- 第二列始终保留，作为快速索引；点封面行同样打开正文页。
- （注：第一屏 B 方案原稿是整页无第二列；用户随后要求设计第二列笔记页，故定稿为「第二列保留 + 主区专辑墙」的混合结构。）

## 第二列：笔记列表页（C · 封面行）

- 工具栏两行：
  - 行 1：`[分类下拉框: 全部/Anthropic/网页/书籍/未知] …… [＋ 新笔记]`
  - 行 2：`[⬆ 导入已读（纯图标，title 提示）] [排序下拉: 时间/星标]`
- 条目行：小封面缩略（约 14×19 比例块）+ 标题一行（溢出省略）+ 副行「星标 · 收录日期」；选中行左缘 ember 色条。
- 删除入口沿用 hover ✕ + ConfirmDialog。
- 取代现有 NotesShelf 的书脊卡 + 隔板渲染（数据流不变：notesList + notesCategory + notesSortBy）。

## 主区：专辑墙主页

- 网格专辑卡（约 3:4），卡片 = 封面 + 标题 + 星标；空态引导文案沿用现有「导入已读」提示。
- 排序/分类与第二列工具栏共享同一份 store 状态（第二列操作即刷新墙）。
- 顶部不再重复工具栏（工具栏只在第二列）。

## 正文页（A · 阅读室）

- 顶条：`← 返回笔记墙` + 面包屑（笔记 / 标题）+ 右侧保存状态（现有 saving 指示移入）。
- 居中窄栏（约 640–720px）：大标题（可编辑）→ 元信息一行（StarRating + 来源徽标 + 收录/读完日期）→ 摘要题辞块（左缘 ember 竖线、斜体）→ 正文（现有 Milkdown 编辑器）。
- 「来源链接 / 核心亮点」编辑收进 `ⓘ 信息` 弹层（实现时从 NoteMetaHeader 迁入；页底抽屉为备选，实现前与用户确认）。

## 封面规则（全场景统一：专辑墙 + 第二列缩略图）

- `source === 'anthropic'`：沿用对应博客文章封面——按笔记 `meta.url` 查 `state.json` 的 `articleMetaCache[url].imageUrl`；缓存未命中回退来源色渐变。
- 其余来源：来源色渐变封面（web `#7a9cc6` / book `#8fae8b` / unknown `#6b5d52`，与现有 SOURCE_COLOR 一致）。

## 涉及文件（预估）

- `src/components/notes/NotesShelf.tsx` — 重写为封面行 + 两行工具栏
- `src/components/notes/NoteCard.tsx` — 改为封面行条目（或新组件 NoteRow）
- 新增 `src/components/notes/NotesWall.tsx` — 专辑墙（主区）
- 新增 `src/components/notes/NoteCover.tsx` — 封面解析（anthropic→articleMetaCache，其余→渐变），墙/列共用
- `src/components/notes/NoteBoard.tsx` — 改为阅读室布局 + 返回按钮；NoteMetaHeader 精简为一行元信息 + 题辞 + ⓘ 弹层
- `src/pages/Briefing.tsx` — 主区 notes 分支：无选中文件时渲染 NotesWall 而非空态
- `src/store/index.ts` — 若现有 `writingFile=null` 语义不足以表达「返回墙」，加一个轻量状态（优先复用 null）
- `e2e/source-map.json` — 新增/更新 notes 相关 spec 映射（仓库规则）

## 验证

- 定向单测：封面解析纯函数（cache 命中/未命中/非 anthropic）。
- 定向 E2E：笔记 tab 工具栏两行结构、点专辑进正文页、返回墙；改 spec 后同步跑 `node scripts/e2e-changed.js --run`。
