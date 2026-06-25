# E2E 自动化调试设计文档

**日期**：2026-06-24  
**范围**：Study Parlor 桌面端（Electron 30 + React 18 + TypeScript）  
**目标**：用 Playwright E2E 覆盖关键用户流程，减少手动「打开应用点一点」的回归成本。  
**关联文档**：`2026-06-05-setup-wizard-design.md`

---

## 1. 目标与非目标

### 1.1 目标

- 用自动化脚本替代人工启动应用后的核心流程验证。
- 覆盖启动链路、LLM 对话链路、归档/复习写库链路。
- 为后续 Agent / CDP / MCP 探索层提供「正常流程」基线。

### 1.2 非目标

- 不替换现有 Vitest 单元测试；E2E 是补充而非替代。
- 不进 CI/GitHub Actions；本次只支持本地运行。
- 不 mock Kimi API；测试调用真实 API，接受相应的时间与成本。
- 不做视觉回归测试（VLM 截图判断属于后续 Agent 层）。

---

## 2. 架构总览

```
┌──────────────────────────────────────────────────────────────┐
│  现有 Vitest 单元测试（tests/）                                │
│  - 深、快、不启动 Electron                                     │
└──────────────────────────────────────────────────────────────┘
                              ↕ 互补
┌──────────────────────────────────────────────────────────────┐
│  Playwright E2E 测试（e2e/）                                  │
│  - 广、慢、启动真实 Electron + 走完整 IPC + 调 Kimi API        │
└──────────────────────────────────────────────────────────────┘
                              ↓ 提供基线
┌──────────────────────────────────────────────────────────────┐
│  未来：Agent / CDP / MCP 探索层                               │
│  - 在 E2E 失败或未知 bug 时做视觉/交互探索                      │
└──────────────────────────────────────────────────────────────┘
```

### 2.1 目录结构

```
study-parlor/
├── e2e/
│   ├── fixtures/
│   │   └── electron.ts          # 自定义 Playwright fixture
│   ├── pages/
│   │   ├── HomePage.ts          # 首页页面对象
│   │   ├── PreStudyPage.ts      # PreStudy 弹窗页面对象
│   │   └── StudyPage.ts         # Study 页页面对象
│   ├── helpers/
│   │   ├── test-library.ts      # 测试学习库创建/清理/seed
│   │   └── selectors.ts         # data-testid 常量
│   ├── specs/
│   │   ├── smoke.spec.ts
│   │   ├── new-topic-progress.spec.ts
│   │   ├── continue-topic.spec.ts
│   │   └── review-topic.spec.ts
│   ├── playwright.config.ts
│   └── README.md
├── tests/                       # 现有 Vitest 测试，不变
├── electron/main.ts             # 最小改动见第 5 节
└── package.json                 # 新增 test:e2e 脚本
```

### 2.2 是否进 GitHub

- Playwright 测试代码、配置、页面对象**进仓库**。
- 测试产物（截图、视频、trace、临时测试库）**进 `.gitignore`**。
- API key 不进仓库，继续使用 `.env`。
- `.gitignore` 追加：
  - `e2e-results/`
  - `e2e/.test-library/`
  - `test-results/`
  - `playwright-report/`
  - `*.trace.zip`

---

## 3. 测试环境隔离

### 3.1 核心原则

每个测试用例从干净的临时学习库启动，测试结束后清理。真实学习库 `C:\Users\...\Desktop\学习库` 不受任何影响。

### 3.2 实现方式

1. `e2e/helpers/test-library.ts` 在每次测试前创建：
   - `e2e/.test-library/<uuid>/`：临时学习库，按真实库结构生成主题目录。
   - `e2e/.test-config/<uuid>/`：临时配置目录，复制项目根目录 `.env`，隔离 `state.json`。
2. 自定义 fixture 通过环境变量注入 Electron：
   - `E2E_STUDY_LIBRARY_PATH`：覆盖学习库路径。
   - `E2E_CONFIG_DIR`：覆盖配置目录（`.env` + `state.json`）。
