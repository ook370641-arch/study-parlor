# 夜航简报（Briefing）功能规则候选

> 基于 2026-06-21 至 2026-07-10 的设计文档、git 提交历史及当前代码的端到端规则挖掘。

---

### 1. 必须对上游 Feed/API 返回的空值与缺字段做防御式处理
- **抽象偏差**：完整性盲区
- **本项目表现**：初版 `electron/ipc/briefing.ts` 在构建 `BriefingSource` 时直接访问 `builder.tweets[0]?.url`，当某 builder 没有 tweets 或字段缺失时触发运行时崩溃；后续才补充 `tweets.length === 0` 的跳过逻辑。
- **必须这样做**：
  - 把每条 feed 记录都当作可能缺字段的不可靠输入；
  - 在解构/索引前显式检查存在性与非空；
  - 对无效记录使用 `continue` / 过滤，而不是抛出未处理异常。
- **常见错误**：AI 看到 spec 里的 JSON schema 就假设数据一定符合 schema，忽略真实 feed 中偶尔出现的空数组或缺字段。
- **来源**：commit:`851e619751206106f72c8452c453ed598b6ca1bf`; spec:`docs/superpowers/specs/2026-06-21-night-briefing-design.md` 第 4 节

---

### 2. 外部网络失败必须与“数据为空”区分开，并提供重试与部分降级
- **抽象偏差**：外部依赖脆弱性
- **本项目表现**：最初 `fetchJson` 对 HTTP 非 2xx 直接返回 `null`，导致网络失败被误判为 `FEED_EMPTY`；后续补丁才抛出 `NETWORK_ERROR`、增加 `fetchJsonWithRetry`，并在部分 feed 失败时返回 `sourceStatus` 继续生成。
- **必须这样做**：
  - 网络层错误（超时、HTTP 非 2xx、JSON 解析失败）使用独立错误码；
  - 重试策略显式可配置（次数、间隔），并在日志中记录失败原因；
  - 只要还有一个 feed 有内容，就应部分生成并让用户看到哪些源失败。
- **常见错误**：把 fetch 失败与空数据混为一谈，导致用户看到“今日海面平静”而实际只是网络断了。
- **来源**：commit:`4e63a1a2a72d8bb8ab70226b93209d045c181aba`; commit:`d0881faee072869c8ef4c0cb30b78a73e1246ed6`; spec:`docs/superpowers/specs/2026-06-27-briefing-entry-and-loading-design.md` 第 6 节

---

### 3. LLM 结构化输出必须校验，绝不能裸调用 JSON.parse
- **抽象偏差**：验证缺口
- **本项目表现**：第一次 LLM 调用后直接用 `JSON.parse(structuredRaw)`，LLM 一旦返回非 JSON 或包裹了 markdown fence 就会崩溃；补丁增加 `parseStructuredJson` 剥离 fence 并捕获异常，再向上抛出 `ASSEMBLY_ERROR`。
- **必须这样做**：
  - 对 LLM 返回做 strip-fence、try-parse、错误分类三步；
  - 解析失败要给用户可读错误码，而不是 raw stack；
  - 单元测试必须覆盖 malformed JSON、空字符串、带 fence 三种情况。
- **常见错误**：认为“我已经在 prompt 里说了 Output ONLY JSON，所以一定安全”。
- **来源**：commit:`70fc9738d947be609b25ded5e9521dda3f34c98d`; spec:`docs/superpowers/specs/2026-06-21-night-briefing-design.md` 第 7.1 节

---

### 4. IPC 错误码必须在 types / preload / store facade 三层同步定义
- **抽象偏差**：跨层同步遗漏
- **本项目表现**：主进程抛出的 `FEED_EMPTY`、`NETWORK_ERROR` 等码经过 Electron IPC 后被包装成 `"Error invoking remote method 'briefing:generate': Error: FEED_EMPTY"`，store 里只能用子串匹配还原；如果以后主进程改了前缀，UI 错误分类会立即失效。
- **必须这样做**：
  - 在 `src/types/index.ts` 中明确定义 `BriefingErrorCode` 联合类型；
  - preload 层不做额外包装，保持错误 message 稳定；
  - store 的 `generateBriefing` 使用类型化的错误码映射，而不是字符串 includes。
