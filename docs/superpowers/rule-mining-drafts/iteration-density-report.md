# 功能迭代密度报告

## 摘要

- **总提交数**：535（`git log --oneline --all --reverse`，含所有分支）
- **总 spec 数**：38（`docs/superpowers/specs/*.md`）
- **高密度模块数**：5（评分 ≥ 7）
- **主要 Agent 行为偏差（top 5）**：
  1. **边界 / 空值验证不深入**：对外部 feed、X builders、Tavily 返回、frontmatter 缺字段、state.json 空值等场景反复补洞。
  2. **过度设计与过早抽象**：归档触发经历了 marker → token → 自然语问句 → 边缘检测 → 完整链路重设计；UI 出现 gravity field、双版简报主题、star particles 等高复杂度实现。
  3. **跨层同步遗漏**：types、preload、store、IPC facade 经常在首次实现时漏改，后续以 `fixup!` 或专门 fix 提交补齐。
  4. **提示词与行为契约漂移**：归档问句、摘要格式、transcript 占位符、Kimi 温度 / thinking 参数多次回滚或补丁。
  5. **外部依赖与打包环境脆弱性**：Tavily、X feed、gray-matter Buffer、Electron 打包后资源路径、orphan 进程等反复出问题。

## 模块按迭代密度排序

> 说明：每个模块的提交按 **primary domain** 分类（优先取提交消息中的作用域标签，再按关键词 fallback），同一提交只属于一个模块，因此总数为 535。
> 评分依据：fix / refactor / perf 占比、绝对补丁数、spec 迭代次数、fixup / revert 密度、近期活跃度。

### 1. Web 搜索 / 外部资料

- **迭代密度评分**：9 / 10
- **相关 commits 数量**：16（feat 8 / fix 7 / test 0）
- **主要问题摘要**：模块虽小，但补丁密度最高（44%）。先有 diagram/SVG 探索，再叠加 Tavily 搜索、safeStorage、IPC 重试、外部资料摘要面板，每一步都伴随 `fixup!` 和合并冲突修复。类型与 preload 的跨层同步也反复补洞。
- **关键 commits**：
  - `517eb6c` feat(diagram): add generateDiagram backend with tests（该领域最早提交，后转向 LLM 直接 SVG）
  - `a199e32` docs: add web search feature design and implementation plan
  - `6353c29` feat(search): add safeStorage-based Tavily key storage
  - `7a064fa` feat(search): add Tavily client and LLM query/brief generation
  - `7bc25a7` feat(search): add search IPC handlers with retry logic
  - `725bcfe` fix(search): resolve merge conflicts, dedupe preload/types and harden credentials
  - `11bf3b1` feat(search): increase tutor brief limit from 3000 to 5000 chars
- **相关 specs**：
  - `docs/superpowers/specs/2026-06-21-web-search-design.md`
  - `docs/superpowers/specs/2026-07-06-external-materials-summary-panel-design.md`（第二轮：把仅对系统 prompt 可见的摘要变成用户可见的右侧抽屉）
- **Agent 行为偏差**：
  - **边界验证不深入**：Tavily 凭证、IPC 重试、safeStorage 边缘 case 靠多次 `fixup!` 补齐。
  - **跨层同步遗漏**：`fixup! types: add external-materials doc type and search IPC types` 说明 types/preload/store 未一次对齐。
  - **外部依赖脆弱性**：搜索重试、摘要长度、合并冲突都显示对 Tavily / 网络层假设过于乐观。

### 2. 夜航简报（Briefing / 夜航简报 / Anthropic 博客）

- **迭代密度评分**：9 / 10
- **相关 commits 数量**：44（feat 19 / fix 9 / test 7）
- **主要问题摘要**：从最初 AI builders digest，到双风格 UI、加载进度/错误分类、字号与 feed 源状态，再到 Anthropic 博客集成， spec 与代码都经历了四轮大迭代。UI 细节（header 居中、source link、字号按钮、source tooltip）反复精调。
- **关键 commits**：
  - `ceb967c` docs: add night briefing feature design spec and visual mockups（领域首个提交即 spec）
  - `33aed08` feat(briefing): add main-process feed fetch, LLM generation and file cache
  - `c6105af` feat(briefing): add timeline layout page and skeleton
  - `e2800b2` feat(briefing): two-call pipeline, profile injection, briefingList IPC
  - `5d60b23` feat(briefing): add BriefingStage type and IPC progress contract
  - `851e619` fix(briefing): skip X builders with missing/empty tweets to avoid crash
  - `70fc973` fix(search/briefing/wild-card): harden JSON parsing, Kimi thinking, abort/timeouts, concurrency and error surfacing
  - `b257696` fix(briefing): address typecheck and test issues
  - `7ec9558` fix(briefing): add missing briefing layout components
  - `8907f55` fix(briefing): heading styles, source tooltip, prompt cleanup, and layout tests
  - `afaa790` fix(briefing): header centering, swap button position, white newspaper bg, larger progress text
  - `2e5cade` fix(briefing): restore clickable source links and enforce article-body links
  - `6855f7a` fix(briefing): hide source status when all ok, use -/+ for font size
