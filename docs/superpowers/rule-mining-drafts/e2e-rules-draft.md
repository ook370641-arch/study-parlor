# Study Parlor E2E 规则候选（规则提炼）

> 来源范围：docs/superpowers/specs/2026-06-24/27、2026-07-02 三份 E2E 设计文档；git log 中所有 e2e/fixtures、e2e/helpers、e2e/pages、e2e/specs、scripts/lib/process-cleanup.js、electron/main.ts 相关提交；以及当前代码。

---

### 1. 必须用可显式关闭的 mock 作为默认链路，并保留真实 API 链路作回归

- **抽象偏差**：验证缺口 / 非黑即白的测试策略
- **本项目表现**：
  - 初版 spec（06-24）宣称"不 mock Kimi API"，06-27 规范进一步要求"全部真实 LLM 调用"并写入 `e2e/README.md`。
  - 随着覆盖扩张，大量 LLM 路径（`finalizeProgress`、`generateFable`、`generateContinueSuggestions`、`wildcardInspiration`）在 `electron/ipc/llm.ts` 的 `NODE_ENV==='test'` 分支返回固定 mock；简报也在 `electron/ipc/briefing.ts` 中加入 `E2E_CONFIG_DIR && E2E_BRIEFING_DISABLE_MOCK !== '1'` 的 mock 分支。
  - 当前 `test:e2e:core` 跑的是 mock 链路；真实链路被拆到 `briefing-real-api.spec.ts`、`external-materials-real-api.spec.ts` 等 `@real` 用例，需要显式 `E2E_BRIEFING_DISABLE_MOCK=1` 才能命中真实路径。
- **必须这样做**：
  - 对依赖外部网络/LLM 的功能，默认用确定性 mock 或 seed 覆盖 `@p1` 用例。
  - 每个外部依赖至少要有一条可独立运行的 `@real` / `@unstable` 用例，且通过 fixture 级环境变量（如 `E2E_BRIEFING_DISABLE_MOCK=1`）能关闭 mock。
  - 在应用代码中，mock 分支必须同时满足 `NODE_ENV==='test'` 与 E2E 隔离标记（如 `E2E_CONFIG_DIR`），避免单元测试误走 mock。
- **常见错误**：
  - 把"真实 API"当成 E2E 的绝对政治正确，导致慢、flaky、CI 不可用。
  - 只写 mock 用例，从不验证真实链路；一旦 API 契约变化，mock 仍绿但生产挂。
  - mock 开关全局硬编码，无法单独跑真实链路。
- **来源**：
  - spec:`docs/superpowers/specs/2026-06-24-e2e-automation-design.md` §2.2/§6.5
  - spec:`docs/superpowers/specs/2026-06-27-e2e-full-coverage-design.md` §2.1/§5.2/§9
  - spec:`docs/superpowers/specs/2026-07-02-e2e-coverage-expansion-design.md` §2/§3/§7.4
  - commit:`4fe3aa9`、commit:`4b65737`、commit:`0dc18f9`

---

### 2. E2E 文档必须随实现同步刷新，禁止 README 与代码长期不一致

- **抽象偏差**：文档漂移（documentation drift）
- **本项目表现**：
  - `e2e/README.md` 仍只列出 4 个 spec、4 个 page object，宣称"不 mock LLM"；而实际已有 30+ spec、11 个 page object，且大量功能走 `NODE_ENV=test` mock。
  - 标签体系早已从 `@smoke/@slow` 扩展为 `@p0/@p1/@p2/@slow/@unstable/@real`，README 未反映。
- **必须这样做**：
  - 每次变更 E2E 架构（标签语义、mock 策略、目录结构、运行命令）时同步更新 `e2e/README.md`。
  - 将 README 中的"策略声明"与"目录清单"视为验收标准的一部分，PR 合并前检查。
- **常见错误**：
  - 认为"代码即文档"，忽略 E2E 套件对后续维护者的指引作用。
  - 只写 design doc，不更新执行层面的 README，导致新人按 README 运行得到错误命令集。
