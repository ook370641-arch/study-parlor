---
description: "Use when writing or maintaining Playwright E2E tests, fixtures, page objects, selectors, or the e2e/source-map.json mapping."
paths:
  - "e2e/**"
  - "tests/**/*.test.ts"
---

# E2E 规则

## 1. 默认链路用可关闭的 mock，保留真实 API 回归链路

**Why:** 真实外部依赖导致测试慢且 flaky，但只跑 mock 会错过 API 契约变化。

- 对依赖外部网络/LLM 的功能，默认用确定性 mock 或 seed 覆盖 `@p1` 用例。
- 每个外部依赖至少有一条可独立运行的 `@real` / `@unstable` 用例，通过 fixture 级环境变量关闭 mock。
- mock 分支必须同时满足 `NODE_ENV==='test'` 与 E2E 隔离标记，避免单元测试误走 mock。
- Source: e2e.md §1

## 1b. 真实 API 集成测试必须默认运行

**Why:** 真实 API 契约变更在开发时不发现，合并后修复成本成倍增加。

- 真实 API 集成测试（如 `tests/job-briefing-real.test.ts`）默认运行，不设 `skipIf` 条件跳过。
- 耗时极长的测试可通过 `REAL_TEST_REPLAY=1` 用 fixture 零成本回放，避免每次全量调用。
- Source: e2e.md §1b

## 1c. 禁止跳过测试；真实 API 用应用自己的 .env

**Why:** 跳过的测试没有意义——失败被静默掩盖。所谓"跑不了"多数是测试自身的导航/seed bug，不是平台限制。

- 禁止 `test.skip` / `test.fixme` / 条件跳过（含 `test.skip(!process.env.X)`）；测试要么通过，要么修复到通过，要么删除并说明理由。
- 解除已跳过的测试前先调查根因，不要盲目改生产代码迎合测试。
- 真实 API 密钥来源 = 应用自己读取的 `.env`（`createTestConfigDir` 已复制到隔离配置目录），禁止依赖 runner 进程环境变量；密钥缺失/占位符时让测试失败，不许降级为 skip。
- Source: 2026-07-24 三个 skip/fixme 解除修复（fb6fada）

## 2. 文档同步与用例来源可追溯

**Why:** README 与代码不一致会误导维护者；没有 spec 来源的用例会缺 testid/seed/mock 策略，反复返工。

- 变更标签语义、mock 策略、目录结构、运行命令时同步更新 `e2e/README.md`，其策略声明与目录清单视为 PR 验收标准。
- 新增用例前先确认来源清单：来源 spec 链接、seed/helper 是否已存在、page/selector 是否补齐、走 mock 还是真实链路、标签。
- 不允许“先写测试再补设计”；spec 不存在先回设计文档。
- Source: e2e.md §2, §12

## 3. 启动路径必须隔离所有持久化表面并默认静默

**Why:** fixture/startApp 每次冷启动 Electron。漏隔离会污染真实用户数据，漏传静默标记会弹窗抢焦点——两者都是每条启动路径必须统一设置的环境变量，只要一条漏掉就出问题。

- 隔离所有可写表面：学习库、配置目录、state.json、.env、userData、cache、logs、recovery、临时下载；每个表面有环境变量或启动参数覆盖，清理时能删除或 age-out。
- 静默为默认、`E2E_DEBUG_VISIBLE=1` 才可见；**每一条**拉起 Electron 的路径（fixture `e2e/fixtures/electron.ts` + helper `e2e/helpers/app-lifecycle.ts` 的 `startApp`）都要传 `E2E_SILENT`，新增启动 helper 时同步补上。
- 主进程据此建窗：`show: !isE2ESilent`、`skipTaskbar: isE2ESilent`、跳过 maximize。
- Source: e2e.md §3, §13; spec:`docs/superpowers/specs/2026-07-11-silent-e2e-design.md`

## 4. 进程与目录清理必须健壮、共享、可测

**Why:** `proc.kill()` 在 Windows 上无法干净终止 Electron 进程树；脆弱的 shell 输出解析会杀错/漏杀；dev 与 E2E 各写一套会行为不一致、留 orphan 进程。