- **相关 specs**：
  - `docs/superpowers/specs/2026-06-21-night-briefing-design.md`（初版，AI builders digest）
  - `docs/superpowers/specs/2026-06-27-briefing-entry-and-loading-design.md`（第二轮：入口可发现性 + 进度/错误分类）
  - `docs/superpowers/specs/2026-06-27-briefing-ui-upgrade-design.md`（第二轮并行：学术期刊 / 报纸活字双风格）
  - `docs/superpowers/specs/2026-07-06-night-briefing-optimization-design.md`（第三轮：统一 header、字号、feed 重试、源状态）
  - `docs/superpowers/specs/2026-07-10-anthropic-blog-briefing-design.md`（第四轮：集成 Anthropic 博客阅读器）
- **Agent 行为偏差**：
  - **验证不深入**：X builders 空 tweet、feed 为空、source link 点击失效等都在上线后补丁。
  - **过度设计**：为单一简报功能引入学术/报纸双主题、字号四档、source status、往期 drawer，复杂度持续膨胀。
  - **外部依赖脆弱**：feed 拉取、LLM 两阶段 pipeline 在网络和模型行为变化时反复加固。

### 3. LLM / Prompt / 会话归档

- **迭代密度评分**：8 / 10
- **相关 commits 数量**：56（feat 21 / fix 17 / refactor 1 / perf 1 / test 5）
- **主要问题摘要**：归档触发机制经历了 marker → token → 自然语问句 → 边缘检测 → 全链路重设计的多次重做；group inspiration 推荐质量与 JSON 解析连续 4-5 个 fix；prompt 中归档占位符、结束问句、Kimi 温度/thinking 参数也多次回滚或补丁。
- **关键 commits**：
  - `f646d3d` feat(prompts): assembly chain (base → review → difficulty → profile)（领域最早提交）
  - `7da9036` docs(spec): archive trigger redesign — natural-language phrase + edge-counted dismiss
  - `8c49f15` feat(prompt): replace 「本轮归档」 token with natural-language 需要存档吗?
  - `25d97f1` refactor(store): suggestEnd → archivePending with edge detection + dismiss
  - `4dfa4b5` fix(prompt): remove conflicting archive instructions from learner-base.md
  - `a18b06f` spec: session cache and archive flow redesign
  - `bc39f4c` fix(archive): relax phrase detection + add diagnostics for missing banner
  - `363ed95` fix(rec): improve prompt, add JSON cleanup + tests, fix GroupRecCard mount logic
  - `0eecaeb` fix(rec): systematic debugging — 3 root causes fixed
  - `d462f1b` fix(rec): extractJsonObject uses open-quote to avoid non-JSON braces
  - `7c9c80c` fix(group-inspiration): JSON extraction failures and refresh flicker
  - `e687bad` fix(group-inspiration): add fallback extraction + stronger prompt constraints
  - `7351a55` fix(kimi): force temperature=0.6 for kimi-* models, keep others flexible
  - `efb6f73` fix(prompts): 统一对话结束唯一出口为固定归档问句
  - `85e5c0b` fix(prompts): 归档学习报告模板补回 {{transcript}} 占位符
- **相关 specs**：
  - `docs/superpowers/specs/2026-05-09-archive-trigger-redesign.md`（明确 replaces marker/token 两版）
  - `docs/superpowers/specs/2026-05-10-session-archive-redesign-design.md`（在上份 spec 基础上再做统一缓存-归档链路重设计）
  - `docs/superpowers/specs/2026-05-27-group-inspiration-redesign-design.md`（修复刷新闪烁 + 推荐质量）
  - `docs/superpowers/specs/2026-06-05-continue-topic-recommendations-unification.md`
  - `docs/superpowers/specs/2026-06-21-wild-card-recommendation-design.md`
