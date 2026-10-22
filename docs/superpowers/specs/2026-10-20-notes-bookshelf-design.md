# 笔记书架 — 设计稿

> 需求来源：`2026-10-20-notes-bookshelf-requirements.md`（已确认决策见该文档 §3）。
> 本文定架构、数据、IPC、UI 骨架与迁移方案；视觉精修（书架质感）在实现期迭代。

---

## 1. 架构总览

笔记作为**学习库顶层第三个写作相关目录**落地：`<学习库>/notes/`，与 `writing/`、`repository/`、`Anthropic博客/` 平级。不进 `WRITING_ROOTS`——写作树的通用 CRUD（分组/移动/重命名/html 预览）对笔记是噪音，笔记有独立但刻意缩小的 IPC 面。

复用策略：
- **正文编辑**：复用 `WritingEditor`（Milkdown）+ autosave 模式，笔记详情页是一个"带元数据头的写作板"。
- **正文读写**：复用 `writing:read` / `writing:write`（按相对路径读写，不区分根）。已核实 `writeWritingFile` 写回时保留既有 frontmatter 并自动加 `updated` 字段——笔记元数据安全；`updated` 视为写作区惯例字段，不进 `NoteMeta` schema。
- **新写**：独立 `electron/lib/notes.ts`（扫描/解析/迁移）+ `electron/ipc/notes.ts` + `src/components/notes/`。

```
<学习库>/
├── writing/          # 新写作（不动）
├── repository/       # 过去积累（不动）
├── notes/            # 【新增】笔记书架，扁平，每笔记一 .md
│   ├── How we built Claude Code auto mode.md
│   └── ...
└── Anthropic博客/.collection.json   # 存量导入数据源（read 列表）
```

## 2. 文件格式

每条笔记一个 `.md`，frontmatter 存元数据，body 即正文：

```yaml
---
title: "How we built Claude Code auto mode"
url: "https://www.anthropic.com/engineering/..."
source: anthropic          # anthropic | web | book | unknown（2026-10-21 起为来源类型四值，原 hermes/manual 已迁移）
rating: 4                  # 1-5，缺省/0 = 未评
summary: "一句话摘要"
highlight: "核心亮点"
collected_at: 2026-10-20T21:00:00+08:00   # 收录时间
read_at: 2026-10-18T22:00:00+08:00        # 读完时间（导入时取 BlogReadEntry.readAt，可空）
---

（正文，自由书写）
```

- 文件名 = 清洗后的文章名（去非法字符、截断 80 字符），重名走现有 `uniqueName` 同款 `-HHMM` 后缀策略。
- 解析复用 `gray-matter`（`electron/lib/frontmatter.ts` 已封装）；frontmatter 类型新增 `NoteMeta`。

## 3. 数据流

```
主进程 notes.ts                    渲染进程
─────────────────                 ─────────────────
scanNotes(lib)        ──IPC──▶   store.notesList: NoteEntry[]
  └ 扫 notes/*.md                  NoteEntry = { path, meta: NoteMeta }
  └ 解析 frontmatter
  └ body 不读（列表阶段不载正文）   点开笔记 → writing:read 载 body
                                  编辑元数据 → notes:updateMeta 写回 frontmatter
```

- 列表排序：前端按 `collected_at`（默认，新→旧）或 `rating`（高→低），切换存 state.json `notesSortBy`。

## 4. IPC 面（`electron/ipc/notes.ts`）

| channel | 入参 | 返回 | 说明 |
|---|---|---|---|
| `notes:list` | — | `NoteEntry[]` | 扫描 + 解析 frontmatter |
| `notes:create` | `{ title, url }` | `{ path }` | 最小新建（P0 手动入口），其余字段空 |
| `notes:updateMeta` | `{ path, patch: Partial<NoteMeta> }` | — | 只重写 frontmatter，不动 body；原子写（tmp+rename，照抄 annotations） |
| `notes:delete` | `{ path }` | — | 确认后真删（沿用写作区约定） |
| `notes:importRead` | — | `{ created, skipped }` | F6 存量导入，幂等 |

正文读写复用 `writing:read` / `writing:write`。路径安全复用 `assertInsideRoots`（notes/ 在库内即合法）。

## 5. F6 存量导入设计

输入：`<lib>/Anthropic博客/.collection.json` 的 `read: BlogReadEntry[]`。

逻辑（纯函数，可单测）：
1. 读 `read` 列表 + 现有 `notes/*.md` 的 url 集合。
2. 对每条 read：url 已在集合 → skip；否则生成 `notes/<清洗标题>.md`，frontmatter 预填 `title`、`url=sourceUrl`、`source=anthropic`、`read_at=readAt`、`collected_at=readAt`（收录时间取读完时间，书架"新→旧"与阅读史一致），rating/summary/highlight 留空，body 空。
3. 返回 `{created, skipped}`；UI 弹结果提示。

