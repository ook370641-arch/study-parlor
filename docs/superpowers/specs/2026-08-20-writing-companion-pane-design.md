# 写作右栏对照文模式（Companion Pane）— 设计

日期：2026-08-20
状态：已确认（经 grill-me 三轮问答，方案 v2）

## 背景

用户读 html/md 时希望在右侧同步展开另一篇文章做对照/摘录。当前右栏被 AI 写作助手独占（`WritingAssistantPanel`，可折叠、拖宽 200–560px）。目标：右栏变成可切换的槽位——同一槽位在「AI 助手」与「对照文章」两种模式间互斥切换。

## 已确认约束（用户问答）

1. **互斥槽位（方案 A）**：右栏同一时刻 = 助手 或 对照文。否决 split editor 并存方案（方案 B）：两方案 70% 工程量相同（store 双槽/宿主/入口/E2E），B 特有工作量反而略多（新分隔线、splitRatio 状态、空态、版头装饰归属），且三栏并存压缩主区。A 复用 `ArticleDivider` 与 `writingAssistantWidth` 现状。
2. **对照文可编辑、无 toolbar（决策 B）**：`writingEditorAction` 是全局单槽（`store/index.ts:403`），两个 Milkdown 实例并存会争抢注册。v1 不做 toolbar 焦点路由；对照编辑器靠 Markdown 语法/快捷键排版（Milkdown 输入规则与主编辑器一致），不注册全局 toolbar action。
3. **映射持久化**：每篇主文记住自己的对照文，`state.json` 新增 `writingCompanionMap: { 主文路径 → 对照文路径 }`；切主文时右侧自动恢复新主文的映射对照文。
4. **换文入口 = 左键情境化**：右栏展开且处于对照 tab 时，左键点文件树文章 = 切换对照文；右栏折叠或助手 tab 时，左键 = 切主文（现状）。否决右栏内置文件选择器/迷你树（窄栏体验差，+60~150 行）。
5. **空态 UI**：对照模式无选定文时显示引导（文案明示"点击左侧文件树中的一篇文章"）；主区无文章时对照 tab 置灰禁用。
6. **文件树双高亮**：主文保持现有 ember 橙底（`WritingTree.tsx:134-136`）；对照文加第二标识（左侧 2px 竖条 + 浅底色），两态可叠加感知。
7. **删除文件树右键菜单**：菜单 5 项功能全部已有替代路径（见下表），且菜单自身有 bug（「新建文章/新建子分组」两项 onClick 未调 `closeMenu()`，`WritingTree.tsx:287/295`；`fixed` 定位无边界裁剪）。删除即根治。

| 右键菜单项 | 替代路径 |
|---|---|
| ＋ 新建文章 / 新建子分组 | 节点 hover 按钮 ＋ / 🗀（`WritingTree.tsx:216-236`） |
| 重命名 | hover 按钮 ✎（InlineNameInput 内联改名，`:207-215`） |
| 删除/解散分组 | hover 按钮 🗑（ConfirmDialog 确认，`:238-246`） |
| 移出分组 | 拖拽到树容器空白区 = 移到根目录（`WritingTree.tsx:416-430` 根级投放区已存在） |

## 目标 / 非目标

**目标**

- 右栏槽位头部加「AI 助手 ⇄ 对照文章」切换 tab，两模式互斥，各自状态独立保留（切走再切回不丢）。
- 对照文支持 md（Milkdown 可编辑，无 toolbar）与 html/xlsx/pdf/docx（复用现有只读预览分派）。
- 对照文编辑有 autosave（1.5s debounce，复刻主文模式）与保存状态指示。
- 左键情境化换文 + 映射持久化 + 切主文自动恢复对照文。
- 文件树双高亮 + 空态引导。
- 删除文件树右键菜单及其死代码。

**非目标（防范围蔓延）**

- toolbar 焦点路由（`writingEditorAction` 焦点注册/注销机制）——deferred，将来需要时在 `WritingEditor` 的注册 prop 上演进。
- 右栏内置文件选择器/迷你文件树。
- split editor、三栏并存。
- 对照文的独立 AI 助手会话（助手会话绑定主文的 `articlePath` 机制原样不动）。
- 「清除映射」入口（✕ = 切回助手模式、映射保留；换文直接左键选新的即覆盖，无需显式清除）。
- 主文与对照文双份字号独立控制（`writingUIFontSize` 全局统一，与现状一致）。

## 设计

### 交互模型与左键分流

右栏槽位 = 容器（折叠/拖宽逻辑不变）+ 头部 tab（`助手 | 对照`）+ 内容区（按 `writingPanelMode` 渲染）。

左键语义跟随右栏状态，`TreeNode.handleClick`（`WritingTree.tsx:48-52`）分流：

```
if (isDir) → 展开/收起（不变）
else if (writingAssistantOpen && writingPanelMode === 'companion')
    → selectCompanionFile(node.path)   // 含映射写入
else
    → selectWritingFile(node.path)     // 现状
```