- **来源**：
  - spec:`docs/superpowers/specs/2026-06-27-e2e-full-coverage-design.md` §2.1（"该决策写入 e2e/README.md"）
  - 当前 `e2e/README.md` 与 `e2e/specs/`、`e2e/pages/` 实际内容对比

---

### 3. 隔离必须覆盖所有持久化表面，不能只隔离学习库路径

- **抽象偏差**：对真实环境理解不足 / 隔离盲点
- **本项目表现**：
  - 初始 fixture 只注入 `E2E_STUDY_LIBRARY_PATH`，后来发现 `state.json`、`.env` 会污染真实用户状态，于是增加 `E2E_CONFIG_DIR`。
  - 再后来发现 Electron 强制杀进程后，共享的 `%APPDATA%/study-parlor/` 缓存处于不一致状态，导致下一次 `npm run dev` 启动极慢，于是又通过 `app.setPath('userData', ...)` / `app.setPath('cache', ...)` 把 cache 也重定向到 `E2E_CONFIG_DIR`。
  - 最新版把 dev 模式缓存也隔离到 `node_modules/.electron-cache/`，避免 Vite watcher 监听锁定的 Code Cache。
- **必须这样做**：
  - 列出应用所有可能写入的持久化表面：学习库、配置目录、state.json、.env、userData、cache、logs、recovery、临时下载。
  - fixture 中每个表面都要有环境变量或启动参数覆盖，并确保清理时能删除或 age-out。
- **常见错误**：
  - 只改数据目录，忘了 Electron 默认 userData/cache 仍落在用户目录。
  - 以为"测试库独立"就够了，结果 state.json 把测试 profile 写进真实用户目录。
- **来源**：
  - spec:`docs/superpowers/specs/2026-06-24-e2e-automation-design.md` §3.2
  - commit:`82aff72`（加入 `E2E_CONFIG_DIR`）
  - commit:`d066e71`
  - commit:`4a18d32`
  - current:`electron/lib/app-paths.ts`

---

### 4. 进程清理必须是 fixture 的一等公民，不能仅靠 `proc.kill()`

- **抽象偏差**：cleanup 遗漏 / 把清理当善后
- **本项目表现**：
  - 早期 fixture 用 `_electron.launch()` 的 `app.close()`，后来改 `spawn` 后仅 `proc.kill()`，在 Windows 上 Electron 的 GPU/renderer 进程残留。
  - 逐步演进为：`taskkill /F /T` 杀进程树、`waitForProcessExit` 等待句柄释放、`killProjectProcessesByPattern` 按测试配置目录精确清理残留、`retryRm` 重试删除、`removeAsMuchAsPossible` 部分清理、最终把锁定目录重命名为 `.stale-` 由 age-out 清理。
  - 当前 `cleanupTestConfigDir` 在删除前会先杀一次进程，删除中每 25 次重试再杀一次。
- **必须这样做**：
  - fixture 的 teardown 顺序固定为：关闭 browser context → 杀主进程树 → 等待子进程退出 → 按特征模式清残留 → 删除临时目录。
  - 删除目录必须带重试和降级（rename stale），不能因为 Windows 文件锁导致测试套件失败。
  - 失败时保留现场，成功时确保临时目录不存在。
- **常见错误**：
  - 认为 `process.kill()` 或 `app.close()` 能干净退出 Electron on Windows。
  - teardown 抛异常时把原始测试失败掩盖。
  - 删除失败直接 throw，导致后续所有用例因残留目录/进程更不稳定。
- **来源**：
  - commit:`0fd672c`（初始 fixture）
  - commit:`461b5b2`（swallow cleanup errors）
  - commit:`d066e71`
  - commit:`afb4f07`（age out old test dirs）
  - commit:`4a18d32`

---

### 5. 进程枚举/杀死的工具必须自带单元测试，且避免 shell 输出脆弱解析

- **抽象偏差**：对真实环境理解不足 / 过度相信命令行输出格式
- **本项目表现**：
  - `scripts/lib/process-cleanup.js` 最初用 `wmic ... /format:csv` 并按逗号 split；当命令行本身含引号和逗号时，CSV 列错位，导致 PID 解析错误、杀错进程或漏杀。
  - 修复后改为 PowerShell `Get-CimInstance ... | ConvertTo-Json -Compress`，并新增 `killProjectProcessesByPattern`。
  - 该模块已被 `tests/process-cleanup.test.ts` 覆盖。
