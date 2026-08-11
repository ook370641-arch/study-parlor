# 写作仓库 UX：展开持久化 + 排序规则 + 视觉标识 + 分组摘要 — 设计

日期：2026-08-12
状态：已批准（brainstorming 逐节确认，含 Visual Companion 视觉方案）
范围：写作列表树（WritingTree / WritingListColumn）与摘要机制

## 背景与目标

用户四条反馈：

1. **展开/收起持久化**：仓库 tab 每次进入所有顶层分组默认展开，长列表一次铺满；展开/收起状态应记住。
2. **分组级摘要**：摘要机制目前是逐篇文章，且只喂写作助手（无 UI 展示，2026-08-08 UX 修复时移除过悬停摘要）。用户希望「每篇文章、每个分组都有摘要」，全部给写作助手读——分组级摘要（尤其仓库）比逐篇更有价值。
3. **新建落点**：分组内新建文章应放到分组内列表末尾（根级同样统一）；分组永远在文章前面；新建分组追加到所有分组的最后一个。
4. **视觉标识**：分组与文章的树前缀标识要进一步区分，用符合当前应用风格（ink/parchment/ember，暗色仪式感）的小 UI 标识。

## 用户决策记录

- **仓库默认收起**：`repository` 根顶层分组无记录时默认收起；`writing` 根保持现状（顶层展开），兼容现有 E2E。
- **新建统一追加末尾**：根级与分组内一致，新文章都追加到所在容器列表末尾。
- **分组摘要只喂助手，不展示**：不做可见 UI（延续 2026-08-08「无摘要展示」决策）。
- **视觉方案 = A 结构 + B 文件夹**（Visual Companion 选择）：分组行 = 展开三角 ▾/▸ + B 款开/闭态文件夹图标；文章行 = A 款文档图标。默认米色弱化（parchment/50），选中/激活态琥珀（ember）。

## 设计 A：展开/收起持久化

### 现状

`WritingTree.tsx` `TreeNode` 的 `open` 为局部 `useState(depth === 0)`：顶层分组默认展开；tab 切换/重新进入时组件重挂载，回到默认全展开。

### 方案

- 新增 `state.json` 持久化字段 **`writingExpandedGroups: Record<string, boolean>`**（key = 节点相对路径，如 `repository/2023`、`repository/2023/子目录`；value = 用户**显式设置**的展开状态）。
- **默认规则**（key 不存在时）：
  - `writing` 根：顶层分组（depth 0）展开，子分组收起 —— 保持现状，兼容 writing-tree.spec 等现有断言。
  - `repository` 根：所有分组收起。
- `TreeNode` 的 `open` 从 store 读取（`writingExpandedGroups[node.path] ?? defaultRule(node)`）；点击 toggle 时写入 store + 300ms debounce `ipc.patchState`（复用 `debounceSaveAssistantWidth` 模式）。组件重挂载从 store 恢复，不再重置。
- **路径变更**：重命名/移动时在 store 的 `writingRenamed` 里对 `writingExpandedGroups` 的 key 做与 `writingOrder` 相同的前缀改写。删除/外部删除遗留 stale key 无害（树中无此路径即忽略），不做主动清理（保持简单）。

### 默认值落点

- `electron/ipc/state.ts` 的 `DEFAULT`：`writingExpandedGroups: {}`。
- `src/store/index.ts` `init`：`writingExpandedGroups: state.writingExpandedGroups ?? {}`。
- `src/types/index.ts` `StateJson`：新增可选字段（旧 state.json 无此字段 → 默认规则生效，向后兼容）。

## 设计 B：排序规则（分组永远在文章前；新内容追加末尾）

### 现状

- 渲染用 `sortNodesByOrder`：order 数组中的节点按序在前，未记录节点按扫描序在后（目录在前、文件按 localeCompare）。
- inline 新建输入显示在 `sortedInsertIndexForFile` 计算的位置（无序文件块内按名定位）。
- 创建后**不写** `writingOrder` → 新文件落在"无序文件"块内按名排，不落在末尾。

### 方案

1. **`sortNodesByOrder` 按类型分区渲染**（强制不变量）：
   `[有序目录按序] → [无序目录按扫描序] → [有序文件按序] → [无序文件按扫描序]`。
   目录永远在文章前；过去被手动拖成交错的目录会被重排为目录在前（正是新规则）。