对照模式下点击当前主文 → 忽略 + toast「该文章已在主编辑区打开」。

切主文（非对照模式下点树）：`selectWritingFile` 开头在现有「主文 dirty 先存」之后追加——对照文 dirty → 先 `saveCompanionFile()`；随后若 `writingPanelMode === 'companion'`，查 `writingCompanionMap[新主文]`：有映射且文件存在 → 加载恢复；无映射 → 清空对照槽（空态）。

### 状态与持久化（ipc-state §3：新字段带默认值、兼容旧 state.json）

| 字段 | 位置 | 持久化 | 默认 |
|---|---|---|---|
| `writingPanelMode: 'assistant' \| 'companion'` | store + `StateJson` | ✅ `patchState` | `'assistant'` |
| `writingCompanionMap: Record<string, string>` | store + `StateJson` | ✅ `patchState` | `{}` |
| `companionFile: { path, body, kind, truncated?, previewError?, dirty, saving } \| null` | store 运行时 | ❌ | `null` |

store 初始合并：`state.writingCompanionMap ?? {}`、`state.writingPanelMode ?? 'assistant'`（照抄现有合并段，`store/index.ts:595-627` 模式）。**无新 IPC、无 preload 改动**——读复用 `writingRead`/`writingReadPreview`，写复用 `writingWrite`。

新 actions（复刻 `selectWritingFile` 既有模式：模块级 `companionSelectSeq` 防竞态 §general 7、dirty 先存后切、非 md 走 readPreview 分支）：

- `setWritingPanelMode(mode)` — set + patchState。
- `selectCompanionFile(path)` — 同文拒绝；旧对照文 dirty 先存；写映射 `writingCompanionMap[主文.path] = path` + patchState；按 kind 读取装载 `companionFile`。
- `updateCompanionBody(body)` / `saveCompanionFile()` — 复刻主文 `updateWritingBody`/`saveWritingFile`（`store/index.ts:2556-2566`），保存期间切文丢弃过期结果。
- `closeCompanion()` — ✕：dirty 先存，清 `companionFile`，`setWritingPanelMode('assistant')`（映射保留）。

### 对照编辑器的 toolbar 隔离（决策 B 的直接推论）

`WritingEditor` 的 `EditorInner` 在挂载/卸载时无条件 `setAction(...)` / `setAction(null)`（`WritingEditor.tsx:76-84`）。对照实例若不隔离，挂载时会覆盖主编辑器的 toolbar 注册、卸载时清掉主编辑器的注册。

方案：`WritingEditor` 新增可选 prop `registerToolbarAction?: boolean`（默认 `true`，主编辑器不传、行为不变）；对照编辑器传 `false`，`EditorInner` 内条件跳过注册 effect。这是 v1 对全局单槽争抢的最小隔离，不是焦点路由（非目标）。

### CompanionBoard 宿主

新组件 `src/components/writing/CompanionBoard.tsx`（只导出组件，ui-styling §10）：

- 头部信息行：对照文文件名（`displayWritingName`）+ 保存状态 + ✕（`closeCompanion`）。
- 无 `companionFile` → 空态：「点击左侧文件树中的一篇文章，在此展开对照」。
- `kind === 'md'` → `<WritingEditor key={path} initial onChange registerToolbarAction={false} />`。
- `kind === 'html'` → 复用 `HtmlPreview`；其余 → 复用 `ReadonlyPreview`（分派逻辑照抄 `WritingBoard.tsx:49-72`）。
- autosave：`useEffect` 监听 `companionFile.body/dirty`，1.5s debounce → `saveCompanionFile()`（复刻 `WritingBoard.tsx:19-23`）。
- Ctrl+S：`WritingBoard` 的 window 级监听（`:26-35`）改为调新 action `saveAllDirtyWriting()`（保存主文 + 对照文中 dirty 者）；`CompanionBoard` 不重复挂监听。

### 文件树双高亮

`TreeNode` 新增订阅 `companionPath = useStore(s => s.companionFile?.path)`：

- 主文：现状不变（academic：`bg-ember/10 text-ember`；newspaper：`bg-[#1a1a1a]/10`）。
- 对照文（非主文时）：左侧 2px 竖条 + 浅底——academic：`box-shadow: inset 2px 0 0 var(--tw 色) / bg-parchment/8`；newspaper：`bg-[#6b5d52]/10` + 深色竖条。同行同时是主文与对照文不可能（同文被拒绝），无需叠加态。
- `data-testid` 复用 `writing-tree-node`，新增 `data-companion="true"` 属性供 E2E 断言。

### 右键菜单删除

删除：`menu` state、`handleContextMenu`、`closeMenu`、外点关闭 effect（`:59-65`）、菜单 JSX（`:278-321`）、菜单专属的 PromptDialog 版 `doRename`（`:69-82`，唯一调用方是菜单）；保留 hover 按钮使用的 `doNewFile`/`doNewFolder`/`setEditing`/`setConfirmingDelete` 路径。同时删除孤 dead import（`onContextMenu` 绑定等）。

