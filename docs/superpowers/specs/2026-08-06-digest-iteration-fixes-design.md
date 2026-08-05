# 前沿来源迭代修复：精选集 + 导读 v2 审查问题修复设计

日期：2026-08-06
状态：已确认（用户指令"全部修复"，tiny 项经自审豁免并记录理由）

## 背景

2026-08-05 代码审查（三 agent 对照 spec/plan 实证）后，`worktree-feat+frontier-collection` 已 rebase + ff 合入 main（含合并语义修复：entry.guide 增 `context?` 兼容导读 v2）。两份原 spec 的实现主干均对齐，但遗留 12 项偏差/缺口。本设计覆盖全部非 tiny 项。

原 spec：
- `2026-08-04-frontier-collection-design.md`（精选集 + 正文加长）
- `2026-08-04-digest-guide-v2-design.md`（导读 v2）

## 修复项决策

### A. 精选集

#### A1 重启后收藏按钮状态丢失（P1 UX bug）

**问题**：`loadCollection` 仅由 `openCollectionView`/`syncCollectionQA` 触发。重启后直接打开简报，`collection.entries` 为空 → 已收藏块显示「☆ 收入精选集」→ 点击后主进程返回 DUPLICATE → `collectChunk` 静默 return → 按钮仍是 ☆，用户以为收藏失败。

**修复**（双保险）：
1. `openAssistantSession` 创建 briefing 会话时预载：`contextType === 'briefing' && !collection.loaded` → `void loadCollection()`。
2. `collectChunk` 开头防御：`if (!get().collection.loaded) await get().loadCollection()`——保证 DUPLICATE 判定基于真实磁盘数据。

**测试**：store 单测 ×2（预载触发；未加载时 collectChunk 先加载再判重）。E2E 在 `briefing-collection.spec.ts` 重启步骤补「重新打开简报后按钮为 ★ 已收藏禁用」断言（见 F3）。

#### A2 syncCollectionQA 写盘失败产生 unhandled rejection

**问题**：`finishAssistantStreaming` 以 `void` 调用 `syncCollectionQA`，内部 `await ipc.collectionAppendQA(...)` 抛错时产生未捕获异常；末尾 `loadCollection()` 也被跳过。

**修复**：循环体与末尾 `loadCollection` 包 try/catch，静默降级（游标未推进，下次 `finishAssistantStreaming` 幂等自愈，与 spec 语义一致）。

**测试**：store 单测——appendQA reject → syncCollectionQA 不 throw、不 unhandled rejection。

#### A3 CollectionView 术语表漏 explanation

**问题**：spec 要求"沿用 GuideSidebar 视觉语言"，`GuideSidebar.tsx:91` 有 `{t.explanation && <div>…}` 行，CollectionView 只渲染 term·translation。

**修复**：补 explanation 行，样式对齐 GuideSidebar（academic `text-parchment/50`、newspaper `text-[#999]`）。

**测试**：组件测试断言 explanation 渲染。

#### A4 精选集视图全局 chrome 缺失

**问题**：字号控制 + 换画按钮在各内容分支内重复渲染（Briefing.tsx 既有模式），`CollectionView` 分支没有——spec 要求"全局 chrome 常驻"（ui-styling §8/§9）。

**修复**：CollectionView 分支外包一层 `relative flex-1` 容器，加入与其他分支相同结构的按钮组（`briefing-font-size-decrease/increase` + academic 下 `briefing-swap-painting-button`）。沿用既有分支重复模式，不做跨分支重构（surgical）。

**测试**：E2E 打开精选集后断言 `briefing-font-size-increase` 可见（见 F3）。

#### A5 源重生成指纹：去重键补 chunkHeading

**问题**（spec 级链路缺口，原 spec 未覆盖"源重生成"场景）：同日简报删除后重新生成复用同一路径 `夜航简报-YYYY-MM-DD.md`，去重键 `(briefingFilePath, chunkIndex)` 会命中新正文的同索引块 → 按钮显示「已收藏」但条目快照是旧内容；用户也无法收藏新内容（DUPLICATE）。

**决策**：去重键升级为 `(briefingFilePath, chunkIndex, chunkHeading)`——heading 不一致视为新内容，允许收藏；旧条目保留（副本式快照语义不变）。`chunkHeading` 字段 schema 已有，旧数据无需迁移；同日简报重生成通常保持相同条目结构时 heading 一致，行为与现状相同，仅内容变化时放行。

**改动**：
- `addCollectionEntry` dup 判定加 `&& e.chunkHeading === entry.chunkHeading`。
- `ArticleBodyChunks` 的 `isCollected` 判定加 `&& e.chunkHeading === chunk.heading`。

