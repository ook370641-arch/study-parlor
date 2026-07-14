# Web 搜索 / 外部资料模块规则候选

> 来源：Study Parlor `docs/superpowers/specs/2026-06-21-web-search-design.md`、`2026-07-06-external-materials-summary-panel-design.md` 及对应实现演进。
> 提炼范围：Tavily 集成、safeStorage 凭证、IPC 重试、外部资料摘要面板、跨层类型同步。

---

## 规则候选 1：外部 API 凭证必须隔离存储，禁止落入主配置或明文文件

- **适用场景**：引入新的第三方 API（搜索、摘要、RAG 等）并需要用户配置 key 时。
- **问题描述**：Agent 倾向于把新 API key 与主 LLM key 放在同一处（如 `.env`、Settings state、明文 JSON），导致凭证泄露面扩大、主配置污染。
- **Agent 行为偏差**：
  - 将 Tavily key 写入 `.env` 或 `AppConfig`。
  - 在 UI state 中长期保留明文 key。
  - 不区分主服务凭证与可选搜索服务凭证。
- **正确做法**：
  - 使用 Electron `safeStorage` 加密后写入独立文件（如 `~/.studyparlor/search-key.enc`）。
  - UI 只保存/覆盖 key，不反显已保存 key（仅显示“已配置”状态）。
  - 提供环境变量 fallback（如 `TAVILY_API_KEY`）用于测试/CI，但不作为推荐路径。
- **验证方式**：
  - 检查 `credentials.ts` 是否调用 `safeStorage.encryptString`。
  - 检查 `.env`、StateJson、`AppConfig` 中是否不出现搜索 key 字段。
  - 检查 Settings 页面是否不读取已保存 key 的原始值。
- **本模块证据**：
  - `electron/lib/credentials.ts` 使用 `safeStorage` 加密 `search-key.enc`。
  - `Settings.tsx` 仅通过 `searchCheckConfig()` 显示“已配置”，不反显 key。
  - `getSearchApiKey()` 优先读取 `process.env.TAVILY_API_KEY`，再读加密文件。

---

## 规则候选 2：跨进程 IPC 接口变更必须同步四层（类型 → Preload → Handler → Facade）

- **适用场景**：新增、删除或修改 `IpcApi` 中的方法时。
- **问题描述**：Agent 在并行开发多个功能时，常在 `src/types/index.ts` 改完类型就结束，导致 `preload.ts` 重复暴露、遗漏暴露，或 `src/lib/ipc.ts` facade 与底层 handler 不一致。
- **Agent 行为偏差**：
  - 只改类型，不改 `preload.ts`/`ipc.ts`。
  - 合并冲突后保留重复或已废弃的方法（如 `readExternalMaterials` 在 preload 中被重复暴露后又被移除）。
  - 渲染进程调用运行时抛 `window.api.xxx is not a function`。
- **正确做法**：
  - 每改一个 `IpcApi` 方法，按顺序检查：
    1. `src/types/index.ts` 类型签名；
    2. `electron/preload.ts` 是否暴露；
    3. `electron/ipc/*.ts` handler 是否注册；
    4. `src/lib/ipc.ts` facade 是否代理。
  - 合并冲突后显式校验 TypeScript 全局类型与运行时暴露的一致性。
- **验证方式**：
  - `npm run build` 通过。
  - 渲染进程调用新 IPC 不抛 `not a function`。
  - 删除 IPC 方法时同步删除 preload/facade/handler 三处引用。
- **本模块证据**：
  - Commit `725bcfe` 专门修复合并冲突：`preload.ts` 中重复/缺失的搜索方法、`types` 中误删的 `readExternalMaterials`。
  - `src/lib/ipc.ts` 与 `electron/preload.ts` 中的 `searchPrepare`/`searchCheckConfig`/`setSearchApiKey`/`readExternalMaterials`/`writeExternalMaterials` 必须一一对应。

---

## 规则候选 3：外部 API 调用必须显式管理超时与 AbortSignal，禁止依赖隐式平台行为

- **适用场景**：任何使用 `fetch` 调用外部 HTTP API 的代码。
- **问题描述**：Agent 常使用 `AbortSignal.timeout(15000)` 或完全不处理超时，导致低版本 Node/ Electron 不兼容，或无法响应用户取消。
- **Agent 行为偏差**：
  - 依赖 `AbortSignal.timeout`（Node 18.17+）。
  - 不处理外部传入的 `AbortSignal`。
  - 超时后未清理 `setTimeout`/事件监听器，造成内存泄漏。