- **Agent 行为偏差**：
  - **过度设计 / 协议漂移**：归档触发从隐形 marker 到自然语问句，反复调整检测层与 prompt 层分工。
  - **提示词契约漂移**：归档问句、占位符、结束出口多次补丁，说明 prompt 与代码解析未同步验证。
  - **边界遗漏**：JSON 提取、 phrase 检测、session 恢复后 stuck 等问题均在运行时发现。

### 4. 学习库文件 / Frontmatter

- **迭代密度评分**：7 / 10
- **相关 commits 数量**：15（feat 7 / fix 6 / test 1）
- **主要问题摘要**：模块很小但补丁密度高达 40%。从 gray-matter 解析，到嵌套 topic/session 扫描，再到 frontmatter 缺字段、external-materials 类型推断，最后甚至把 gray-matter 换成 regex strip 以规避 renderer 中的 Buffer 错误， schema 兼容性反复被打补丁。
- **关键 commits**：
  - `baa385c` feat(frontmatter): parse/serialize with gray-matter and defaults（领域最早提交）
  - `396d024` fix(frontmatter): fallback to filename-derived title when frontmatter missing
  - `c5f4cbf` fix(frontmatter): address code review feedback
  - `3d6fc3c` feat(files): rewrite scan for nested topic/session structure
  - `6b5a426` fix(files-scan): read session_number from frontmatter, export helpers for tests
  - `c16961a` fix(files-scan): address 2 critical issues from code review
  - `1e6c407` feat(frontmatter): type-aware schema with ordered serialization and backward compat
  - `b9d69bf` fix(StudyLibrary): replace gray-matter with regex frontmatter strip to avoid Buffer error in renderer
  - `fcbbc24` fix(frontmatter): support external-materials type inference
- **相关 specs**：
  - `docs/superpowers/specs/2026-05-27-report-frontmatter-display-design.md`
  - `docs/superpowers/specs/2026-05-27-md-renderer-design.md`（含 frontmatter 渲染）
- **Agent 行为偏差**：
  - **兼容性 / 边界遗漏**：renderer 与主进程对 gray-matter 的依赖不一致导致 Buffer 错误；external-materials 类型推断滞后。
  - **过早抽象**：type-aware schema + ordered serialization 在后续业务变化中仍需要多次补丁。

### 5. 构建 / 开发环境 / 进程清理

- **迭代密度评分**：7 / 10
- **相关 commits 数量**：42（feat 9 / fix 9 / refactor 3 / test 2）
- **主要问题摘要**：近期（v1.1.0 前后）出现密集的 dev hang、orphan electron/node 进程、userData/cache 隔离、.env 与 state.json 目录分离等修复。setup wizard、packaged build、CI release 也都经历过专门补丁。
- **关键 commits**：
  - `30ff271` chore: bootstrap electron-vite + react + tailwind skeleton（领域最早提交）
  - `1515c0f` fix(packaging): resolve runtime failures in packaged exe
  - `18b0a1e` fix(setup): fix first-run boot hanging by switching to pull-based boot model
  - `d14a189` fix(config): store .env under ~/.studyparlor in packaged builds
  - `ecba31f` feat(env): separate .env dir from state.json dir
  - `31b2bea` feat(cleanup): extract shared process/port cleanup utilities
  - `0b562fb` feat(dev): preflight orphan cleanup and auto-exit on electron-vite exit
  - `b6a973b` feat(main): isolate dev-mode userData/cache under project root
  - `2da5059` fix(main): close all webContents and log before-quit on window close
  - `4a18d32` fix(cleanup): use powershell json for process enum, pass pid to killProcessTree, isolate dev cache under node_modules
- **相关 specs / plans**：
  - 无专门 design spec，但对应最新计划 `docs/superpowers/plans/2026-07-10-fix-dev-hang-and-orphan-processes.md`
- **Agent 行为偏差**：
  - **打包 / 环境验证盲区**：打包后资源路径、.env 位置、 orphan 进程在开发环境未提前暴露。
  - **回归测试不足**：Electron 主进程生命周期、userData 隔离需要在真实打包/多次 dev 启动中才能发现。

### 6. E2E 测试