2. **创建时写全量顺序**：文件/分组创建成功后，`writingOrder[parentDir] = [...childrenPathsOf(tree, parentDir, order) 过滤掉新路径, 新路径]`——新路径在数组**末尾**。由此：
   - 新文章 → 所在容器（根级或分组）列表**末尾**；
   - 新分组 → 排在**最后一个分组之后**（目录块末尾）。
3. **inline 预览位置**：`sortedInsertIndexForFile` 改为恒返回 `children.length`（容器末尾）。仅文件走 inline；分组走 `PromptDialog`，无定位问题。
4. 根级与分组内统一（用户确认）。

### 边界

- 创建成功但随后 `loadWritingTree` 失败：order 里多一个不存在路径，排序时忽略，无害。
- 拖拽排序（`reorderWritingSibling` / `moveWritingNode`）逻辑不变；渲染强制目录在前，拖文件到目录中间时实际渲染到目录块末尾——在实现计划里明确该行为。
- `diaryPrefillName` / 日记分组：预填逻辑不变，只改落点。
- `writingOrder` 全量写回是幂等的：每次创建重写该目录完整子序列，不产生累积脏数据。

## 设计 C：视觉标识

- **分组行**：展开三角（▾/▸，旋转，~10px）+ 文件夹图标（14px，B 款：展开=翻开盖 `folder-open` path，收起=合盖 `folder` path）。
- **文章行**：文档图标（13px，A 款 `file` path）。
- **颜色**：默认 `text-parchment/50`（米色弱化）；选中/激活态行 `text-ember`（琥珀，图标随行 `currentColor` 继承）。符合「琥珀只做点睛，激活态才用」设计语言（ui-styling §11）。
- **尺寸**：图标槽 16px、行高 22px、12px 字不变；SVG `stroke="currentColor"`、`stroke-width≈1.8`、`stroke-linecap="round"`。
- 内联 SVG 实现（不用 emoji，避免与暗色底冲突）；SVG 组件与既有 helper 一致放在组件文件内或 `src/lib`（遵守 ui-styling §10 Fast Refresh 约束）。

## 设计 D：分组级摘要 → 写作助手

### 现状

逐篇摘要已覆盖 `writing/` + `repository/` 两个根（`writingRefreshCatalog` diff 生成，写各自 `.catalog.json`），消费方为写作助手资料索引（`electron/lib/writing-assistant/prompt.ts`，已含两根逐篇条目）。无可见 UI。

### 方案

- **存储**：`.catalog.json` 增加 **`groups: Record<dirPath, { summary: string; signature: string }>`**；`WritingCatalog` 版本升到 **2**，`loadCatalog` 兼容 version 1（缺 `groups` 视为 `{}`，diff 时补写）。
- **生成时机**：复用 `writingRefreshCatalog` 同一后台 diff 循环；逐篇 diff 补齐后，对**受影响分组**（有新增/变动文章的目录，或尚无 `groups` 条目的目录）生成分组摘要。
- **内容**：分组摘要 = 合并该分组全部后代文章的逐篇摘要（子分组摘要若有也拼入），一条 LLM 调用生成一句话短摘要。
- **陈旧判定**：`signature` = 排序后成员 `relPath:entry.mtimeMs` 拼接哈希（基于 **catalog 条目里的 mtime**，非磁盘 mtime——成员摘要未重算前 signature 不变，避免编辑未生成时误触发）。signature 一致跳过，不重复调用 LLM。
- **喂助手**：`prompt.ts` 索引构建器在逐篇条目外追加 `- [组] <dirPath> — <分组摘要>`，让助手有目录级宏观理解。
- **边界**：
  - 空目录（无 md）不生成分组摘要。
  - 成员都无逐篇摘要（生成失败）→ 拼不出则跳过，下次进入再捞（与逐篇失败静默策略一致）。
  - 超大分组：参与合成的成员摘要截断到合理上限（如最多 30 篇），超限由 LLM 忽略，细节进实现计划。

## 数据流