3. `electron/main.ts` 在读取 `.env` 前优先使用 `E2E_CONFIG_DIR`，并在 bootstrap 中用 `E2E_STUDY_LIBRARY_PATH` 覆盖 `STUDY_LIBRARY_PATH`。
4. 测试结束后关闭 Electron，删除临时目录；失败时保留现场。

### 3.3 主进程适配

```ts
// electron/main.ts
if (process.env.E2E_CONFIG_DIR) {
  setConfigDir(process.env.E2E_CONFIG_DIR)
}

async function bootstrap() {
  if (process.env.E2E_STUDY_LIBRARY_PATH) {
    process.env.STUDY_LIBRARY_PATH = process.env.E2E_STUDY_LIBRARY_PATH
  }
  // ...
}
```

该覆盖只在 dev/test 环境生效，生产包忽略。

---

## 4. Fixture 与页面对象

### 4.1 自定义 fixture

`e2e/fixtures/electron.ts` 提供：

- `electronProcess`：已启动的 Electron 子进程及其 CDP WebSocket URL。
- `window`：通过 CDP 连接到的应用渲染页 `Page`。
- `testLibraryPath`：当前测试使用的临时学习库路径。
- `testConfigDir`：当前测试使用的临时配置目录路径。

**为什么用 CDP 而不是 `_electron.launch()`**：当前运行环境带有 `ELECTRON_RUN_AS_NODE=1`，会导致 Playwright 的 `_electron.launch()` 把 Electron 当作 Node 启动，`electron.app` 无法初始化。fixture 改为手动 `spawn` Electron，传 `--remote-debugging-port=0`，解析 stderr 中的 `DevTools listening on ...` 获得动态端口，再用 `chromium.connectOverCDP()` 连接。

示例骨架：

```ts
import { test as base, chromium } from '@playwright/test'
import { spawn } from 'node:child_process'
import path from 'node:path'
import { createTestLibrary, cleanupTestLibrary } from '../helpers/test-library'

export const test = base.extend({
  testLibraryPath: async ({}, use) => {
    const dir = createTestLibrary()
    await use(dir)
  },

  electronProcess: async ({ testLibraryPath, testConfigDir }, use) => {
    const env = { ...process.env }
    delete env.ELECTRON_RUN_AS_NODE

    const proc = spawn(
      path.join(process.cwd(), 'node_modules', 'electron', 'dist', 'electron.exe'),
      ['--remote-debugging-port=0', '.'],
      {
        cwd: process.cwd(),
        env: {
          ...env,
          NODE_ENV: 'test',
          E2E_CONFIG_DIR: testConfigDir,
          E2E_STUDY_LIBRARY_PATH: testLibraryPath,
        },
      }
    )

    // 等待 stderr 输出 DevTools listening URL，并轮询端口就绪
    const cdpUrl = await waitForCdpUrl(proc, 60000)
    await waitForCdpPort(cdpUrl, 10000)

    await use({ process: proc, cdpUrl })
    proc.kill()
    await cleanupTestLibrary(testLibraryPath)
  },

  window: async ({ electronProcess }, use) => {
    const browser = await chromium.connectOverCDP(electronProcess.cdpUrl)
    const context = browser.contexts()[0]
    const page = context.pages().find(p => p.url() !== 'about:blank')
    await use(page)
    await browser.close()
  },
})
```

### 4.2 页面对象

每个核心页面封装操作与断言：

| 文件 | 职责 |
|------|------|
| `CoverPage.ts` | 进入应用：输入名字或点击「点亮灯火」 |
| `HomePage.ts` | 等待首页加载、点击新主题、获取主题卡片、继续主题、进入复习 |
| `PreStudyPage.ts` | 填写主题、确认模式、点击开始 |
| `StudyPage.ts` | 等待 LLM 消息、发送消息、点击归档、关闭归档报告 |

### 4.3 UI 侧配合

在以下组件的关键元素上增加 `data-testid`：

- `Cover.tsx`：`cover-name-input`、`cover-enter-button`、`cover-light-button`
- `Home.tsx`：`home-greeting`、`new-topic-button`、`topic-card`、`topic-continue-button`、`session-review-button`
- `PreStudyModal.tsx`：`prestudy-modal`、`topic-input`、`topic-source-new`、`topic-source-existing`、`start-button`、`cancel-button`
- `Study.tsx`：`study-page`、`message-list`、`chat-input`、`send-button`、`archive-button`、`archive-pending-banner`
- `ArchiveReportModal.tsx`：`archive-report-close`
- `ChatInput.tsx`：`chat-input`、`send-button`
- `ChatBubble.tsx`：`user-message`、`assistant-message`