- **迭代密度评分**：6 / 10
- **相关 commits 数量**：107（feat 10 / fix 11 / test 62）
- **主要问题摘要**：提交量第二（107），但大部分为测试扩展而非功能补丁。fixtures、selectors、page objects、seed helpers 在快速扩张中多次修正命名空间、selector、数据工厂问题；真实 API 与 mock 策略也经过三轮 spec 迭代。
- **关键 commits**：
  - `a3f941c` chore(tests): add Playwright E2E scripts to package.json（领域最早提交）
  - `4c166cd` fix(e2e): align test-library seed helpers with app directory layout
  - `fe56494` fix(e2e): harden test-library helpers per code review
  - `82aff72` test(e2e): implement Playwright E2E suite with CDP fixture
  - `a275bd6` fix(e2e): add missing SELECTORS import in pre-study spec
  - `638b3f7` fix(e2e): add window.reload() after seed for library-based tests, fix briefing/fable/diagram specs
  - `8e81ee7` fix(e2e): fix topic-card selectors to use slug (dirName) instead of frontmatter title
  - `d066e71` fix(e2e): isolate Chromium userData/cache to prevent dev startup slowdown after tests
  - `4abbaaf` test(e2e): fix Phase 2 specs - briefing, external-materials, fable-generation
  - `f88369d` feat: external summary panel, briefing font size, and dev/e2e improvements
- **相关 specs**：
  - `docs/superpowers/specs/2026-06-24-e2e-automation-design.md`（初版：真实 API、核心流程）
  - `docs/superpowers/specs/2026-06-27-e2e-full-coverage-design.md`（扩张到 06-20 前全部功能）
  - `docs/superpowers/specs/2026-07-02-e2e-coverage-expansion-design.md`（引入 mock/@unstable 分层与标签）
- **Agent 行为偏差**：
  - **验证不深入**：selector 用 frontmatter title 而非 slug、数据工厂与目录布局不一致等问题在大量测试堆积后才暴露。
  - **过度工程**：page objects、seed factories、scripts 数量快速膨胀，维护成本上升。
  - **外部依赖脆弱**：真实 API 策略导致不稳定，后续不得不引入 `@unstable` 与 mock 分层。

### 7. UI / 组件 / 样式

- **迭代密度评分**：5 / 10
- **相关 commits 数量**：170（feat 110 / fix 26 / refactor 7 / test 8）
- **主要问题摘要**：提交量最大，但多为新功能（art 背景、分组 gravity field、markdown renderer、quotes、terminology 等）。补丁密度相对较低（约 19%），不过单个复杂组件（StudyLibrary drag、MarkdownRenderer、GroupRecCard、ExternalSummaryPanel）反复修补。
- **关键 commits**（按簇）：
  - 分组拖拽：`f2f66f6` 鼠标事件死锁、`1368f30` gravity center 闭包 bug、`48ededa` 窗口 resize、`2cd3af5` 全局坐标重构
  - Markdown 渲染：`05606d0` error boundaries、`0906c7d` 移除 async rehypeShiki、`d08fec6` 无条件 frontmatter strip、`b9d69bf` gray-matter → regex
  - StudyLibrary / GravityField：`72fb118` pagination clamping、`e7d700f` z-index、`49e5525` stuck spinner / re-render cascade
  - GroupRecCard：`bcc1251` cache-clear / loading、`0408166` manual refresh debounce
  - Quotes / Terminology：`8510702` responsive / curly quotes、`3f8e4d9` DEFAULT_TERMINOLOGY typing、`68bc3e9` scope creep 清理
  - 外部摘要面板：`27bc5f4` no-backdrop slide、`1dc1720` extract ExternalSummaryContent、`cfeb71e` 移除冗余 Escape
- **相关 specs**：
  - `docs/superpowers/specs/2026-05-11-art-backgrounds-design.md`
  - `docs/superpowers/specs/2026-05-11-interaction-design.md` 与 `2026-05-11-interaction-deferred.md`
  - `docs/superpowers/specs/2026-05-11-recommend-cards-and-delete-confirm-design.md`
  - `docs/superpowers/specs/2026-05-27-md-renderer-design.md`
  - `docs/superpowers/specs/2026-05-27-report-frontmatter-display-design.md`
  - `docs/superpowers/specs/2026-05-30-study-library-pagination-design.md`
  - `docs/superpowers/specs/2026-05-31-fable-generation-design.md`
  - `docs/superpowers/specs/2026-05-31-fable-style-dialog-design.md`
  - `docs/superpowers/specs/2026-05-31-loading-screen-design.md`
  - `docs/superpowers/specs/2026-06-04-profile-page-redesign-design.md`
  - `docs/superpowers/specs/2026-06-05-extension-page-design.md`
  - `docs/superpowers/specs/2026-06-05-group-guide-button-design.md`
  - `docs/superpowers/specs/2026-06-21-writer-quotes-design.md`
  - `docs/superpowers/specs/2026-06-25-quote-display-refinement-design.md`
  - `docs/superpowers/specs/2026-06-22-diy-terminology-design.md`
  - `docs/superpowers/specs/2026-07-06-external-materials-summary-panel-design.md`