- **正确做法**：
  - 使用 `AbortController` + `setTimeout` 显式控制超时。
  - 支持可选的外部 `signal`，并在触发/取消时正确移除监听器。
  - 在 `finally` 中清理定时器和监听器。
- **验证方式**：
  - 测试用例覆盖外部 signal 触发 abort（如 `tests/search.test.ts` 中 `accepts external abort signal`）。
  - 长时间挂起的 API 调用能在超时后抛出可控错误。
- **本模块证据**：
  - `electron/lib/search.ts` 从 `AbortSignal.timeout(15000)` 改为 `AbortController` + `setTimeout`。
  - `electron/lib/kimi.ts` 的 `chatNonStream` 同样采用该模式，并支持 `args.signal`。
  - `searchWeb` 测试验证外部 abort 生效。

---

## 规则候选 4：重试逻辑必须区分业务错误与可重试错误，并保留部分成功结果

- **适用场景**：批量外部 API 调用需要重试或降级时。
- **问题描述**：Agent 常使用 `Promise.all` 一失败全失败，或对所有错误统一重试，导致空结果、网络错误、LLM 解析错误被同等处理。
- **Agent 行为偏差**：
  - 用 `Promise.all` 并发查询，任一查询失败则整批失败。
  - 把 `NO_RESULTS` 当作网络错误重试。
  - 重试时丢弃已成功的部分结果。
- **正确做法**：
  - 用 `Promise.allSettled` 收集部分成功结果。
  - 明确业务错误（如 `NO_RESULTS`）与可重试错误（如 `TAVILY_ERROR`/`NETWORK_ERROR`）。
  - 只要存在任一成功结果即可进入下一步；仅在全部为空或可重试错误时才重试。
  - 重试次数上限后抛出受控错误码。
- **验证方式**：
  - 测试部分查询返回空、部分查询网络错误、部分查询成功三种组合。
  - 验证 `NO_RESULTS` 不重试，直接以对应错误码返回。
- **本模块证据**：
  - `electron/ipc/search.ts` 中 `searchWebWithRetry` 使用 `Promise.allSettled`。
  - `searchWeb` 对 `NO_RESULTS` 抛独立错误码，IPC 层据此不重试。
  - `tests/search-ipc.test.ts` 覆盖“部分查询无结果仍保留其他结果”和“部分查询网络错误仍保留其他结果”。

---

## 规则候选 5：外部 API 错误必须映射为受控错误码，禁止向用户泄露原始响应体

- **适用场景**：外部服务返回非 2xx、解析失败、认证失败等。
- **问题描述**：Agent 常把外部 API 的原始状态码、HTML 错误页、堆栈信息直接抛给用户，造成信息泄露和糟糕体验。
- **Agent 行为偏差**：
  - `throw new Error(JSON.stringify(response))`。
  - 错误消息包含完整 URL 或 API key 片段。
  - 未给 UI 提供可本地化的错误码。
- **正确做法**：
  - 在底层客户端将外部错误转换为领域错误码（如 `TAVILY_ERROR`、`NETWORK_ERROR`、`MISSING_API_KEY`、`NO_RESULTS`、`LLM_ERROR`）。
  - 仅在日志中记录脱敏后的响应摘要（`body.slice(0, 500)`）。
  - IPC handler 向渲染进程返回固定错误码，store/组件根据错误码显示本地化提示。
- **验证方式**：
  - 测试断言错误码而非错误消息字符串。
  - 检查日志和 UI 中不出现 API key 或完整响应 body。
- **本模块证据**：
  - `electron/lib/search.ts` 将 HTTP 错误映射为 `TAVILY_ERROR`，空结果映射为 `NO_RESULTS`。
  - `electron/ipc/search.ts` 将所有错误统一包装为 `SearchErrorCode`。
  - `src/store/index.ts` 的 `prepareExternalMaterials` 根据错误码显示不同 toast。

---

## 规则候选 6：覆盖层抽屉等 UI 必须同步调整底层内容区域，避免遮挡可交互元素

- **适用场景**：在已有页面叠加侧滑抽屉、模态面板、浮动工具栏等。
- **问题描述**：Agent 添加抽屉后只关注抽屉本身，不处理底层布局，导致聊天消息、按钮被物理遮挡但无法滚动/点击。
- **Agent 行为偏差**：
  - 抽屉展开后覆盖右侧区域，但消息列表仍占满全宽。
  - 未提供点击外部关闭、Esc 关闭等快速恢复方式。
  - z-index 设置不当，抽屉被其他组件压住。