- **必须这样做**：
  - 所有进程/端口枚举工具都要有单元测试，覆盖单进程、多进程、空结果、异常输出。
  - Windows 优先用结构化输出（PowerShell JSON / CIM）而非 CSV/text；如需解析文本，必须按字段语义解析而非简单 split。
  - 杀进程前按 `projectRoot` + 可选 `pattern` 双重过滤，避免误杀其他项目。
- **常见错误**：
  - 直接 copy 网上的 `taskkill /F /IM electron.exe` 脚本，误杀全局 Electron 实例。
  - 用 `split(',')` 解析 WMIC CSV。
  - 不在 CI 中跑 process-cleanup 的单元测试。
- **来源**：
  - commit:`31b2bea`（extract shared process/port cleanup）
  - commit:`4a18d32`
  - current:`tests/process-cleanup.test.ts`

---

### 6. 选择器必须基于稳定身份（如 slug/dirName），不能基于展示文案或 frontmatter title

- **抽象偏差**：验证缺口 / 对 UI 数据模型理解不足
- **本项目表现**：
  - 早期 diagram/fable/library 测试用 frontmatter `title` 定位 topic card；当标题含特殊字符、被截断或与目录名不一致时，定位失败。
  - 修复提交 `8e81ee7` 将选择器统一改为 `dirName`（slug）。
  - 同时 `SELECTORS` 集中管理，新增功能必须先补 `data-testid`，禁止硬编码文案。
- **必须这样做**：
  - 所有可交互元素加 `data-testid`；POM 只读 `SELECTORS` 常量。
  - 列表/卡片定位优先用稳定标识符（文件系统 slug、ID）而非显示文本。
  - 若必须用文本，应使用正则或 partial match，并注明为何无法使用 testid。
- **常见错误**：
  - 用文案 `"续谈（第2次）"` 定位按钮，文案一变测试就挂。
  - 用 frontmatter title 作为 DOM 查找 key，忽略 title 与目录名的映射关系。
  - 在组件里新增交互点但忘记补 `data-testid`，然后测试里用 XPath 或 CSS 类硬编码。
- **来源**：
  - spec:`docs/superpowers/specs/2026-06-27-e2e-full-coverage-design.md` §7
  - commit:`8e81ee7`
  - current:`e2e/helpers/selectors.ts`

---

### 7. Seed 工厂必须与应用状态 schema 保持同步，BASE_STATE 一漂移就会产生幽灵失败

- **抽象偏差**：对真实环境理解不足 / 测试数据与应用代码不同步
- **本项目表现**：
  - `e2e/helpers/test-library.ts` 维护一份 `BASE_STATE`，用于 `seedStateJson` 写入 `state.json`。
  - 当应用 store 新增字段（如 `briefingSource`、`anthropicBlogCache`、`terminology`）时，若 BASE_STATE 未同步，seed 出的状态在启动后会被应用默认值覆盖或触发校验失败。
  - commit `4a18d32` 刚把 `briefingSource` 与 `anthropicBlogCache` 补进 BASE_STATE。
- **必须这样做**：
  - 将 `BASE_STATE` 与渲染进程 `src/store/index.ts` 的初始状态建立一一对应关系；每次 store schema 变更时同步更新 BASE_STATE。
  - 在 seed 函数中对读取失败的 `state.json` 抛明确错误，而不是静默回退。
  - 对新增状态字段，优先提供独立 seed 函数（如 `seedTerminology`、`seedWildCardInspiration`）而非让测试直接手写 state。
- **常见错误**：
  - seed 出的 state 缺少新字段，测试通过但行为与真实用户不同。
  - 在 BASE_STATE 里用旧字段名，导致 seed 后启动时覆盖/丢失数据。
  - 测试直接写原始 state.json，不经过工厂， schema 变化后批量失败。
