# E2E 测试

Study Parlor 的 Playwright E2E 测试套件。

## 运行方式

```bash
# 全部 E2E 测试（包含调用 Kimi API 的慢用例）
npm run test:e2e

# 只跑冒烟测试（不调用 LLM，约 5 秒）
npm run test:e2e:smoke

# headed 模式 + trace，用于本地调试
npm run test:e2e:debug

# 跳过慢用例
npx playwright test --config e2e/playwright.config.ts --grep-invert @slow
```

## 环境要求

- 已安装 Playwright：`npm install`
- 已安装 Chromium：`npx playwright install chromium`
- 项目根目录有有效的 `.env`（`KIMI_API_KEY`、`KIMI_BASE_URL`、`KIMI_MODEL`、`STUDY_LIBRARY_PATH`）
- 已构建 Electron 产物：`npx electron-vite build`

## 静默模式

所有 E2E 测试默认在静默模式下运行：Electron 主窗口不显示、不抢焦点、不注册任务栏。由 fixture 层通过 `E2E_SILENT=1` 环境变量控制，主进程检测后创建 `show: false` + `skipTaskbar: true` 的隐藏窗口。

**排查窗口问题时临时恢复可见：** 在 spec 的 `extraEnv` 中覆盖：

```ts
test.use({ extraEnv: { E2E_SILENT: '0' } })
```

静默模式不影响 CDP 连接、页面渲染或 Playwright 交互——所有测试行为与可见模式一致。

## 测试隔离

每个测试用例都会创建独立的临时学习库（`e2e/.test-library/`）和临时配置目录（`e2e/.test-config/`），并通过 `E2E_CONFIG_DIR` 环境变量同时隔离 `.env` 与 `state.json`。测试结束后自动清理；测试失败时会保留现场，路径会打印到控制台。

真实学习库、`~/.studyparlor/state.json` 以及项目根目录的 `.env` 均不会被污染。

## 目录结构

```
e2e/
├── fixtures/
│   └── electron.ts          # 自定义 Playwright fixture：spawn Electron + CDP 连接
├── helpers/
│   ├── selectors.ts         # data-testid 常量
│   └── test-library.ts      # 临时学习库 / 配置目录工厂
├── pages/
│   ├── CoverPage.ts         # 封面页
│   ├── HomePage.ts          # 首页
│   ├── PreStudyPage.ts      # PreStudy 弹窗
│   └── StudyPage.ts         # Study 页
├── specs/
│   ├── briefing-aesthetics.spec.ts    (来源 spec: docs/superpowers/specs/2026-07-23-briefing-ui-design.md, mock 链路, @p1)
│   ├── briefing-background-generation.spec.ts (来源 spec: docs/superpowers/specs/2026-08-01-briefing-background-generation-design.md, mock 链路, @p1)
│   ├── briefing-rail-layout.spec.ts   (来源 spec: docs/superpowers/specs/2026-07-24-ui-polish-batch-design.md §K, mock 链路, @p2)
│   ├── briefing-source-cards.spec.ts  (来源 spec: docs/superpowers/specs/2026-07-24-ui-polish-batch-design.md §K, mock 链路, @p2)
│   ├── briefing-generation.spec.ts
│   ├── briefing-real-api.spec.ts
│   ├── briefing-real-generation.spec.ts
│   ├── briefing-ux-optimization.spec.ts
│   ├── briefing.spec.ts
│   ├── scout-source.spec.ts          (来源 spec: docs/superpowers/specs/2026-08-02-scout-source-design.md, mock 链路, @p1)
│   ├── writing-list-column.spec.ts    (来源 spec: docs/superpowers/specs/2026-07-24-ui-polish-batch-design.md §K, mock 链路, @p2)
│   ├── smoke.spec.ts
│   ├── new-topic-progress.spec.ts
│   ├── continue-topic.spec.ts
│   ├── review-topic.spec.ts
│   └── …
└── playwright.config.ts
```

## 为什么用 CDP 而不是 `_electron.launch()`

当前运行环境带有 `ELECTRON_RUN_AS_NODE=1`，会导致 Playwright 的 `_electron.launch()` 把 Electron 当作 Node 启动，无法正确初始化 `electron.app`。因此 fixture 采用手动 `spawn` + `--remote-debugging-port=0` + `chromium.connectOverCDP()` 的方式连接渲染进程。