**测试**：collection-store 单测（同索引不同 heading 放行）；slice/组件测试（heading 不匹配时按钮可点）。

#### A6 electron 版本回退锁定

**问题**：scope creep 提交把 `electron: 30.5.1` 改为 `^30.5.1`（与 build-dev 锁定依赖精神相悖，非本功能相关）。

**修复**：package.json 回退 `30.5.1`，lockfile 同步。useChunkScrollSpy hook 部分保留（已在 main 并证明无冲突）。

### B. 导读 v2

#### B1 进度 UI 三处对齐 spec

spec 原文：「一行阶段文案 + 一条 1px 高 `bg-ember/60` 细进度痕，`transition: width 400ms`」「阶段关键词用琥珀 `text-ember` 点睛」「撰写导读中… §2/§14 · 已写 860 字」。

实现偏差：`§2/14`（分母缺 §）、`duration-500`、整行统一 muted 无 ember 关键词。决策：**改代码对齐 spec**（spec 是评审过的设计意图；plan 的 `§2/14` 是实现期擅自偏离）。

**改动**：
- `guide-progress.ts` 新增 `guideProgressParts(p): { label: string; detail: string }`——label 为阶段文案（规划检索中…/检索背景资料中…/撰写导读中…），detail 为余下部分（`3/7`、`§2/§14 · 已写 860 字`，规划态为空串）；`guideProgressText` 改为基于 parts 组合（保持单测可断言的纯文本 API）。
- 撰写态 detail 分母补 §：`§2/§14`。
- GuideSidebar 渲染：label 用 `text-ember`（双版式一致，报纸版同样是 ember 点睛），detail 保持 muted；`duration-500` → `duration-400`。

**测试**：guide-progress.test.ts 更新撰写态断言 + parts 新用例；GuideSidebar.test.tsx 新增 ember 关键词 class 断言。

#### B2 非 briefing 不置 guideProgress

**问题**：`generateAssistantGuide`（store）对所有类型先置 `guideProgress: { stage: 'planning' }`，Anthropic/拾贝生成中也会闪「规划检索中…」（主进程只有 briefing 发三态事件，渲染层却无条件显示）。

**修复**：`guideProgress: s.contextType === 'briefing' ? { stage: 'planning' } : null`。

**测试**：store 单测——anthropic-article 会话生成中 `guideProgress` 为 null。此测试同时锁定「articleType 门控」这一此前无任何断言的防线。

#### B3 导读生成真取消（abortGuide）

**问题**：管线内 `new AbortController().signal` 永不 abort，切换文章靠渲染层 contextId 丢弃结果——LLM 流在后台跑完继续烧 token（正文加长 ×3 后代价更高）；且 store 把 `GUIDE_ABORT` 当错误显示「未能生成导读」。

**设计**：
- 新 IPC `articleAssistant:abortGuide`（无参 → `Promise<void>`），五层同步（types → handler → preload → facade → store）。
- 主进程 `article-assistant.ts` 模块级 `activeGuideController`：真实 briefing 路径生成前创建、结束清空；abortGuide handler abort 之。非 briefing 旧路径不纳入（单次调用，保持现状）。
- `runDigestGuideV2` 增第 4 参 `signal?: AbortSignal`：阶段 2/3 开始前检查 `signal.aborted` → throw `typed('GUIDE_ABORT')`；`chatStream` 的 signal 参数由 `new AbortController().signal` 替换为传入 signal（chatStream 内部已监听 abort → 中断 fetch）。
- handler catch：`code === 'GUIDE_ABORT'` 或 `controller.signal.aborted` → 抛 `typedError('GUIDE_ABORT')`；`typed()` 的 code 联合扩展。
- store：`openAssistantSession` 检测到切换文章（prev.contextId ≠ 新）时 `void ipc.articleAssistantAbortGuide()`；catch 中 `GUIDE_ABORT` 只复位 `guideLoading/guideProgress`，**不设 guideError**（abort 不是错误，不显示"未能生成导读"）。
- E2E mock 路径不受影响。

**测试**：store 单测 ×2（切换文章触发 abortGuide；GUIDE_ABORT 不显示错误）；管线单测覆盖阶段边界 abort（见 B4）；handler 级测试（mock 挂起管线 → abortGuide → generateGuide reject GUIDE_ABORT，见 B5）。

#### B4 管线编排单测（`runDigestGuideV2` 当前零测试）

新文件 `tests/article-assistant/guide-v2-pipeline.test.ts`，mock `kimi`/`search`/`credentials`：
1. 规划两次畸形 JSON → `chatNonStream` 调用 2 次、`searchWeb` 0 次、照常生成（user prompt 含「无外部资料」标注）。
2. 单查询失败 → 对应条目资料夹为空（断言 chatStream 收到的 user content 含「无外部资料」），其余条目有资料。
3. 无 API key → 全部资料夹为空，照常产出。
4. 阶段边界 abort：signal 已 aborted → throw GUIDE_ABORT，`chatStream` 不被调用。