幂等：再跑一次全部 skip。`importRead` 不限首期——以后随时可点。

## 6. UI 设计

### 6.1 布局（写作分区，source === writing 时）

```
┌────────────┬───────────────────────────────┐
│ 左栏        │ 主区                           │
│ ┌────────┐ │ ┌ 元数据头（笔记态）─────────┐ │
│ │新写作   │ │ │ 文章名（可改）  ★★★★☆  A社 │ │
│ │过去积累 │ │ │ 🔗 url  ✎摘要  ✎亮点       │ │
│ │笔记 ▾  │ │ ├────────────────────────────┤ │
│ │ ┌────┐ │ │ │                            │ │
│ │ │卡片│ │ │ │   正文（Milkdown 编辑器）   │ │
│ │ │卡片│ │ │ │   autosave                 │ │
│ │ └────┘ │ │ │                            │ │
│ └────────┘ │ └────────────────────────────┘ │
└────────────┴───────────────────────────────┘
```

- **左栏**：写作分区下出现第三个可折叠段「笔记」，段内不是 `WritingTree` 而是 `NotesShelf`（卡片列表）。卡片内容：文章名（2 行截断）、星标、来源徽标（`source==='anthropic'` 时用 `blog-icons` 的 A 社图标）、一句话摘要（若有）。
- **主区**：选中笔记时 `WritingBoard` 换为 `NoteBoard`——顶部元数据头（标题/url/星标/摘要/亮点全部就地编辑，失焦走 `notes:updateMeta`）+ 下方 `WritingEditor` 正文区（autosave 复用现有 debounce 模式）。
- **排序/新建**：笔记段头部两个控件：排序切换（时间/星标）+「+ 新笔记」（弹最小表单：文章名 + 网页）。
- **书架质感**：卡片用书脊式窄卡 + 暖橙星标 + 暗底纸纹，对齐现有 academic 主题调色（`#2a1f1a`/`#e8d5b7`/`#d97757`）；视觉细节实现期对着截图迭代。

### 6.2 组件清单（新增）

| 文件 | 职责 |
|---|---|
| `src/components/notes/NotesShelf.tsx` | 左栏卡片列表 + 排序切换 + 新建入口 |
| `src/components/notes/NoteCard.tsx` | 单卡片（标题/星标/徽标/摘要） |
| `src/components/notes/NoteBoard.tsx` | 主区：元数据头 + 正文编辑器宿主 |
| `src/components/notes/NoteMetaHeader.tsx` | 元数据就地编辑（星标组件含内） |
| `src/components/notes/StarRating.tsx` | 1–5 星交互 |

### 6.3 Store（`src/store/index.ts` 增量）

`notesList: NoteEntry[] | null`、`notesSortBy: 'time' | 'rating'`、`currentNotePath: string | null`、actions：`loadNotes / createNote / updateNoteMeta / deleteNote / importReadNotes / setNotesSortBy`。选中笔记时 `currentWritingPath` 置空、`currentNotePath` 置值，二态互斥。

## 7. 边界与错误处理

- **重名**：清洗后文件名冲突 → `-HHMM` 后缀（复用 `uniqueName` 思路）。
- **无标题导入**：read 条目 `title` 为空 → 用 url 末段当文件名。
- **notes/ 不存在**：首次扫描/导入时 mkdir -p。
- **frontmatter 损坏**：单条解析失败 → 跳过并在 `notes:list` 结果里带 `{ path, parseError: true }` 占位卡（标红），不拖垮整架。
- **元数据与正文并发编辑**：`notes:updateMeta` 只重写 fm 区，body 原样拼回；编辑器 autosave 走 `writing:write` 只写 body——两者文件级最后写入者胜，设计上让元数据保存后立即重读 body 避免覆盖提示困惑。

## 8. 测试

**单元（Vitest）**
- `tests/notes.test.ts`：frontmatter 序列化/解析往返、文件名清洗、`importRead` 幂等与 skip 统计、`updateMeta` 不动 body。

**E2E（Playwright）**
- 新增 `e2e/specs/notes-bookshelf.spec.ts`：导入已读 → 书架出现卡片（A 社徽标可见）→ 点开 → 打星/写摘要/写正文 → 重进后仍在。
- 同步更新 `e2e/source-map.json`（新建 notes group）。

## 9. 落地顺序（供 writing-plans 参考）

1. `electron/lib/notes.ts` + 单测（格式/导入逻辑先行，纯函数）
2. `electron/ipc/notes.ts` + preload + 类型
3. Store 增量 + NotesShelf/NoteCard（列表先跑通）
4. NoteBoard + NoteMetaHeader + StarRating（编辑闭环）
5. 存量导入入口 + E2E + source-map
6. 视觉精修（书架质感迭代）
