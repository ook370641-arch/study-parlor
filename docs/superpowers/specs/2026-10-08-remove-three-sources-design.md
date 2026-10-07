# 删除求职/前沿/拾贝三来源 — 设计文档

日期：2026-10-08
状态：已批准（用户逐节确认）

## 1. 背景与目标

夜航简报页面现有五个来源：写作、博客（Anthropic）、前沿（digest）、求职（job-briefing）、拾贝（scout）。用户判断后三者"几乎从不使用"，决定彻底删除——代码、测试、E2E、学习库数据、state.json 字段全部清除，"仿佛从未存在过"。不迁移任何功能到 Hermes。

保留：写作、博客、夜航简报页面框架（侧栏 5 项 → 2 项，页面名与 Cover 入口不变）、核心学习会话、Tavily 搜索链、Hermes 日报依赖的 `writing/.backups` 快照机制。

## 2. 成功标准

1. `npx electron-vite build` 通过。
2. 改动对应的定向单测全绿；合并前跑一次全量门禁（`npx vitest run` + `npm run test:e2e`）。
3. 学习库 diff 恰好是三个目录的删除，无其他文件变化。
4. 启动后写作、博客、学习会话、封面功能正常；state.json 中被删字段缺失时应用以默认值正常启动。

## 3. 已定决策（ brainstorming 结论）

| 决策点 | 结论 |
|---|---|
| docs/ 下 ~106 个历史 spec/plan | 保留（git 历史本就留存）；只改 AGENTS.md 和 .claude/rules 的现行描述 |
| 桌面「学习库 - 副本 (2)」 | 不动 |
| 页面形态 | 只删侧栏三项，页面名/入口/布局不变 |
| 执行策略 | 单分支顺序提交（每 Phase 一个 commit，可 bisect 可叫停），不做多分支 |
| 迁移到 Hermes | 不做任何迁移 |

## 4. Phase 0 — 学习库数据删除

学习库 = `C:\Users\86468\Desktop\学习库`。已实地验证：无交叉引用（保留内容中无任何文件引用这三个目录）、`.backups` 快照仅存在于 `writing/` 下（保留）。

删除三个目录：