- **常见错误**：只改 main process 的错误文本，没同步改渲染层的解析逻辑。
- **来源**：commit:`ff6c8ea039edf0d7fef7c68f6640b805ae7b136b`; spec:`docs/superpowers/specs/2026-06-27-briefing-entry-and-loading-design.md` 第 6 节

---

### 5. 新增持久化字段必须提供默认值并兼容旧 state.json
- **抽象偏差**：完整性盲区 / 跨层同步遗漏
- **本项目表现**：`briefingTheme`、`briefingFontSize`、`briefingSource`、`anthropicBlogCache`、`sourceStatus`、`generatedAt` 都是后续追加的字段；旧缓存文件没有 `briefing_source_status` 和 `generatedAt`，代码必须 fallback 到 `{x:'ok',...}` 和 `created` 或当前时间。
- **必须这样做**：
  - 任何新 state 字段在 `state.ts` 的 `DEFAULT` 和 store 的 `init` 中都要有默认值；
  - 读取旧缓存或旧 state 时显式处理缺失字段；
  - 不要因为新增字段就破坏旧用户的启动或已生成缓存的展示。
- **常见错误**：只在新增代码里用新字段，不处理 `undefined` 导致的渲染白屏或类型错误。
- **来源**：current `src/store/index.ts` init; current `electron/ipc/briefing.ts` cache-read; spec:`docs/superpowers/specs/2026-06-27-briefing-ui-upgrade-design.md` 第 6.3 节、第 9.3 节

---

### 6. 页面所有状态（加载中 / 出错 / 空状态 / 成功）必须共享同一套顶部 Chrome
- **抽象偏差**：完整性盲区
- **本项目表现**：早期实现中「往期」按钮只在生成后才出现，Header 按钮在不同状态下来回增减；补丁将 A-/A+、重新生成、往期、主题切换固定在所有状态，并把换画按钮移出 Header 避免高度不一致。
- **必须这样做**：
  - 顶部导航、字号控制、主题切换、返回按钮在 loading/error/success 三种状态下都可见且位置固定；
  - 不要把装饰性按钮放到 Header 里，避免不同主题/状态下 Header 高度变化；
  - 报错时仍保留可操作入口（重试、往期、切换主题）。
- **常见错误**：只给成功状态画 Header，加载和错误状态让 Skeleton/Error 组件自己接管，导致按钮闪现或消失。
- **来源**：commit:`afaa7909964a583207571a750bb3dd445f3c5b16`; commit:`8907f55e011d2f86be91a8e27dbea1707575ffa2`; spec:`docs/superpowers/specs/2026-07-06-night-briefing-optimization-design.md` 第 4 节

---

### 7. 状态指示器只应暴露异常，不应把正常细节当作噪音堆给用户
- **抽象偏差**：过度工程 / 完整性盲区
- **本项目表现**：`sourceStatus` 最初在 Header 显示 "X ✓ 博客 ✓ 播客 ✓"，成功状态也被暴露；后续补丁改为只显示失败的源，并通过 `title` 提供悬停详情，字号按钮也从 "A-/A+" 简化为 "-/+" 以减少视觉噪音。
- **必须这样做**：
  - 正常状态尽量隐式（不展示 ✓ 大军），失败状态显式且可交互；
  - 文案和图标要经过一轮“信息噪音”审查；
  - 对 controls 使用不言自明的符号或加 `title` 提示。
- **常见错误**：把内部所有状态都映射到 UI，导致界面拥挤、用户无所适从。
- **来源**：commit:`6855f7aa24e3ac6963d27dacb7e4a6500213d240`; commit:`fd52344`; spec:`docs/superpowers/specs/2026-07-06-night-briefing-optimization-design.md` 第 6.2 节

---

### 8. 生成的 Markdown 中的链接必须被解析为可点击外链
- **抽象偏差**：完整性盲区
- **本项目表现**：原始来源区以纯文本形式列出 `- description url` 和 `[原文链接](url)`，默认 MarkdownRenderer 渲染后 bare URL 不可点击；补丁新增 `BriefingSourceItem` 用正则同时识别 markdown 链接和裸 URL，统一渲染为 `<a target="_blank">`。
- **必须这样做**：
  - 对 LLM 输出的引用区做专门的链接解析，不能只靠默认 markdown 组件；
  - 同时支持 `[text](url)` 和裸 `https://`；
  - 所有外链必须带 `rel="noopener noreferrer"`。
