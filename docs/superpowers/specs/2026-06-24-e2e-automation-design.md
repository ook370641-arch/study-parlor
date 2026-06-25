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

1. `e2e/helpers/test-library.ts` 在每次测试前创建 `e2e/.test-library/<uuid>/`。
2. 自定义 fixture 通过环境变量 `E2E_STUDY_LIBRARY_PATH` 把临时路径注入 Electron。
3. `electron/main.ts` 在读取 `.env` 后优先使用 `E2E_STUDY_LIBRARY_PATH`。
4. 测试结束后关闭 Electron，删除临时目录；失败时保留现场。

### 3.3 主进程适配

```ts
const studyLibraryPath =
  process.env.E2E_STUDY_LIBRARY_PATH || process.env.STUDY_LIBRARY_PATH
```

该覆盖只在 dev/test 环境生效，生产包忽略。

---

## 4. Fixture 与页面对象

### 4.1 自定义 fixture

`e2e/fixtures/electron.ts` 提供：

- `electronApp`：已启动的 Electron 应用实例。
- `window`：第一个 BrowserWindow 的 `Page`。
- `testLibraryPath`：当前测试使用的临时学习库路径。

fixture 负责启动、注入环境变量、清理。

示例骨架：

```ts
// e2e/fixtures/electron.ts
import { test as base } from '@playwright/test'
import { ElectronApplication, Page } from 'playwright-core'
import { createTestLibrary, cleanupTestLibrary } from '../helpers/test-library'

type Fixtures = {
  electronApp: ElectronApplication
  window: Page
}

export const test = base.extend<Fixtures>({
  electronApp: async ({}, use) => {
    const testLib = await createTestLibrary()
    const app = await electron.launch({
      args: ['.'],
      env: {
        ...process.env,
        E2E_STUDY_LIBRARY_PATH: testLib,
        NODE_ENV: 'test',
      },
    })
    await use(app)
    await app.close()
    await cleanupTestLibrary(testLib)
  },
  window: async ({ electronApp }, use) => {
    const page = await electronApp.firstWindow()
    await use(page)
  },
})
```

### 4.2 页面对象

每个核心页面封装操作与断言：

| 文件 | 职责 |
|------|------|
| `HomePage.ts` | 等待首页加载、点击新主题、获取主题卡片、进入复习 |
| `PreStudyPage.ts` | 填写主题、选择模式、调整难度/腔调、点击开始 |
| `StudyPage.ts` | 等待 LLM 消息、发送消息、点击归档、确认归档 |

### 4.3 UI 侧配合

在以下组件的关键元素上增加 `data-testid`：

- `Home.tsx`：`home-greeting`、`new-topic-button`、`topic-card`、`continue-card`
- `PreStudyModal.tsx`：`prestudy-modal`、`topic-input`、`mode-progress`、`mode-review`、`start-button`
- `Study.tsx`：`study-page`、`message-list`、`study-input`、`send-button`、`archive-button`、`confirm-archive-button`

只加属性，不改样式和文案。

---

## 5. 主进程改动

### 5.1 测试库路径覆盖

见 3.3。

### 5.2 `remote-debugging-port` 预留

虽然 Playwright 的 `electron.launch()` 不依赖 CDP 端口，但为后续 Agent/CDP 探索层预留。在 `app` 模块初始化后尽早调用（通常放在 `electron/main.ts` 顶部、任何窗口创建之前）：

```ts
if (process.env.NODE_ENV === 'test' || isDev) {
  app.commandLine.appendSwitch('remote-debugging-port', '9222')
}
```

> Electron 30+ 通过命令行参数 `--remote-debugging-port` 可能失效，代码内设置更稳妥。

---

## 6. 测试流程

### 6.1 `smoke.spec.ts` — 启动冒烟

- 启动应用，等待首页渲染。
- 断言：`home-greeting` 存在、学习库按钮存在、无崩溃弹窗。
- 超时：10 秒。
- 标记：`@smoke`

### 6.2 `new-topic-progress.spec.ts` — 新主题探索并归档