- `学习库\求职简报\` — 6 个简报 md + `.config.json`（jobProfile/jobBriefingConfig 的真相源，随功能一并删除）
- `学习库\夜航简报\` — 15 个 md（正文/.guide.md/.assistant.md）+ `精选集.json` + `.bak`
- `学习库\拾贝\` — 1 个历史对话 json

state.json（`~/.studyparlor\state.json`，在学习库之外）的字段清理放在 Phase 2 与 store 初始化逻辑同 commit，不手工改文件——避免应用旧代码读到被清字段与 store 默认值逻辑不一致。

验证：学习库 diff 仅三个目录删除；应用（旧代码）仍可正常启动（目录缺失时现有代码已有降级路径，仅需冒烟确认）。

## 5. Phase 1 — 共享点预处理（先于任何删除）

五个与保留功能共享的位置，先拆引线：

1. **`generateArticleSearchQuery` 抽离**【最高风险】：从 `electron/lib/job-briefing.ts` 移到中立模块（`electron/lib/search.ts` 旁），`electron/ipc/article-assistant.ts`（L16 import、L628 调用）改指向。文章旁注助手是保留功能（服务博客/写作）。
2. **`electron/lib/article-io.ts`**：`ALLOWED_DIRS = ['Anthropic博客', '拾贝']` 只删 `'拾贝'`，文件本体与博客通道不动。
3. **`electron/lib/writing-assistant/prompt.ts`（L97-138）**：目录索引删 digest/job/scout 段，保留 blog 段。
4. **`src/lib/companion-picker.ts`**：删 scout/job 分支，只留 anthropic；`BriefingSourceSidebar.handleNavClick` 传给它的 scoutTab/scoutReaderFilePath/jobResultFilePath 同步删。
5. **Tavily/search 链零改动确认**：`electron/lib/search.ts`、`electron/ipc/search.ts`、Settings Tavily 卡片、`credentials.ts`、`assistantSearchEnabled`、`~/.studyparlor/search-key.enc` 全部保留。

验证：build 通过 + 定向测试（article-assistant、article-io、companion-picker、writing-assistant 相关）。

## 6. Phase 2 — 代码删除（依赖倒序）

### 整删文件/目录

**主进程**：
- `electron/ipc/briefing.ts`、`electron/ipc/job-briefing.ts`、`electron/ipc/scout.ts`、`electron/ipc/collection.ts`
- `electron/lib/job-briefing.ts`（871 行）、`electron/lib/job-error-codes.ts`、`electron/lib/collection-store.ts`、`electron/lib/feed-status.ts`（仅 briefing.ts 引用）
- `electron/lib/scout/` 整目录（7 个文件）
- `electron/prompts/briefing/`、`electron/prompts/job-briefing/` 整目录；`electron/prompts/digest-guide.md`、`digest-guide-v2.md`

**渲染层**：
- `src/components/scout/`、`src/components/job-briefing/` 整目录
- `src/components/briefing/` 下 digest 专属：`AcademicBriefingLayout.tsx`、`NewspaperBriefingLayout.tsx`、`BriefingSourceCard.tsx`、`BriefingSourceItem.tsx`、`BriefingEmptyState.tsx`、`BriefingConstellation.tsx`、`CollectionView.tsx`（index.ts 相应精简）
- `src/components/BriefingDateColumn.tsx`、`BriefingProgress.tsx`、`BriefingError.tsx`、`BriefingSkeleton.tsx`（仅 digest/job 分支使用，删除分支后整删）
- `src/lib/scout-runtime.ts`、`src/lib/job-briefing-defaults.ts`、`src/lib/parse-briefing-markdown.ts`、`src/lib/collection-attribution.ts`、`src/lib/briefing-source-order.ts`

### 大改文件

- `src/store/index.ts`（3018 行）：删 scout 全部 state+actions（L200-222、L653-661、L1659-1756）、job 全部（L141-142、L238-270、L662-667、L1099-1350）、digest 生成/历史/已读/精选集 actions、`onBriefingProgress` 双订阅、JOB_* 错误码映射；改 init 时 state.json 读取（L725-762）。**同 commit 删除 state.json 被清理字段的默认值与读取逻辑**。
- `src/pages/Briefing.tsx`（641 行）：删三来源全部分支，剩写作+博客。
- `src/types/index.ts`：删 ~20 个接口/联合（Briefing*/Job*/Scout*/Collection 系列）；`DocType` 删 `'briefing' | 'web-article' | 'job-briefing'`；`BriefingSourceId` 收窄为 `'writing' | 'anthropic'`；StateJson 删对应字段；IpcApi 删 briefing*/jobBriefing*/scout*/collection* 方法与 onBriefingProgress/onScoutTool。**保留**：BriefingFontSize（被 studyFontSize 等复用）、BriefingTheme（博客/写作在用）。
- `electron/ipc/index.ts`：删四个注册调用与 config getter。
- `electron/preload.ts`：删 ~25 个 API（L108-121、L230-243）与 onBriefingProgress 双域订阅（L176-181）。
- `src/lib/ipc.ts`：facade 删 L75-86、L149-159。
- `src/components/BriefingSourceSidebar.tsx`：navItems 删三项 + 三个 Icon；picker 条件收窄；删求职星蓝高亮（例外主色随来源消失）。
- `src/components/md/ReportHeader.tsx`、`src/components/md/fileType.ts`：删三个 TYPE_LABELS/映射。
- `src/pages/Settings.tsx`：删"求职简报"配置卡片（L253-296）。
- `src/App.tsx`：删 initScoutRuntime。
- `electron/ipc/state.ts`：删 DEFAULT 中三来源字段与 loadJobData/saveJobData 调用。
- `electron/lib/library-data.ts`：删 jobDataPathFor/loadJobData/saveJobData/isNonDefaultJobData 与 MIGRATED_KEYS 两键（保留 profile/anthropicBlogCache 等迁移）。
- `electron/lib/frontmatter.ts`：删三条 EXT_FIELDS、文件名推断、parent_type 联合值。
- `electron/lib/guide-v2-pipeline.ts`：删 `runDigestGuideV2`（L155），`runBlogGuideV2` 保留。
- `electron/ipc/article-assistant.ts`：删 digest/web-article 分支（L109-111、L262、L367-412、L460、L510、L539、L710、L751），博客 v2 路径保留。
- `src/lib/guide-progress.ts`：删 'briefing'/'web-article' 分支。
- `src/components/article-assistant/ArticleGuideTabs.tsx`、`ArticleAssistantPanel.tsx`：删 briefing/web-article 分支。
- `src/components/anthropic/AnthropicArticleReader.tsx`：删 web-article 适配分支，组件本体保留。

### 明确不动

`BriefingListColumn.tsx`、`TransferToWritingButton.tsx`、PaintingPlate/CandlelightLayer/BriefingThemeToggle、`src/lib/article-chunks.ts`、ArticleBodyChunks、spine-seals、`electron/lib/{sibling-files,recovery,net-fetch,run-queue,kimi}.ts`、turndown/gray-matter/mammoth/pdfjs/exceljs 依赖。

验证：build 通过 + store/frontmatter/article-io/companion-picker 等定向测试。

## 7. Phase 3 — 测试与 E2E

**整删单测**（~30 个）：`tests/` 下 briefing-*（13 个）、collection-*（3 个）、job-briefing-*（4 个 + 2 个 fixture）、scout-*（11 个）、web-article-reader.test.tsx。briefing-sidebar.test.tsx 改写为只测 writing/anthropic。

**改共享单测**（~15 个，删断言）：store.test.ts、state-library.test.ts、library-data.test.ts、frontmatter.test.ts、guide-v2-real.test.ts、article-assistant-guide-ipc.test.ts、store-article-assistant.test.ts、store-generation-pulse.test.ts、guide-progress.test.ts、anthropic-blog-panel.test.tsx、GuideSidebar.test.tsx、transfer-to-writing.test.ts、article-assistant 下 digest 分支、article-io.test.ts（删拾贝用例）。

**E2E**：整删 briefing-*（14 个）、job-briefing-*（3 个）、scout-*（6 个）spec；改 `e2e/helpers/selectors.ts`（删三来源选择器段）、`e2e/helpers/test-library.ts`（seed 夹具）、`e2e/pages/ArticleAssistantPage.ts`、`e2e/README.md`。briefing-rail-layout / briefing-source-order / generation-ceremony 三个 spec 涉及保留 UI，逐个评估改写而非直接删。

**`e2e/source-map.json`**：删 job-briefing、scout 两个 group；briefing-core 收窄为写作/博客相关源文件；article-side-panel 组保留。

验证：`node scripts/e2e-changed.js --run` + 改动单测定向跑。合并前全量门禁。

## 8. Phase 4 — 描述层同步

- `AGENTS.md`：写作功能段落保留，简报来源描述改为两来源。
- `.claude/rules/*.md`：现行规则中"四来源/五来源"、三来源相关条目改写（历史 changelog 不动）。
- 删一次性脚本：`scripts/test-scout-fetch.js`、`test-briefing-chain.js`、`test-baseline-pipeline.js`、`test-full-experiment.js`、`test-quality-experiment.js`、`test-factor-experiment.js`、`test-llm-batch.js`、`test-llm-debug.js`、`experiment-final-report.md`、`quality-experiment-results.json`；仓库根 `可靠信息源.md`。
- `package.json` / `electron-builder.yml`：已确认无三来源专属依赖，不动。

## 9. 提交策略

单分支（如 `chore/remove-three-sources`）。学习库不在本仓库 git 内，Phase 0 是文件系统操作，不产生 commit，在执行日志中记录。commit 序列：

1. `refactor: 抽离 generateArticleSearchQuery 至中立模块`（Phase 1.1）
2. `chore: 预处理共享点（article-io/writing-assistant/companion-picker）`（Phase 1.2-1.4）
3. `feat!: 删除求职/前沿/拾贝三来源（主进程+渲染层+类型）`（Phase 2，含 state.json 字段清理）
4. `test: 删除三来源单测与 E2E，更新 source-map`（Phase 3）
5. `docs: 同步 AGENTS.md 与 rules 现行描述，清理一次性脚本`（Phase 4）

合并前跑全量门禁（`npx vitest run` + `npm run test:e2e`）。

## 10. 风险与回滚

- **最大风险**：Phase 1 共享点漏拆导致保留功能回归 → 由 Phase 1 前置 + 定向测试覆盖。
- **回滚**：单分支多 commit 可按 Phase revert；学习库数据删除不可逆，但「学习库 - 副本 (2)」保留同名目录作为事实备份（用户已确认）。
- **state.json**：被删字段在旧版本应用中存在不影响启动（store 有默认值兜底）；新版本启动后字段自然不再写入。