只加属性，不改样式和文案。

---

## 5. 主进程改动

### 5.1 测试库路径覆盖

见 3.3。

### 5.2 `remote-debugging-port`

CDP fixture 需要可连接的调试端口。启动参数传 `--remote-debugging-port=0` 让 Electron 自动分配端口；fixture 从 stderr 解析 `DevTools listening on ws://127.0.0.1:<port>/...` 后连接。

`electron/main.ts` 中仍保留运行时开关作为兜底：

```ts
if (process.env.NODE_ENV === 'test' || isDev) {
  app.commandLine.appendSwitch('remote-debugging-port', '9222')
}
```

---

## 6. 测试流程

### 6.1 `smoke.spec.ts` — 启动冒烟

- 启动应用，Cover 页输入名字或点击「点亮灯火」进入 Home。
- 断言：`home-greeting` 存在、学习库按钮存在、无崩溃弹窗。
- 超时：30 秒。
- 标记：`@smoke`

### 6.2 `new-topic-progress.spec.ts` — 新主题探索并归档

前置：测试库为空。

1. Cover → Home。
2. 首页点击「新的小径」。
3. PreStudy 输入主题「TypeScript 装饰器」。
4. 选择「探索新知」模式，点击开始。
5. Study 页等待 Kimi 返回第一条消息。
6. 用户发送一条回复。
7. 测试强制 surfaced 归档 banner（LLM 文案不可预测），点击归档。
8. 关闭归档报告弹窗，返回 Home。
9. 断言：临时学习库里出现新 `.md` 文件，frontmatter 主题正确。

超时：300 秒，重试 1 次，标记 `@slow`。

### 6.3 `continue-topic.spec.ts` — 继续已有主题

前置：测试库已 seed `typescript-decorators` 主题目录。

1. Cover → Home。
2. 首页出现主题卡片，点击「续谈（第2次）」。
3. PreStudy 直接点击开始。
4. Study 页等待 Kimi 返回。
5. 用户发送一条消息。
6. 断言：会话正常继续，无报错。

超时：300 秒，重试 1 次，标记 `@slow`。

### 6.4 `review-topic.spec.ts` — 复习检测

前置：测试库已 seed 可复习的 `typescript-decorators/s2/学习报告.md`。

1. Cover → Home。
2. 展开主题卡片，点击会话上的「复习」。
3. ReviewFlash 自动进入 PreStudy 复习模式。
4. 点击开始。
5. Study 页 Kimi 提问。
6. 用户回答。
7. 测试强制 surfaced 归档 banner，点击归档。
8. 关闭归档报告弹窗，返回 Home。
9. 断言：同目录下生成或追加 `复习报告.md`，包含「复习摘要」等内容。

超时：300 秒，重试 1 次，标记 `@slow`。

### 6.5 不可预测 LLM 文案的处理

归档 banner 的触发条件是 LLM 在 assistant 消息中出现「需要存档吗？」，无法稳定复现。为保证测试确定性，在至少一轮对话完成后、streaming 结束时，测试通过 `window.useStore` 直接设置 `session.archivePending = true`，再点击归档按钮。`window.useStore` 仅在 renderer 中暴露，用于 E2E 自动化。

### 7.1 新增依赖

```json
{
  "devDependencies": {
    "@playwright/test": "^1.45.0"
  }
}
```

安装后执行：

```bash
npx playwright install chromium
```

### 7.2 新增脚本

```json
{
  "scripts": {
    "test:e2e": "playwright test --config e2e/playwright.config.ts",
    "test:e2e:smoke": "playwright test --config e2e/playwright.config.ts --grep @smoke",
    "test:e2e:debug": "playwright test --config e2e/playwright.config.ts --headed --trace on"
  }
}
```

### 7.3 运行方式

