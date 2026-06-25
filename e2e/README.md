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

## 测试隔离

每个测试用例都会创建独立的临时学习库（`e2e/.test-library/`）和临时配置目录（`e2e/.test-config/`）。测试结束后自动清理；测试失败时会保留现场，路径会打印到控制台。

真实学习库和 `~/.studyparlor/state.json` 不会被污染。

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
│   ├── smoke.spec.ts
│   ├── new-topic-progress.spec.ts
│   ├── continue-topic.spec.ts
│   └── review-topic.spec.ts
└── playwright.config.ts
```

## 为什么用 CDP 而不是 `_electron.launch()`

当前运行环境带有 `ELECTRON_RUN_AS_NODE=1`，会导致 Playwright 的 `_electron.launch()` 把 Electron 当作 Node 启动，无法正确初始化 `electron.app`。因此 fixture 采用手动 `spawn` + `--remote-debugging-port=0` + `chromium.connectOverCDP()` 的方式连接渲染进程。

## 调试

失败时会在 `e2e-results/` 保留截图、视频和 trace：

```bash
npx playwright show-trace e2e-results/<trace-file>.zip
```

## 标记

- `@smoke`：启动冒烟测试，快且不调用 LLM
- `@slow`：调用真实 Kimi API，每个用例可能耗时 10 秒到 2 分钟