- 展开状态：`TreeNode` click → store `setWritingGroupExpanded(path, open)` → debounce `patchState` → `state.json`。树加载/切 tab → store 读回。
- 新建落点：`WritingListColumn`/`WritingTree` submit → `ipc.writingCreateFile/Folder` → 成功后 store 写全量 `writingOrder[parentDir]`（新路径末尾）→ `patchState`。
- 分组摘要：进入写作来源 → `writingRefreshCatalog` → 逐篇 diff → 分组 signature 比对 → LLM 生成 `groups[dirPath]` → 写 `.catalog.json` → 助手索引读取。

## 向后兼容

- 新 `state.json` 字段缺失 → 默认规则生效。
- 旧 `.catalog.json`（version 1）→ `loadCatalog` 兼容读，`groups` 缺省 `{}`，首次 diff 补写。
- `writingOrder` 旧数据格式不变（仍是 `Record<string, string[]>`），仅排序语义改为目录先。
- 现有 E2E：writing 树顶层默认展开、目录排序断言等保持通过；`writing-catalog.spec.ts` 现有断言不改（追加新断言）。

## 测试计划（定向，不跑全量）

- **单元**（`tests/`）：
  - `writing-tree`：`sortNodesByOrder` 类型分区（目录先、组内按序、文件按序）、`sortedInsertIndexForFile` 恒末尾、新建写全量 order。
  - `writing-catalog`：signature 陈旧判定（变/未变/新增成员）、version 1→2 兼容、空目录跳过。
  - `writing-store`：`writingExpandedGroups` 默认值合并、`setWritingGroupExpanded` 写 store。
- **E2E 定向**（`node scripts/e2e-changed.js --run`）：
  - 新 spec `writing-expand-persist.spec.ts`：仓库 tab 收起的组点击展开 → 切 tab 再切回仍展开 → reload 后仍展开；`writing` 顶层默认展开不变。
  - `writing-catalog.spec.ts` 追加：进入写作来源后 `repository/.catalog.json` 出现分组摘要条目。
  - `writing-tree.spec.ts` 追加：分组内新建文章落在组内末尾、新建分组在最后一个分组后、文章图标/文件夹图标 testid 存在。
- 新增 spec 同步登记 `e2e/source-map.json`。
- 打包假设：无新二进制依赖，无需 package smoke。

## 影响文件

- `src/types/index.ts`：`StateJson` 加 `writingExpandedGroups`；`WritingCatalog` v2 + `groups`；`WritingCatalogEntry`/`groups` 条目类型。
- `electron/ipc/state.ts`：`DEFAULT` 加 `writingExpandedGroups: {}`。
- `electron/lib/writing-catalog.ts`：v2 schema、`groups` 读写、signature 计算、受影响分组 diff。
- `electron/ipc/writing.ts`：`writingRefreshCatalog` 扩充分组摘要生成。
- `electron/lib/llm-tasks.ts`：`generateGroupSummary`（含输入截断）。
- `electron/lib/writing-assistant/prompt.ts`：索引追加分组条目。
- `src/store/index.ts`：`writingExpandedGroups` 字段/init/`setWritingGroupExpanded`、`writingRenamed` 扩展、新建写全量 order 辅助。
- `src/lib/writing-tree-utils.ts`：`sortNodesByOrder` 分区、`sortedInsertIndexForFile` 恒末尾。
- `src/components/writing/WritingTree.tsx`：TreeNode 读 store + toggle 写 store；文件夹/文档内联 SVG 标识。
- `src/components/writing/WritingListColumn.tsx`：submit 后写全量 order。
- 测试：`tests/writing-tree.test.ts`、`tests/writing-tree-utils.test.ts`、`tests/writing-catalog.test.ts`、`tests/writing-store.test.ts`、`e2e/specs/writing-catalog.spec.ts`、新 `e2e/specs/writing-expand-persist.spec.ts`、`e2e/specs/writing-tree.spec.ts` 追加、`e2e/source-map.json`。

## 明确不做

- 不做分组摘要的可见 UI 展示。
- 不做仓库 tab 默认收起的策略开关（硬编码默认，保持简单）。
- 不改 `.catalog.json` 版本 1 的既有条目格式。
- 不做分组/文章的拖拽约束软化（目录先于文章为硬不变量）。