- **正确做法**：
  - 抽屉展开时给底层内容容器增加等宽 padding（如 `padding-right: 380px`），使文字/气泡保持在可见区域。
  - 使用透明点击捕获层或 `pointerdown` 监听实现点击外部关闭。
  - 提供关闭按钮和 Esc 快捷键。
  - 明确抽屉层级：高于普通内容，低于归档弹窗等真正模态层。
- **验证方式**：
  - E2E 断言面板展开后最新消息气泡右边界不超过面板左边界。
  - 测试点击外部、Esc、关闭按钮均可关闭面板。
- **本模块证据**：
  - `ExternalSummaryPanel.tsx` 宽度 760px，右侧固定。
  - `Study.tsx` 根据 `isExternalSummaryOpen` 动态调整消息列表 `padding-right`。
  - `ExternalSummaryPanel` 监听 `pointerdown` 实现点击外部关闭。
  - E2E spec 覆盖 TC-4（不遮挡对话内容）和 TC-2（关闭方式）。

---

## 规则候选 7：异步加载与长时操作必须设置并发守卫和请求去重

- **适用场景**：用户可重复触发、或初始化时自动触发的异步操作（搜索、推荐、生成等）。
- **问题描述**：Agent 常忽略重复点击、快速切换主题、组件重渲染导致的重复请求，造成资源浪费、状态覆盖或竞态。
- **Agent 行为偏差**：
  - `prepareExternalMaterials` 被多次调用产生多个并行 Tavily 请求。
  - 后台异步任务完成后不检查请求是否已过时，导致旧结果覆盖新结果。
  - 没有 loading 状态或 loading 状态与请求生命周期不一致。
- **正确做法**：
  - 在 store action 中检查 `loading` 标志，若已在执行则直接返回。
  - 对非幂等请求使用递增 `requestId`，在回调/finally 中校验当前 id 是否最新。
  - 确保 loading 状态在成功、失败、取消三种路径下都被正确重置。
- **验证方式**：
  - 连续触发 action 仅产生一次网络请求。
  - 旧请求返回后不应覆盖新请求已设置的结果。
  - 错误路径下 loading 被重置。
- **本模块证据**：
  - `src/store/index.ts` 的 `prepareExternalMaterials` 开头检查 `externalMaterials?.loading`。
  - 同文件 `refreshWildcardInspiration` 使用 `wildcardRequestId` 做去重/防覆盖。
  - Commit `70fc973` 显式增加 store-level concurrency guards 和 wildcard staleness guard。

---

## 规则候选 8：LLM 输出解析必须验证结构，禁止依赖格式假设做强制类型转换

- **适用场景**：使用 LLM 生成 JSON、数组、编号列表等结构化输出时。
- **问题描述**：Agent 常假设 LLM 一定返回正确 JSON 数组，直接 `JSON.parse(text) as string[]`，导致对象、字符串、markdown 包裹内容引发崩溃。
- **Agent 行为偏差**：
  - `JSON.parse(extracted) as string[]` 后立即 `.filter()`，未校验 `Array.isArray`。
  - 未处理 markdown 代码块包裹（```json）。
  - 未处理数组元素类型不匹配（如 `[1,2,3]`）。
- **正确做法**：
  - 先用 `extractJsonArray`/`extractJsonObject` 等工具提取 JSON 片段。
  - `JSON.parse` 后使用类型守卫（`Array.isArray`、元素类型检查）。
  - 对不符合预期的结构抛出明确错误，交由上层降级处理。
- **验证方式**：
  - 测试覆盖非数组 JSON、数组元素类型错误、空数组、markdown 包裹等情况。
  - 断言错误消息包含结构问题描述。
- **本模块证据**：
  - `electron/lib/search.ts` 的 `generateSearchQueries` 先校验 `Array.isArray(arr)`，再过滤 `typeof q === 'string'`。
  - `tests/search.test.ts` 覆盖“非字符串数组元素”和“提取 JSON 不是数组”。
  - Commit `70fc973` 统一加固了搜索、briefing、wild-card 的 JSON 解析。

---

# 摘要

- **文件路径**：`C:\Users\86468\Desktop\project\study-parlor\.claude\rules\.tmp\web-search-rules-draft.md`
- **规则数量**：8 条
- **覆盖领域**：
  1. 外部 API 凭证与配置隔离（规则 1）
  2. 跨层类型/IPC 同步（规则 2）
  3. 超时与 abort 管理（规则 3）
  4. 重试与部分成功（规则 4）
  5. 外部 API 错误处理与错误码（规则 5）
  6. 外部资料摘要与 UI 集成（规则 6）
  7. 并发守卫与请求去重（规则 7）
  8. LLM 输出解析安全（规则 8）