- **来源**：
  - current:`e2e/helpers/test-library.ts`（BASE_STATE 与 seed 函数）
  - commit:`4a18d32`
  - commit:`fbc153d`（修复 `seedWildCardInspiration` key 与 store 不一致）

---

### 8. Page Object 必须封装等待与时序，不能只是 locator 集合

- **抽象偏差**：过度工程（空壳 POM）/ 验证缺口
- **本项目表现**：
  - `StudyPage` 提供了 `waitForAssistantContent`、`waitForHistoryLength`、`waitForStreamError`、`closeArchiveReport` 等带超时和重试的方法。
  - 但部分 POM 仍只暴露 locator（如早期 `HomePage` 只是若干 `page.locator` 的集合），导致 spec 里重复写 `waitFor`。
  - 对不可预测的 LLM streaming，把"等待历史长度 >= N 且不再 streaming"的逻辑封装进 POM，避免每个 spec 重复实现。
- **必须这样做**：
  - POM 方法名应表达用户意图：`waitForLoaded()`、`sendMessage(...)`、`archive()`、`dismissStreamError()`。
  - 每个意图方法内部统一处理超时、重试、状态转换；spec 只串意图。
  - 对异步 streaming 结果，优先等待"数据/状态条件"而非固定 sleep。
- **常见错误**：
  - POM 只有 `get fooLocator()`，spec 里到处是 `await page.locator(...).waitFor(...)`。
  - 用 `await page.waitForTimeout(3000)` 等 LLM 响应，导致 flaky。
  - 把应用内部 store 操作（如 `window.useStore.setState`）直接写在 spec 里，而不是封装到 POM 的 `forceArchivePending()` 之类方法中。
- **来源**：
  - spec:`docs/superpowers/specs/2026-06-24-e2e-automation-design.md` §4.2
  - current:`e2e/pages/StudyPage.ts`
  - current:`e2e/specs/new-topic-progress.spec.ts`

---

### 9. 测试应用内部状态应通过 renderer 暴露的有限 API，并说明用途与风险

- **抽象偏差**：验证缺口 / 对测试可观测性边界理解不足
- **本项目表现**：
  - 由于 LLM 文案不可预测，E2E 通过 `window.useStore` 直接读取/修改 Zustand store，以确定性地触发 `archivePending`。
  - 06-24 spec 明确把这视为"仅在 renderer 中暴露，用于 E2E 自动化"的受控后门。
  - 当前 `StudyPage` 已将其封装为 `forceArchivePending()`，但底层仍是直接 store 操作。
- **必须这样做**：
  - 尽量减少直接操作 store；优先通过 UI 交互驱动状态变化。
  - 若必须使用，必须：1) 封装到 POM；2) 在代码/文档中标注"E2E only"；3) 只读/写最小状态切片；4) 不绕过业务校验。
  - 每个 store 后门都要有对应的真实路径 spec 验证相同结果可通过 UI 达成。
- **常见错误**：
  - 把大量业务逻辑通过 `window.evaluate` 走捷径，测的不是用户路径。
  - 在 production 代码里为测试开后门却不加注释，导致安全/维护风险。
  - 用 store 后门替代了对真实 LLM streaming 结束条件的等待。
- **来源**：
  - spec:`docs/superpowers/specs/2026-06-24-e2e-automation-design.md` §6.5
  - current:`src/store/index.ts`（`window.useStore` 暴露）
  - current:`e2e/pages/StudyPage.ts` `forceArchivePending()`

---

### 10. 对库/列表类测试，seed 后必须显式触发应用刷新或等待数据加载

- **抽象偏差**：对 Electron/前端数据生命周期理解不足
- **本项目表现**：
  - commit `638b3f7` 修复了 briefing/diagram/fable/library 测试：seed 文件后需要 `window.reload()` 或等待首页重新扫描学习库，否则应用仍显示旧状态。
  - 早期测试假设"文件系统写入后首页自动反映"，忽略了应用启动时一次性扫描 + 内存缓存的模型。
- **必须这样做**：
  - 对基于文件系统的 seed，在 seed 后要么刷新页面，要么通过 UI 操作触发重新扫描，要么等待轮询/缓存失效。
  - 在 POM 中提供 `waitForLibraryLoaded()` 或 `reloadAndWait()` 方法，强制测试显式处理时序。
