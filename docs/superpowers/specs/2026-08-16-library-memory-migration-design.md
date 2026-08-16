# 四类记忆迁入学习库 + writing 创建时间戳 — 设计

日期：2026-08-16
状态：已获用户批准（布局、迁移方案 A、writing 时间戳范围）

## 背景

应用的动态内容大部分已存于学习库（会话、写作、简报、拾贝、博客正文等），但四类"用户记忆"仍留在 `~/.studyparlor/state.json`：

| 字段 | 内容 | 性质 |
|---|---|---|
| `profile` | 姓名/画像文本/偏好主题 | 用户手写，不可重建 |
| `anthropicBlogCache` + `anthropicBlogLastSeenAt` | 博客文章列表缓存 + 已读水位线 | 部分可重建 |
| `jobProfile` | 求职画像 | 用户手写，不可重建 |
| `jobBriefingConfig` | 求职搜索配置（公司/关键词/城市） | 用户配置 |

目标：备份/迁移学习库 = 带走所有记忆。state.json 只留 UI 偏好与可重建的推荐缓存。

**红线**：不丢失任何文件/缓存/记忆；不改变现有应用使用体验（渲染进程 IPC 契约、UI 行为、E2E 语义均保持不变）。

## 存储布局

按域就近放置（与 `.study-groups.json`、`.catalog.json` 先例一致）：

```
<学习库>/
├─ .profile.json                 ← profile { name, profile_text, preferred_topics }
├─ Anthropic博客/.cache.json     ← 博客列表缓存 + lastSeenAt
└─ 求职简报/.config.json         ← { jobProfile, jobBriefingConfig }
```

### 文件 schema

`.profile.json`：
```json
{ "name": "", "profile_text": "", "preferred_topics": [] }
```

`Anthropic博客/.cache.json`：
```json
{
  "lastFetchedAt": null,
  "articles": [],
  "sectionStatus": {},
  "articleMetaCache": {},
  "lastSeenAt": null
}
```
`loading`/`error` 是运行时瞬态，**不落盘**；读取时补默认值 `loading: false, error: null`。原 `anthropicBlogCache` 与 `anthropicBlogLastSeenAt` 两个 state 字段合并进此文件。

`求职简报/.config.json`：
```json
{ "jobProfile": { ... }, "jobBriefingConfig": { ... } }
```

读取统一走 `safeReadJson` + 现有 normalize（`normalizeJobProfile` / `normalizeJobBriefingConfig`）；文件缺失或损坏回退默认值（与现 state.json 缺失行为一致）。

## 迁移逻辑（方案 A：一次性迁移 + 剥离）

原则：**库内是真相源；state.json 的四字段迁移后永不再作为数据源，仅在"库内文件缺失"时作为一次性导入来源，导入后立即剥离。**

迁移函数 `migrateLibraryData(libraryPath)`：

1. 对三个库内文件逐个检查：**库内文件不存在 且 state.json 含非默认值** → 写入库内文件。
2. 无条件从 state.json 删除 `profile` / `anthropicBlogCache` / `anthropicBlogLastSeenAt` / `jobProfile` / `jobBriefingConfig` 五个 key（幂等；库内文件已存在时 state.json 旧值直接丢弃，不覆盖库内）。
3. "非默认值"判定：profile 三字段全空、cache 无 articles 且 lastFetchedAt/lastSeenAt 为 null、job 两个对象等于 DEFAULT 归一化结果 → 视为默认，跳过写入（避免给全新用户生成空文件）。

执行时机（两处，同一函数）：

- **启动时**：boot 序列拿到 `cfg.libraryPath` 后、IPC 注册前执行一次。覆盖老用户升级路径。
- **读路径兜底**：`state:get` / `getCurrentState` 读取时若发现库内文件仍缺失且 state.json 有值，再执行一次迁移。覆盖两类边界：(a) E2E 在 app 启动后 seed state.json 再 reload 的时序；(b) 用户降级旧版本写回 state.json 后又升级的极端路径。库内文件一旦存在，此路径永不触发，不会覆盖库内数据。

配置向导路径：`setup:writeConfig` 现有顺序（先 `mkdirSync(libraryPath)` 后 `patchState({profile})`）天然成立——`patchState` 拦截 profile 路由到库内写入时目录已就绪。向导未完成前 `getCurrentState` 对四字段返回默认值（libraryPath 未设置时跳过库内读取）。

## 读写路径改造

### 新增 `electron/lib/library-data.ts`

六个函数：`loadProfile/saveProfile`、`loadBlogCache/saveBlogCache`、`loadJobData/saveJobData`，以及 `migrateLibraryData(libraryPath)`。每个 load 接收 libraryPath；写用 `safeWriteJson`（原子写，沿用现有约定）。