## 启动健康测试（dev-server 路径）

`specs/startup-health.spec.ts` 是唯一不走生产构建的 E2E：直接 spawn `electron-vite dev`，断言 dev 模式特有的启动失败模式（整页 reload、依赖 re-optimization、init 重复）。两个硬约束：

- 不 spawn `scripts/dev.js`、不用 `cleanupProjectOrphans`（按命令行匹配会误杀 Playwright runner）；preflight 只按端口 5173/9222 清理。
- 必须 0 重试（vite deps 缓存自愈会让重试必过，真实回归被误判 flaky）。

排查入口：`docs/superpowers/plans/2026-07-10-fix-dev-hang-and-orphan-processes.md` Task 13。

## 调试

失败时会在 `e2e-results/` 保留截图、视频和 trace：

```bash
npx playwright show-trace e2e-results/<trace-file>.zip
```

## LLM 调用策略

本项目 E2E 测试使用真实 Kimi API 调用，不 mock LLM。
所有涉及 `llm:start` / `llm:finalize*` 的测试必须走真实网络，
以确保验证的是生产环境下的端到端行为。

后续所有新增 API 相关功能也应遵循此策略。

> 注：较新的功能（如 briefing 生成、文章旁注助手 `article-assistant.spec.ts`、
> `article-assistant-controls.spec.ts`）在核心 `@p1` 用例中改用**确定性 mock**，
> 以保证 `test:e2e:core` 稳定。这些 mock 分支同时受 `NODE_ENV==='test'` 与
> `E2E_CONFIG_DIR` 两个条件保护（见 `electron/ipc/article-assistant.ts`、
> `electron/ipc/briefing.ts`），单元测试不会误走 mock。真实链路回归由带 `@real` 的独立用例覆盖。
>
> 旁注 mock 分支会走真实 prompt 装配链（`buildAssistantSystemPrompt` /
> `buildAssistantUserPrompt` / `buildChatBody`）并把最终请求体写入
> `$E2E_CONFIG_DIR/last-assistant-request.json`，供 `article-assistant-controls.spec.ts`
> 做请求级断言（system prompt 内容、thinking 配置、reasoning_effort 等）。
>
> 求职简报的失败路径通过 `seedJobBriefing(libPath, date, '## Error\nJOB_XXX')`
> 注入——主进程命中缓存错误 rethrow 分支（`electron/ipc/job-briefing.ts`），
> 无需关闭 mock 即可确定性覆盖错误 UI/重试链路（见 `job-briefing-error.spec.ts`）。
>
> `anthropic-blog.spec.ts` / `anthropic-blog-ui.spec.ts` 打真实 anthropic.com，已标记 `@real`，不在 core 套件（`@p0|@p1`）内；确定性变体见 `anthropic-blog-image.spec.ts`。

## 标记

- `@smoke`：启动冒烟测试，快且不调用 LLM
- `@slow`：调用真实 Kimi API，每个用例可能耗时 10 秒到 2 分钟
- `@real`：真实 API 回归（Tavily、Kimi、RSS），默认必跑，阻塞发布前验收
- `@p0`：核心路径，每次 CI/本地提交前跑
- `@p1`：重要功能，PR 合并前跑
- `@p2`：边界/慢路径，发布前全量跑

## 定向测试

全量 E2E 耗时较长。日常开发迭代使用定向测试，基于 `git diff` 和 `e2e/source-map.json` 自动选择相关 spec：

```bash
node scripts/e2e-changed.js --run   # 自动选择 + 执行
node scripts/e2e-changed.js          # 仅列出受影响的 spec
```

**映射表维护** (`e2e/source-map.json`)：
- 每个 `group` 包含源文件 glob (`sources`) 和 E2E spec glob (`specs`)
- 变更命中 source pattern → 触发对应 spec
- **新建 spec 或新增模块时应同步更新映射**，以确保后续 source 变更也能触发
- 直接变更的 spec 文件（git diff 中的 `e2e/specs/*.spec.ts`）会自动纳入执行
- 未被任何 group 覆盖的**孤儿 spec** 会自动纳入执行并输出 `WARNING`——遇到此警告应补齐 source-map
- 未匹配任何 group 的源文件变更 → 仅跑 `startup-health.spec.ts`（以及直接变更的 spec/孤儿 spec）