- **常见错误**：认为“我 prompt 里要求 LLM 输出 markdown 链接就够了”，忽视 bare URL 场景。
- **来源**：commit:`2e5cadeb5aa7b9ab56282c8688d7de590fe9741b`; spec:`docs/superpowers/specs/2026-06-21-night-briefing-design.md` 第 7.2 节

---

### 9. Prompt 中必须显式禁止不想要的内容，并用测试兜底
- **抽象偏差**：验证缺口
- **本项目表现**：LLM 经常在正文里输出 `AI Builders Digest — Date`、`Vol.`、`档案编号`、`学习卷宗`、底部 `Generated through the Follow Builders skill` 等装饰性内容；后续在 `digest-intro.md` 增加专章禁止这些模式，并在 `tests/briefing-prompts.test.ts` 中验证 prompt 包含禁止列表。
- **必须这样做**：
  - 在 system/user prompt 里用独立小节列出禁止输出的关键词与模式；
  - 在解析/渲染层增加兜底过滤（正则或黑名单）；
  - 单元测试覆盖 prompt 文件内容与解析过滤逻辑。
- **常见错误**：只在 prompt 开头轻描淡写说“不要装饰性标题”，没有具体例子和测试。
- **来源**：commit:`8907f55e011d2f86be91a8e27dbea1707575ffa2`; tests:`tests/briefing-prompts.test.ts`; spec:`docs/superpowers/specs/2026-07-06-night-briefing-optimization-design.md` 第 7.2 节

---

### 10. 引入浏览器自动化类依赖前必须先验证打包分发可行性
- **抽象偏差**：外部依赖脆弱性 / 过度工程
- **本项目表现**：Anthropic 博客集成最初使用 Playwright (`anthropic-scraper/`)，但 `electron-builder.yml` 只打包 `out/**/*`、`package.json`、`electron/prompts`，安装包不会包含 Chromium 二进制，用户安装后功能直接崩溃 (`Executable doesn't exist`)。设计文档已明确要用 Electron 内置 Chromium 离屏 BrowserWindow 替换。
- **必须这样做**：
  - 任何需要外部二进制、浏览器、CLI 工具的依赖，先在 `electron-builder.yml` / `package.json` 层面验证打包路径；
  - 生产环境优先使用 Electron 自带的 Chromium / Node 能力；
  - 开发期小工具可保留，但必须与生产代码解耦，不能作为运行时依赖。
- **常见错误**：在开发环境跑通 Playwright 就以为打包后也能跑，直到构建完才发现二进制缺失。
- **来源**：current `package.json`; current `electron-builder.yml`; spec:`docs/superpowers/specs/2026-07-10-anthropic-blog-briefing-design.md` 第 5 节（P0 缺口）

---

### 11. 耗时操作必须提供取消、超时与重试，不能只依赖固定等待
- **抽象偏差**：完整性盲区
- **本项目表现**：Anthropic 博客的 `discoverArticles` / `importArticle` 目前每次调用都冷启动 Chromium，超时 60 秒且界面无取消按钮；设计文档要求刷新/导入中提供取消、网络断开显示重试、导入失败行内重试。
- **必须这样做**：
  - 所有可能超过 3 秒的异步 IPC 调用都携带 `AbortController`；
  - UI 上显示进度或 loading 状态，并提供显式取消按钮；
  - 失败后保留上下文，允许原地重试而不是让用户重新进入页面。
- **常见错误**：只写 `page.goto(url, { timeout: 60000 })` 而不给用户退出路径。
- **来源**：current `electron/lib/anthropic-scraper.ts`; current `src/components/anthropic/AnthropicArticleRow.tsx`; spec:`docs/superpowers/specs/2026-07-10-anthropic-blog-briefing-design.md` 第 3.3、3.5、8 节

---

### 12. 新增 IPC 接口必须同步更新 types、preload、facade、store 四个层
- **抽象偏差**：跨层同步遗漏
- **本项目表现**：Anthropic 集成新增了 `anthropic:discover` 和 `anthropic:importArticle` 两个 IPC；它们必须同时在 `src/types/index.ts` 的 `IpcApi`、`electron/preload.ts`、`src/lib/ipc.ts` facade、`src/store/index.ts` actions 中出现，缺一不可。目前这些层已经同步，但历史上曾多次出现 preload 漏注册导致 `window.api.xxx` 为 undefined。
- **必须这样做**：
  - 按 checklist 顺序更新：types → main handler → preload → facade → store → 组件；
  - 每个新增 IPC 至少有一个启动时探测或测试断言验证 `window.api` 上存在；
  - 返回结构体使用显式的 `{ ok: true; ... } | { ok: false; code; message }` 而不是裸抛错。