**规则 12 张力声明（诚实记录）**：feature-development §12 要求隐藏式交互（拖拽）不能是功能的唯一路径。「移出分组」删除菜单后唯一路径 = 拖到树空白区，属隐藏交互。接受理由：拖拽已是该树的核心交互（排序、跨组移动、外部文件导入全部依赖拖拽）；树容器有 `min-h-[120px]` 空白区常驻；本应用单用户且该用户熟知拖拽。若日后证明发现性不足，补救 = 节点 hover 区加「移出分组」按钮（仅当 `parentDir !== root` 时显示），成本 ~15 行，此处不实施。

### UI 出口（feature-development §12）

- 入口 = 右栏头部对照 tab（可见按钮，收起态 = ArticleDivider 竖条上现有 ◀ 展开钮；展开态 = tab 行）。`data-testid`：`writing-panel-tab-assistant` / `writing-panel-tab-companion` / `companion-board` / `companion-empty` / `companion-close`。
- 左键换文不依赖隐式知识：空态文案直接明示「点击左侧文件树中的一篇文章」；对照模式下头部文件名行常驻显示当前对照文。
- 以上 testid 全部出现在 E2E 断言中。

### 错误处理与边界

- 对照文被外部删除：`selectCompanionFile` 读取失败 → 清 `writingCompanionMap[主文]` 映射 + toast + 对照槽回空态（非 md 分支沿用 `previewError` 路径）。
- 切主文时恢复映射对照文但文件已不存在 → 同上清映射。
- 对照文 dirty 时：切主文 / 换对照文 / ✕ / 关面板折叠（折叠不切模式，不触发保存——宽度 <40 的自动折叠同样只折叠）→ 前三者先 autosave。
- 重命名/移动主文或对照文：现有 `writingRenamed`/`moveWritingNode` 只更新树与 `writingFile`；映射表以路径为键值——**重命名后映射失效**（旧键找不到文件 → 按"外部删除"路径清映射 + toast）。v1 接受此行为（低频、可重选），不做映射跟随，记入已知取舍。
- Milkdown 双实例内存：两个实例常驻可接受（单文档应用，文档量级小）。
- `writingAssistantWidth` 两模式共享（现状 200–560 夹取不动）。

## 验收清单（feature-development §1/§11）

- [ ] 右栏头部出现「助手 | 对照」两个 tab，可互切，重启后记住模式（state.json）
- [ ] 对照 tab 无映射时显示空态引导文案；主区无文章时对照 tab 置灰
- [ ] 对照模式展开时左键点树中文章 → 右侧装载该文（md 可编辑、html 只读预览），树中该文出现对照高亮
- [ ] 对照模式下点当前主文 → toast 拒绝，状态不变
- [ ] 换对照文后重启应用 → 打开同一主文、切到对照 tab → 自动恢复上次对照文（映射持久化）
- [ ] 对照文编辑 → 1.5s 内自动保存，头部保存状态指示与主文一致
- [ ] 对照文 dirty 时切主文/换对照文/✕ → 内容不丢（先保存）
- [ ] 主编辑器加粗等 toolbar 功能在对照编辑器挂载/卸载后仍作用于主编辑器（toolbar 隔离）
- [ ] Ctrl+S 同时保存两侧 dirty 文件
- [ ] 文件树任意节点右键 → 无菜单弹出；hover 的 ✎/＋/🗀/🗑 与拖拽移出分组功能正常
- [ ] 对照文被外部删除后切回 → 清映射 + toast，无白屏
- [ ] 助手会话仍绑定主文：对照模式来回切换不影响助手消息与 `.assistant.md` 写入

---

## 实现期偏离记录（2026-08-21）

### 1. 切主文恢复对照文的时序 bug（E2E 暴露，已修复）

`selectWritingFile` 恢复映射最初在主文 `set` **之前**调用 `selectCompanionFile`。当"映射值 = 旧主文"时（A→B 映射，切到 B 再切回 A），`selectCompanionFile` 的"同文拒绝"拿尚未切换的旧主文做判断 → 误拦，对照文永不恢复。

修复：把映射恢复抽成 `restoreCompanion` helper，移到 `writingFile` set **之后**调用（非 md 分支 return 前、md 分支 set 后），并补回归单测锁定该场景。**教训**：单测未覆盖此 bug 是因为原"恢复映射"用例的映射值 ≠ 旧主文，没踩到同文拒绝分支；时序类 bug 需 E2E 真实 UI 链路（连续切主文）才能暴露。

### 2. CompanionBoard 的 html 分支（worktree 基线差异）

本 worktree 基于 main HEAD，不含 `HtmlPreview` 组件（它是主工作区另一条"HTML 预览"线的未提交产物）。故 CompanionBoard 仅实现 md（`WritingEditor`）/非 md（`ReadonlyPreview`）两分派。待 HTML 预览线合入后，补 3 行 `kind === 'html' → <HtmlPreview />` 分支即可获得 html 对照只读预览（WritingBoard 的 html 分支同源）。