前置：测试库为空。

1. 首页点击「新的小径」。
2. PreStudy 输入主题「TypeScript 装饰器」。
3. 选择「探索新知」模式，点击开始。
4. Study 页等待 Kimi 返回第一条消息。
5. 用户发送一条回复。
6. 点击归档，确认弹窗。
7. 断言：临时学习库里出现新 `.md` 文件，frontmatter 主题正确。

超时：120 秒，重试 1 次，标记 `@slow`。

### 6.3 `continue-topic.spec.ts` — 继续已有主题

前置：测试库已 seed `typescript-decorators.md`。

1. 首页出现继续卡片。
2. 点击「推开下一扇门」。
3. Study 页等待 Kimi 返回。
4. 用户发送一条消息。
5. 断言：会话正常继续，无报错。

超时：120 秒，重试 1 次，标记 `@slow`。

### 6.4 `review-topic.spec.ts` — 复习检测

前置：测试库已 seed 带 `review_count` 的旧 `.md`。

1. 首页选择复习入口。
2. PreStudy 选择「复习检测」。
3. Study 页 Kimi 提问。
4. 用户回答。
5. 结束会话。
6. 断言：原文件末尾追加复习记录，frontmatter 的 `review_count` 增加。

超时：120 秒，重试 1 次，标记 `@slow`。

---

## 7. 依赖与脚本

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
    "test:e2e": "playwright test",
    "test:e2e:smoke": "playwright test --grep @smoke",
    "test:e2e:debug": "playwright test --headed --trace on"
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

- `createTestLibrary()`：创建临时目录。
- `cleanupTestLibrary(path)`：清理目录。
- `seedNewTopic(libPath, slug, frontmatter?)`：生成一个可继续的新主题 `.md`。
- `seedReviewableTopic(libPath, slug)`：生成一个带 `review_count` 的可复习 `.md`。

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

Electron 主进程的 `console.log` / `console.error` 通过 Playwright 捕获，写入测试报告。

---

## 10. 配置与 secrets

- E2E 测试使用项目 `.env` 中的 `KIMI_API_KEY`。
- 不单独配置 CI secrets；本地运行即取本地环境变量。
- 如后续进 CI，需改用专用 key 并通过 GitHub Secrets 注入。

---

## 11. 风险与依赖

| 风险 | 影响 | 缓解 |
|------|------|------|
| Kimi API 不稳定或慢 | 测试超时/抖动 | 超时 120 秒，retries=1，标记 `@slow` |
| LLM 返回不可预测 | 断言困难 | 只断言 UI 状态和文件系统结果，不断言 LLM 文案 |
| Electron 30+ 启动异常 | E2E 无法启动 | 用 `electron.launch()` 官方支持路径 |
| 测试库隔离失效 | 污染真实学习库 | fixture 强制使用临时目录，主进程优先读 `E2E_STUDY_LIBRARY_PATH` |
| `data-testid` 遗漏 | 定位不稳定 | 按页面对象清单逐项检查 |

---

## 12. 实现里程碑

1. **基础设施**：安装 Playwright、新增 `e2e/` 目录与配置。
2. **主进程改动**：测试库路径覆盖 + `remote-debugging-port` 预留。
3. **UI 加 `data-testid`**：Home / PreStudy / Study 核心元素。
4. **Fixture + 页面对象**：`electronApp`、`HomePage`、`PreStudyPage`、`StudyPage`。
5. **测试数据工厂**：创建/清理/seed 临时学习库。
6. **第一个 smoke 测试**：启动 → 首页渲染成功。
7. **三个核心流程测试**：新主题、继续主题、复习主题。
8. **文档**：`e2e/README.md` + 本 spec。

---

## 13. 后续可扩展

- CI 集成：GitHub Actions + headless 模式 + 专用 API key。
- Agent 探索层：通过 `remote-debugging-port` 连接 CDP skill，做视觉/自由探索。
- 更多流程：从 spec 文件继续翻译（搜索、简报、扩展页等）。