```bash
npm run test:e2e              # 全部 E2E
npm run test:e2e:smoke        # 只跑 smoke
npm run test:e2e:debug        #  headed 模式 + trace
npx playwright test --grep-invert @slow   # 跳过慢用例
```

---

## 8. 测试数据工厂

`e2e/helpers/test-library.ts` 提供：

- `createTestLibrary()`：创建临时学习库目录。
- `cleanupTestLibrary(path)`：清理临时学习库。
- `createTestConfigDir()`：创建临时配置目录，并复制 `.env`。
- `cleanupTestConfigDir(path)`：清理临时配置目录。
- `seedNewTopic(libPath, slug, title)`：生成一个可继续的新主题目录（`slug/s1/学习报告.md`）。
- `seedReviewableTopic(libPath, slug, title)`：生成一个可复习的主题目录（`slug/s2/学习报告.md`）。

每个 spec 的 fixture 按场景调用 seed，保证测试数据与测试逻辑分离。

---

## 9. 失败排查与可观测性

### 9.1 截图与 trace

`playwright.config.ts` 配置：

```ts
export default defineConfig({
  screenshot: 'only-on-failure',
  trace: 'retain-on-failure',
  video: 'retain-on-failure',
})
```

### 9.2 回放 trace

```bash
npx playwright show-trace e2e-results/trace.zip
```

Trace 包含 DOM 快照、操作序列、console 日志、网络请求，可像录像一样回放。

### 9.3 现场保留

测试失败时，临时学习库不删除，路径打印到控制台，方便人工检查生成的 `.md` 文件。

### 9.4 日志捕获

Renderer 进程的 `console.log` / `console.error` 通过 Playwright trace 捕获。主进程日志写入 Electron 子进程的 stderr；调试时可在 fixture 中临时监听 `proc.stderr` 输出。

---

## 10. 配置与 secrets

- E2E 测试使用项目 `.env` 中的 `KIMI_API_KEY`。
- 不单独配置 CI secrets；本地运行即取本地环境变量。
- 如后续进 CI，需改用专用 key 并通过 GitHub Secrets 注入。

---

## 11. 风险与依赖

| 风险 | 影响 | 缓解 |
|------|------|------|
| Kimi API 不稳定或慢 | 测试超时/抖动 | 慢用例超时 300 秒，retries=1，标记 `@slow`；probe model 加 10s 超时 |
| LLM 返回不可预测 | 断言困难 | 只断言 UI 状态和文件系统结果，不断言 LLM 文案；归档 banner 由测试确定性触发 |
| Electron 30+ 在 `ELECTRON_RUN_AS_NODE=1` 下无法启动 | E2E 无法启动 | 用 `spawn` + `--remote-debugging-port=0` + CDP 连接替代 `_electron.launch()` |
| 测试库 / 配置隔离失效 | 污染真实学习库或 state | fixture 强制使用临时目录，主进程优先读 `E2E_STUDY_LIBRARY_PATH` 和 `E2E_CONFIG_DIR` |
| `data-testid` 遗漏 | 定位不稳定 | 按页面对象清单逐项检查 |

---

## 12. 实现里程碑

1. **基础设施**：安装 Playwright、新增 `e2e/` 目录与配置。
2. **主进程改动**：测试库路径覆盖 + 配置目录隔离 + `remote-debugging-port` 预留。
3. **UI 加 `data-testid`**：Cover / Home / PreStudy / Study / ArchiveReportModal 核心元素。
4. **Fixture + 页面对象**：CDP-based fixture、`CoverPage`、`HomePage`、`PreStudyPage`、`StudyPage`。
5. **测试数据工厂**：创建/清理/seed 临时学习库和临时配置目录。
6. **第一个 smoke 测试**：启动 → Cover → Home 渲染成功。
7. **三个核心流程测试**：新主题、继续主题、复习主题。
8. **文档**：`e2e/README.md` + 本 spec 同步更新。
8. **文档**：`e2e/README.md` + 本 spec。

---

## 13. 后续可扩展

- CI 集成：GitHub Actions + headless 模式 + 专用 API key。
- Agent 探索层：通过 `remote-debugging-port` 连接 CDP skill，做视觉/自由探索。
- 更多流程：从 spec 文件继续翻译（搜索、简报、扩展页等）。