- **Agent 行为偏差**：
  - **过度设计**：gravity field 拖拽、star particles、双版 briefing 主题等视觉/交互复杂度偏高。
  - **边界遗漏**：async rehypeShiki runSync crash、Buffer 错误、z-index / resize 等运行时才发现。
  - **范围蔓延**：terminology、quote、external summary 等功能在实现中不断扩大范围，随后需要专门清理（如 `68bc3e9 remove wildcardInspiration scope creep`）。

### 8. IPC / 状态管理 / Store

- **迭代密度评分**：4 / 10
- **相关 commits 数量**：52（feat 26 / fix 5 / refactor 1 / test 1）
- **主要问题摘要**：提交量不少，但多为随功能扩展而新增 store 字段 / IPC 方法，补丁密度低。主要修复集中在 session persistence 接线、archivePending 状态重命名、external-materials types fixup、null lastUsed 崩溃等。
- **关键 commits**：
  - `b333c32` feat(types): shared IPC + domain types（领域最早提交）
  - `c33d77e` feat(state): atomic JSON write with .bak rollback
  - `3d91d7d` fix(critical): wire up session persistence IPC (C1) + improve fable prompt (I2)
  - `25d97f1` refactor(store): suggestEnd → archivePending with edge detection + dismiss
  - `9c9e55c` fix: crash on PreStudyModal when state.json has null lastUsed
  - `a08d77c` fixup! types: add external-materials doc type and search IPC types
  - `d14a189` fix(config): store .env under ~/.studyparlor in packaged builds
- **相关 specs**：无独立 spec，类型与 store 设计随各功能 spec 同步更新。
- **Agent 行为偏差**：
  - **跨层同步遗漏**：新增 IPC 时 types、preload、facade 经常漏改，需要后续 fixup。
  - **空值/状态边界遗漏**：`null lastUsed` 崩溃、`suggestEnd` 粘性死锁等问题说明状态迁移考虑不周。

## 跨模块共性偏差

1. **边界与空值验证不深入**： briefing 的 X builders 空 tweet、search 的 Tavily/IPC 异常、frontmatter 缺字段、state.json null lastUsed、E2E selector 误用 title 等，都是上线/运行后补洞。
2. **过度设计与协议漂移**：归档触发、简报主题、gravity field、group inspiration 策略切换等反复重做，显示 Agent 倾向于先构建复杂抽象，再收缩。
3. **跨层同步遗漏**：types/preload/store/facade 在新增 IPC 或功能时经常不同步，`fixup!` 与专门 fix 多次出现。
4. **提示词与外部依赖脆弱**：prompt 占位符、结束问句、Kimi 温度/thinking、Tavily、X feed 等随外部行为变化反复补丁。
5. **打包与环境验证滞后**：packaged exe 失败、.env 目录、orphan 进程、userData 隔离等问题集中在 release 前后爆发。

## 建议优先处理的模块

1. **夜航简报 + Anthropic 博客集成**：当前仍有 WIP 分支与未合并工作，spec 已迭代四轮，代码补丁密集，应在合并前补全边界测试（空 feed、source url、打包后 BrowserWindow、图片下载失败）。
2. **Web 搜索 / 外部资料**：补丁密度最高，fixup 与合并冲突多，建议固化类型与 IPC 接口、补单元测试覆盖 Tavily 异常分支、抽象重试逻辑。
3. **LLM / 会话归档**：核心链路，归档触发已两次重设计，建议用状态机替代边缘检测 + phrase 过滤，减少 prompt 与代码的隐式契约。
4. **E2E 测试**：体量最大但脆弱，建议把 `@p1` 用例全面 mock 化，仅保留少量 `@unstable` 真实 API 回归，降低维护成本。
5. **构建 / 开发环境清理**：orphan 进程与 cache 隔离刚 patched，建议增加自动化脚本测试（启动-退出-再启动循环）防止回归。