- **常见错误**：
  - seed 完立刻断言 DOM，失败时误以为是选择器问题。
  - 在测试里用 `fs.writeFileSync` 直接造数据，却不理解应用何时读取这些数据。
  - 把 seed 逻辑和页面加载顺序写反。
- **来源**：
  - commit:`638b3f7`
  - current:`e2e/specs/briefing-generation.spec.ts`、`e2e/specs/library-drag-and-delete.spec.ts`

---

### 11. 开发环境清理与 E2E 清理必须共享同一套 utilities，禁止各自实现

- **抽象偏差**：重复造轮子 / cleanup 遗漏
- **本项目表现**：
  - `scripts/lib/process-cleanup.js` 最初只为 `scripts/dev.js` 服务；E2E 后续也依赖它，并将其 re-export 到 `e2e/helpers/process-cleanup.ts`。
  - 最近 commit `4a18d32` 同时修改了 `scripts/lib/process-cleanup.js` 与 `e2e/fixtures/electron.ts`，说明两者已经统一。
  - `electron/main.ts` 的 `before-quit`、dev cache 隔离、E2E cache 隔离共用 `electron/lib/app-paths.ts` 的解析逻辑。
- **必须这样做**：
  - 所有进程/目录/端口清理逻辑抽到公共模块，被 dev 脚本、E2E fixture、手动清理命令共同引用。
  - 修复清理 bug 时只需改一处，并同时跑 dev 与 E2E 验证。
- **常见错误**：
  - dev 脚本写一套 `taskkill`，E2E fixture 写另一套 `taskkill`，两者行为不一致。
  - E2E 改进了清理逻辑后，dev 脚本的旧逻辑仍留下 orphan 进程。
- **来源**：
  - commit:`31b2bea`（extract shared process/port cleanup utilities）
  - commit:`4a18d32`
  - current:`scripts/lib/process-cleanup.js`、`e2e/helpers/process-cleanup.ts`

---

### 12. 新增功能入 E2E 覆盖前必须先确认：有 spec 来源、有数据工厂、有选择器、有 mock/真实分层

- **抽象偏差**：目标模糊 / 过早实现
- **本项目表现**：
  - 07-02 设计文档强调"对着 spec 写用例"，并为每个功能列出来源 spec、优先级、实现策略、标签。
  - Phase 实施顺序按外部依赖从少到多、风险从低到高安排：A2 术语/A5 意外之径/Extension → A0 简报/A1 外部资料/A1 真实链路 → 分页拖拽 → mock server/边界错误。
  - 当前 anthropic-blog.spec.ts 却没有在现有任何 spec 中找到明确来源，属于设计文档未覆盖的新功能直接进 E2E。
- **必须这样做**：
  - 新增 E2E 用例的验收清单：来源 spec 链接、seed/helper 是否已存在、page object/selector 是否已补齐、走 mock 还是真实链路、标签是什么。
  - 不允许"先写测试再补设计"；若 spec 不存在，先回设计文档。
  - 对 07-02 文档中已 deferred 或未纳入的功能，不强行写用例。
- **常见错误**：
  - 看到新功能就直接写 spec，结果缺少 testid、seed 工厂，反复返工。
  - 把真实外部依赖的用例标成 `@p1`，导致 CI 频繁失败。
  - 用例来源不清，后续 spec 变更时无法判断测试是否仍有效。
- **来源**：
  - spec:`docs/superpowers/specs/2026-07-02-e2e-coverage-expansion-design.md` §2/§3/§8/§9/§12
  - current:`e2e/specs/anthropic-blog.spec.ts`（无对应 design spec）

---

## 摘要

- **文件路径**：`C:\Users\86468\Desktop\project\study-parlor\.claude\rules\.tmp\e2e-rules-draft.md`
- **规则数量**：12 条
- **覆盖领域**：真实 API/真实链路验证、mock 分层策略、fixture 与进程隔离、选择器与 POM 设计、测试数据工厂与 seed、开发环境与 orphan 进程清理、文档同步、设计来源可追溯性。