### `electron/ipc/state.ts` 改造

- 模块级持有 `libraryPath`（由 `registerStateIpc(cfg)` 或独立 setter 注入，以 plan 为准）。
- `getCurrentState()` / `state:get`：读 state.json 后**叠加**三个库内文件的内容，返回形状不变的 `StateJson`。
- `patchState`：拦截 `profile` / `anthropicBlogCache` / `anthropicBlogLastSeenAt` / `jobBriefingConfig` / `jobProfile` 五个 key —— 路由为库内文件写入（load 文件 → 合并 → 保存）；其余 key 照旧写 state.json。
  - `anthropicBlogCache` 写入时剥离 `loading`/`error`；`anthropicBlogLastSeenAt` 映射为文件的 `lastSeenAt` 字段。
  - 单次 patch 同时含 cache 与 lastSeenAt 时合并为一次文件写。
- `DEFAULT` 中五 key 保留（作为叠加前的默认值来源与类型锚点），但不再被持久化到 state.json。

### 不改动的层

- `StateJson` 类型（`src/types/index.ts`）不变——渲染进程契约零改动。
- `anthropic.ts`、`job-briefing.ts`、`prompts.ts`、`llm-tasks.ts`、`briefing.ts` 等消费方全部经由 `getCurrentState()`/`patchState`，不改。
- preload、store、组件不改。

## writing 创建时间戳

- `writing-tree.ts` `createFile`：frontmatter 从 `{ type: 'writing' }` 改为 `{ type: 'writing', created: new Date().toISOString() }`。`created` 已在 CORE_FIELDS，解析层无需改动。
- `saveFile` 走 frontmatter 合并路径，需确认保留已有 `created`（实现时验证；若被覆盖则修复）。
- 改名/移动是 `fs.rename`，不动文件内容，时间戳天然保留。
- **旧文章不回填**；`parseFrontmatter` 对缺失 `created` 的解析期兜底保持不变（不落盘）。
- 本次只记录，不做 UI 展示。

## E2E 改造

原则：读路径兜底迁移使现有"seed state.json"的测试在语义上继续成立（fresh 目录 → 库内文件缺失 → seed 值被迁移进库），因此**预期大多数 spec 无需修改**。工作项：

1. `e2e/helpers/test-library.ts` 的 `BASE_STATE` 保留五字段（作为迁移输入仍有效）。
2. 定向跑受影响 spec 验证：`anthropic-blog-*`、`blog-guide-*`、`briefing-*`、`writing-*`、`job-briefing-*`、`startup-health`（always）。以 `node scripts/e2e-changed.js --run` 输出为准。
3. 仅当有 spec 断言"state.json 文件内容包含 profile"之类的落盘细节时才需改 seed 为直写库内文件（实现时以实际失败为准，不预先盲改）。
4. 若新增 spec（迁移行为本身的 E2E），同步更新 `e2e/source-map.json`。

## 测试计划

### 单元测试（新增 `tests/library-data.test.ts`）

- 迁移：老 state.json 含四字段 → 三个库内文件生成且内容一致；state.json 五 key 被剥离、其余字段原样保留。
- 幂等：第二次运行无文件变动（mtime/内容不变）。
- 冲突：库内文件已存在 + state.json 有不同旧值 → 库内不被覆盖，state.json 仍被剥离。
- 默认值：全新用户（state.json 无四字段）→ 不生成库内文件，`getCurrentState` 返回 DEFAULT。
- 损坏回退：库内文件 JSON 损坏 → load 返回默认值，不抛错。
- `patchState` 路由：patch profile → 库内文件更新且 state.json 不含 profile；patch UI 字段 → 只写 state.json。
- cache 瞬态剥离：patch 含 `loading: true` 的 cache → 落盘文件无 `loading`/`error`。
- `createFile`：新 writing 文件 frontmatter 含 ISO `created`；`saveFile` 后 `created` 保留。

### E2E

按上文"E2E 改造"执行定向测试，全部通过为验收。

## 验收清单

- [ ] 老用户升级：四份记忆出现在库内三个文件，state.json 不再含五 key，应用内画像/博客列表/求职配置显示与升级前一致。
- [ ] 新用户：无库内文件生成，功能正常。
- [ ] 画像编辑、博客刷新/已读、求职配置修改后，写入的是库内文件。
- [ ] 应用重启后上述数据保留（读库内）。
- [ ] 新建 writing 文章 frontmatter 含 `created`；改名/移动/保存后不变。
- [ ] 定向 E2E 全绿；`startup-health` 通过。