- teardown 顺序固定：关闭 browser context → 杀主进程树 → 等待子进程退出 → 按特征模式清残留 → 删除临时目录；删除带重试和降级（rename stale），不因 Windows 文件锁使套件失败；失败保留现场、成功确保临时目录不存在。
- 进程枚举优先 PowerShell JSON / CIM 输出再 `JSON.parse`；杀进程前按 `projectRoot` + 可选 `pattern` 双重过滤；所有进程/端口枚举工具都有单元测试。
- 所有进程/目录/端口清理逻辑抽到公共模块，被 dev 脚本、E2E fixture、手动清理命令共享；修一处、同时跑 dev 与 E2E 验证。
- Source: e2e.md §4, §5, §11

## 5. 选择器必须基于稳定身份

**Why:** 展示文案和 frontmatter title 会变化、截断或含特殊字符。

- 所有可交互元素加 `data-testid`；POM 只读集中管理的 `SELECTORS` 常量。
- 列表/卡片定位优先用稳定标识符（slug、dirName、ID）而非显示文本。
- 若必须用文本，使用正则或 partial match 并注明原因。
- Source: e2e.md §6

## 6. Seed 工厂必须与应用状态 schema 保持同步

**Why:** BASE_STATE 缺少新字段会让 seed 出的状态被默认值覆盖，产生幽灵失败。

- 将 `BASE_STATE` 与 `src/store/index.ts` 初始状态建立一一对应关系。
- store schema 变更时同步更新 `BASE_STATE`。
- 对新增字段优先提供独立 seed 函数，不让测试直接手写 state。
- Source: e2e.md §7

## 7. Page Object 必须封装等待与时序

**Why:** 把等待逻辑散落在 spec 里会产生 flaky 测试和重复代码。

- POM 方法名表达用户意图：`waitForLoaded()`、`sendMessage(...)`、`archive()`。
- 每个意图方法内部统一处理超时、重试、状态转换；spec 只串意图。
- 对异步 streaming 结果优先等待数据/状态条件，而非固定 sleep。
- Source: e2e.md §8

## 8. 测试应用内部状态应通过 renderer 暴露的有限 API

**Why:** LLM 文案不可预测时直接操作 store 是合理的，但必须受控。

- 尽量减少直接操作 store；优先通过 UI 交互驱动状态变化。
- 若必须使用，封装到 POM，标注 "E2E only"，只读/写最小切片，不绕过业务校验。
- 每个 store 后门都要有对应的真实路径 spec 验证相同结果可通过 UI 达成。
- Source: e2e.md §9

## 9. 库/列表类测试 seed 后必须显式刷新或等待加载

**Why:** 应用启动时一次性扫描库并缓存，seed 不会自动刷新 UI。

- seed 文件后通过 `window.reload()`、UI 操作触发重新扫描，或等待轮询/缓存失效。
- 在 POM 中提供 `waitForLibraryLoaded()` 或 `reloadAndWait()` 强制处理时序。
- Source: e2e.md §10

## 10. 功能迭代后跑定向 E2E，新建 spec 同步维护 source-map

**Why:** 全量 E2E 67 个 spec 耗时 20+ 分钟；source-map 过期会导致新增 spec 不被 source→group 匹配，但仍会被定向执行（直接变更检测 + 孤儿自动纳入）。

- 代码变更完成后，运行 `node scripts/e2e-changed.js --run` 执行受影响的 spec。
- **新建 E2E spec 或新增页面/组件/IPC 模块时，应同步更新 `e2e/source-map.json`**：在对应 `group` 的 `specs` 中添加新 spec 文件名，或新建 group（若为全新功能域）。直接变更的 spec 文件和孤儿 spec 会自动纳入执行列表，source-map 维护确保后续 source 变更也能触发。
- `startup-health.spec.ts` 始终包含在每次运行中（`always` 列表）。
- `node scripts/e2e-changed.js` 会自动检测未被任何 group 覆盖的孤儿 spec 并输出 WARNING + **自动纳入执行**——遇到此警告应补齐 source-map，但不补齐也不会漏跑。
- CI/合并前仍需全量 `npm run test:e2e`，本规则仅适用于本地开发迭代。
- Source: 2026-07-25 E2E targeting infra

## Example: selector stability

- ❌ `page.locator('text=续谈（第2次）')`
- ✅ `page.locator('[data-testid="continue-topic-button"][data-dir="${slug}"]')`