- **常见错误**：main handler 写完后，preload 里忘记 expose，运行时才发现 `window.api.anthropicDiscover is not a function`。
- **来源**：current `src/types/index.ts`; current `electron/preload.ts`; current `src/lib/ipc.ts`; current `src/store/index.ts`; spec:`docs/superpowers/specs/2026-07-10-anthropic-blog-briefing-design.md` 第 10 节

---

### 13. 本地文件系统的“已保存”缓存必须与文件存在性保持同步
- **抽象偏差**：完整性盲区
- **本项目表现**：Anthropic 文章列表用 `source_url → filePath` 映射标记 `isSaved`，但如果用户手动删除了 `.md` 文件，列表仍显示“已保存”，点击时可能报错；设计文档要求点击时若文件不存在则重新导入。
- **必须这样做**：
  - 在渲染列表或打开文章前检查 `fs.existsSync(filePath)`；
  - 发现文件缺失时自动降级到重新抓取或更新状态为未保存；
  - 导入成功后刷新列表中的 `isSaved` 标记。
- **常见错误**：把“曾经导入过”等同于“文件现在仍然存在”。
- **来源**：current `electron/lib/anthropic-scraper.ts` `findSavedArticles`; spec:`docs/superpowers/specs/2026-07-10-anthropic-blog-briefing-design.md` 第 3.5、8.3 节

---

### 14. 测试不能只覆盖 happy path，必须包含空数据、失败、持久化与跨主题回归
- **抽象偏差**：验证缺口
- **本项目表现**： briefing 的多个 bug（空 tweets、malformed JSON、cache write failure、source status 显示、字号持久化、主题切换后布局）都是通过事后补测试才发现或防止回归的。
- **必须这样做**：
  - 单元测试覆盖：空 feed、部分 feed 失败、LLM 返回非 JSON、文件写入失败、旧缓存兼容；
  - 组件测试覆盖：loading/error/success 三种状态渲染、字号 CSS 变量、source 链接可点击；
  - E2E 覆盖：缓存命中、网络失败、错误重试、持久化跨重启、主题切换。
- **常见错误**：只写“生成成功且内容非空”的测试，导致边界场景反复在真机上暴露。
- **来源**：commit:`851e619751206106f72c8452c453ed598b6ca1bf`; commit:`70fc9738d947be609b25ded5e9521dda3f34c98d`; commit:`f37c547`; commit:`6ceecfb`; commit:`7faad3f`; tests:`tests/briefing.test.ts`; tests:`tests/briefing-layout.test.tsx`; e2e:`e2e/specs/briefing-ux-optimization.spec.ts`

---

### 15. 字号、主题等“个性化”设置应全局统一持久化，避免每页单独维护
- **抽象偏差**：跨层同步遗漏 / 过度工程
- **本项目表现**： briefing 的字体大小通过 `briefingFontSize` 持久化到 `state.json`，A-/A+ 按钮在 Header 中控制；`externalSummaryFontSize` 后来单独引入，说明如果没有统一规划，很容易出现多份字体大小状态。设计文档要求 Anthropic 阅读器也复用同一套字号控制。
- **必须这样做**：
  - 在阅读器、摘要面板等后续功能中复用已有的字号枚举与常量（`BriefingFontSize`、`briefing-font-size.ts`）；
  - 不要把同一概念复制成多个 state key；
  - 持久化字段命名一致，避免 `fontSize` / `briefingFontSize` / `readerFontSize` 同时存在。
- **常见错误**：为新页面新建一套独立状态，导致用户设置无法跨页面共享。
- **来源**：current `src/lib/briefing-font-size.ts`; current `src/store/index.ts`; spec:`docs/superpowers/specs/2026-07-06-night-briefing-optimization-design.md` 第 5 节; spec:`docs/superpowers/specs/2026-07-10-anthropic-blog-briefing-design.md` 第 3.6 节