#### B5 测试补缺打包

1. **writeGuide `guide_version` 条件分支**（b9b4361 移除 E2E 后的残余缺口）：`tests/article-assistant-guide-ipc.test.ts` 扩 handler 级测试——mock `electron` ipcMain 收集回调，临时目录真实写盘：guide 含 context → 写出的 `.guide.md` frontmatter 含 `guide_version: 2`；纯 summary → 不含。
2. **abortGuide handler**：同文件同模式——mock pipeline 挂起，调用 abortGuide 回调后 generateGuide reject `GUIDE_ABORT`。
3. **损坏恢复断言**：`tests/collection-store.test.ts` 损坏用例补断言——safe-json 语义是"写前备份上次好数据"：写入好数据 → 损坏主文件 → `readCollection` 从 `.bak` 恢复上次数据（而非仅返回空集合）。
4. **正文加长防回退断言**：`tests/briefing-prompts.test.ts` 追加用例——三个 prompt 文件分别含 `600-900`/`800-1200`/`6-10`（prompt 被改回旧字数时测试变红）。
5. **source-map sources 补登**：article-assistant group sources 增加 `electron/lib/guide-v2*.ts`、`src/lib/guide-progress.ts`（当前改这三个文件不触发任何导读 E2E）。

#### B6 §点击互跳 E2E

**问题**：spec 要求「§ 点击互跳导航仍工作」，现有 E2E 只有 hover 高亮单向（guide→body）；body→guide 的点击方向（铭牌 `onChunkClick` → `setGuideScrollToChunk` → 导读滚动定位）无 E2E。

**修复**：`article-assistant-guide.spec.ts` 补用例——点击正文铭牌 → 断言导读对应 chunk 卡片滚入可视区（`toBeInViewport`）或处于激活态。

### C. 明确不做（tiny 项豁免记录）

| 项 | 豁免理由 |
|---|---|
| E2E `window.reload()` vs 进程级重启 | 精选集数据在主进程磁盘，reload 已触发完整重读路径，等效 |
| 删除简报后断言基于既有 DOM 未触发重渲染 | 条目为副本快照，与源文件无渲染联动，无重渲染是正确行为 |
| 进度痕宽度组件断言 | `guideProgressFraction` 单测已覆盖 clamp/NaN 边界 |
| v1→v2 自动重生成的"跳过/稍后"选项 | 维持原 spec 决策（自动失效重生成）；B3 真取消已消除主要浪费（切换不再白烧 token） |
| main 上 3 个 tsconfig.node 预存错误（job-briefing/scout/job-error-codes） | 其他会话在飞工作，非本次迭代引入 |
| 精选集容量上限/虚拟化 | 无真实反馈，YAGNI |

### F. E2E 改动汇总（F3）

`e2e/specs/briefing-collection.spec.ts`：
1. 步骤 10（重启）补：重新打开该日简报 → `chunk-collect-button-0` 为「★ 已收藏」禁用态（A1 防线）。
2. 步骤 4（打开精选集）补：`briefing-font-size-increase` 可见（A4 防线）。
3. 修正 `injectSelection` 注释指向：`article-assistant.spec.ts` → `article-annotations.spec.ts`（ghost pen 真实路径所在）。

`e2e/specs/article-assistant-guide.spec.ts`：补 §点击互跳用例（B6）。

## 验收清单

- [ ] 重启后直接打开简报：已收藏块按钮为 ★ 禁用，点击不再静默无效
- [ ] appendQA 写盘失败：无 unhandled rejection，下次完整回答后自愈
- [ ] CollectionView 术语带 explanation；精选集视图下字号/换画可用
- [ ] 同索引不同 heading（源重生成）可重新收藏；旧条目保留
- [ ] electron 锁定 `30.5.1`
- [ ] 进度文案 `§x/§y`、label 琥珀点睛、400ms 进度痕
- [ ] Anthropic 生成中不显示「规划检索中…」
- [ ] 生成中切换文章：abortGuide 被调、主进程流中断、不显示导读错误
- [ ] 管线编排四用例通过；writeGuide 版本分支、.bak 恢复、字数防回退有断言
- [ ] source-map 补登后改 guide-v2 文件能触发导读 E2E（`e2e-changed.js` 验证）
- [ ] §点击互跳双向有 E2E
- [ ] 全量门禁：`npm run test` + `npm run test:e2e`（合并后首次）
- [ ] 手动：真实生成一次今日简报，抽查正文长度（博客 600-900 词档）与导读 context 质量
