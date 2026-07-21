# 夜航简报 debug 修复设计（5 模块）

- 日期：2026-07-21
- 状态：已获用户批准（2026-07-21）
- 范围：求职简报 ×3 bug + 删除功能、AI 日报导读遮罩、旁注聊天窗口 ×2 bug、写作新建文章棕屏、E2E 覆盖补强
- 调查方式：5 路并行子 agent 根因调查（4 路一次完成，写作路经 stop/resume 后产出实证报告）

## 背景

用户在 main 生产使用中撞上 5 组问题。调查确认全部为真实代码缺陷，且现有 E2E 均未覆盖对应路径。其中写作模块已实证：**main 最新代码上 `writing-editor.spec.ts` 8/8 当前即为红色**，失败截图是纯棕色空屏（与用户所见一致）。

---

## 模块一：求职简报（档案入口 / JOB_20 / 骨架屏 / 删除）

### 1a. 求职档案入口消失 + 退出落错页面

**根因（高置信度）**

- 简报页唯一的「求职档案」入口是一次性提示条：`src/pages/Briefing.tsx:262-286`，渲染条件为 `isJobProfileEmpty(jobProfile) && !profileHintDismissed` 且嵌在 `jobResult ?` 分支内（必须已生成过简报）。`isJobProfileEmpty`（`src/lib/job-briefing-defaults.ts:41-43`）在用户填过任意字段后永久为 false → 入口永久消失。
- 提示条「去设置」走 `goto('settings')`；Settings 返回按钮硬编码 `goto('home')`（`src/pages/Settings.tsx:221-225`）。store 的 `goto` 是裸 `set({ currentPage: p })`（`src/store/index.ts:478`），无来源页记录机制。

**修复**

1. 求职简报视图加常驻「求职档案」入口，位置放在「生成简报」按钮旁的工具区，显示条件不依赖 `isJobProfileEmpty`。提示条保留作新手引导，但不再是唯一入口。
2. store 的 `goto('settings')` 增加 `returnTo` 记录；Settings 返回优先回来源页，缺省回 home。

### 1b. 生成简报报 JOB_20

**根因（高置信度）**

- `JOB_20` 的 `20` 是 DOMException 的 `ABORT_ERR`（code === 20）：综合生成阶段（`reasoning_effort: 'high'` + 大量 JSON 输入，常跑数分钟）超过 300 秒总超时（`electron/ipc/job-briefing.ts:133-134` 的 `llmCtl.abort()`）被中止。
- `electron/lib/job-briefing.ts` 各阶段均有局部 try/catch 降级，唯独最后的综合生成 `chatNonStream`（lib:628-633）没有 → abort 一路抛到 IPC 层，`err?.code || 'NETWORK_ERROR'` 取到 truthy 的 `20`，拼成 `JOB_20`（ipc:142-144）。
- 渲染侧 `src/store/index.ts:607-616` 错误映射只认 6 个已知 code，`JOB_20` 落入 fallback 原样显示整段 IPC 包装消息（`BriefingError.tsx:27`）。
- 失败缓存死循环已排除：所有 throw 路径发生在写文件之前。

**修复**

1. IPC catch 处错误归一化：`err?.name === 'AbortError' || err?.code === 20` → 新领域码 `TIMEOUT`，即抛 `JOB_TIMEOUT`；不再把原始 `err.code` 直接拼进错误消息（feature-development §3）。
2. `src/types/index.ts` 的 `JobErrorCode` 联合类型补 `TIMEOUT`；`BriefingError.MESSAGES` 补 `JOB_TIMEOUT` 文案（「生成超时，请重试」，`showRetry: true`）；store 错误映射同步；未知 code 的 fallback 改为通用文案，不裸显 `err.message`。
3. 综合生成阶段改用**独立的 300 秒计时**（从该阶段开始时重新起算），不再与前面各阶段共享 300s 总预算；并与其他阶段一样加局部 try/catch，超时时抛出映射为 `JOB_TIMEOUT` 的领域错误（不再让裸 AbortError 冒泡）。

### 1c. 生成流程 UI 卡死 / 骨架屏闪烁

**根因（中置信度，代码缺陷确凿）**

- `briefingStage` 是 digest 与 job-briefing 共享的单一全局 key（`src/store/index.ts:118`），两个生成 action 结束时都无条件置 null（store:565-568、580-583、606、616），且两者订阅同一条 `briefing:progress` 通道。
- 求职简报综合阶段数分钟无 progress 事件（lib:621-635 之间无 emitProgress）。此窗口内 digest 侧任何结束/进度会把共享 stage 置 null 或写成 digest key → 回到求职简报页时 `Briefing.tsx:243-250` 的 `stage ? <BriefingProgress/> : <BriefingSkeleton/>` 降级成无文字闪烁条；或 stage 是不属于 JOB_STAGES 的 key 使 `findIndex === -1`（`BriefingProgress.tsx:28`）→ 5 行全灰。

**修复**

1. stage 按源拆分：`digestStage` / `jobBriefingStage`，各自 action 结束只清自己的 stage；渲染按当前源读对应 stage。
2. `BriefingProgress` 对 `findIndex === -1` 增加显式 fallback（保持最后已知有效阶段或回退 skeleton），不再静默渲染全灰 5 行。

### 1d. 删除功能（求职简报 + AI 日报共用）

**现状**：两源均无删除 IPC/UI。存储：`<学习库>/求职简报/求职简报-YYYY-MM-DD.md`、`<学习库>/夜航简报/夜航简报-YYYY-MM-DD.md`。可复用模式：`writing:delete`（`electron/ipc/writing.ts:64-67` → `writing-tree.ts:207-212`）+ `StudyLibrary` 的 ConfirmDialog 逐条确认交互。

**设计**

- UI：日期列（`BriefingDateColumn`，digest 与 job 两源共用）头部放 🗑 按钮 → 进入选择删除模式：每条历史条目出现勾选框，底部出现「删除所选 / 取消」栏 → 确认对话框列出将删文件 → 执行删除。
- IPC：新增 `briefing:delete` / `job-briefing:delete`，参数为 `filePath`（由对应 list IPC 返回给渲染侧，删除前主进程必须校验该路径位于对应简报目录内，防路径穿越），按 ipc-state §1 四层同步：types → handler → preload → `src/lib/ipc.ts` facade → store → 组件/测试。
- 状态同步：删除当前展示中的简报后清空 store 对应 `result` 并重新 load 历史列表；「今天」是合成条目，删除后点击今天走缓存未命中重新生成（语义合理，确认文案中说明）。

---

## 模块二：AI 日报导读遮罩

**根因（高置信度）**

academic 主题下页面铺 `fixed inset-0 z-[1] bg-[#0c0806]/[0.72]` 压暗遮罩（`src/pages/Briefing.tsx:112-117`）；正文、来源侧栏、日期列、AnthropicBlogPanel 均显式 `z-[5]` 站在遮罩上，唯独 digest 挂载点的 `ArticleAssistantPanel` 根容器（`ArticleAssistantPanel.tsx:72`，`relative` + z-index auto）没有 z-index → 导读边栏被 72% 黑色罩住；GuideSidebar 本身半透明设计（`bg-ink/40`、`text-parchment/60~90`）叠加后对比度崩塌。旁注 tab（`z-40`）与 ChatWindow（`z-50`）更高故不受影响；Anthropic 阅读器在 `z-[5]` 容器内故正常；newspaper 主题不渲染遮罩故正常。

**修复**

`ArticleAssistantPanel.tsx:72` 根容器补 `z-[5]`（一处修改同时覆盖 digest 与 job-briefing 两个挂载点）。改后验证：旁注 tab（`z-40`）与 ChatWindow（fixed `z-50`）相对页面元素的遮挡关系不变；academic 主题导读与正文视觉一致；Anthropic 阅读器与 newspaper 主题无回归。

---

## 模块三：旁注聊天窗口

### 3a. 左侧角拖拽方向反

**根因（高置信度）**

`ResizeHandles.tsx:24-29` 只产出新 width/height，`ChatWindow.tsx:247-251` 只 `setSize` 不补偿 position；而锚点是二态的（未拖动：`right:24;bottom:24`，拖动过：`left/top`，`ChatWindow.tsx:95-102`）。正确 resize 要求 handle 对角固定，当前四种 handle × 两种锚定态矩阵中左角在「拖动过」状态下必反（用户场景），右下角在「未拖动」状态下也反。

**修复**

1. 统一锚定为 `left/top`：首次 resize（或首次渲染）时把当前 rect 换算成 left/top 写入 position，消除二态。
2. resize 时同步补偿位置：handle 含 `w` 时 `x -= width增量`，含 `n` 时 `y -= height增量`，使 handle 对边钉死、被拖边跟随光标。
3. 补 resize 视口 clamp（目前完全没有，只有 `MIN_W=260 / MIN_H=180` 最小尺寸）。

### 3b. 小窗口发送按钮溢出 + 三控件右侧化

**根因（高置信度）**

输入行 `flex items-center gap-1.5`（`ChatWindow.tsx:169`）：3 个图标按钮（170-214 行：🔍联网搜索 / 🎓苏格拉底 / 🧠思考深度，实际在输入框**左侧**同行）+ input（`flex-1` 但无 `min-w-0`，固有最小宽度拒绝收缩）+ 发送按钮（`whitespace-nowrap`）。`MIN_W=260` 下整行必然超出容器，且窗口 div 无 `overflow-hidden`，按钮画出窗口外。

**修复**

1. input 加 `min-w-0`，发送按钮加 `shrink-0` → 发送按钮任何尺寸下在界内。
2. 三个开关包进 wrapper div 移到 input 之后、发送按钮之前（用户要求的「移到右侧」）。
3. 用组件内现成的 `size.width` state 做阈值判断，**阈值定为 320px**：`size.width < 320` 时给 wrapper 加 `hidden`——Tailwind 视口断点对组件内 state 无效，不能用 `sm:`/`md:`。小窗布局为 `[input(flex-1 min-w-0)] [发送(shrink-0)]`，发送常驻。

---

## 模块四：写作新建文章棕屏

**实证**（fresh build + E2E 复现）：main 上 `writing-editor.spec.ts` 8/8 失败，截图为纯棕色空屏；文件写盘成功（主进程 IPC 无问题）；`writing-tree.spec.ts` 全过（只断言磁盘，不断言 UI 存活）→ 崩溃特定于新建文章后的渲染/挂载流程；App 无全局 ErrorBoundary（仅 `MarkdownContent.tsx:7` / `MarkdownRenderer.tsx:28` 有局部 boundary）→ 任何渲染异常卸载整树，只剩 body 棕色 `#2a1f1a`。

**根因假设（按可能性排序，精确抛错行待诊断设施补齐后钉死）**

- H1：新建后渲染/挂载路径抛未捕获异常。可疑点：`@milkdown/react` 的 `useGetEditor` 在 effect 里同步调用 `getEditor(div)`（`WritingEditor.tsx:17-29`），工厂内同步 throw 不被 `.catch` 兜住；新文件 body 为 `''`（`writing-tree.ts:217-225`），与 seed 非空文件是两条不同的 Milkdown 初始化输入。
- H1b（竞态）：`WritingListColumn.tsx:27-36` 自动选中 effect（tree 更新即选第一篇）与 `onSubmit` 里 `selectWritingFile(新文件)`（45 行）并发，两个 `writingRead` 后写先赢；与 `saveWritingFile`（store:1510 非空断言）交织可能产生残缺 `writingFile` → Milkdown 以 `initial=undefined` 挂载。
- H2（已实证，独立回归）：merge `77ed09e` 冲突解决误删 6 个持久化字段——`writingFontSize`/`writingTone`/`writingListTab`/`writingAssistantWidth`/`writingAssistantOpen`/`lastWritingFile`，从 `src/types/index.ts` 的 `StateJson`、`electron/ipc/state.ts` DEFAULT、store `init()` hydration 三处删除。后果：设置仍被 patchState 写入 state.json，但重启后永不读回（不直接导致棕屏，但违反 ipc-state §3）。

**修复（按顺序）**

1. 先补诊断：`e2e/fixtures/electron.ts` 的 window 挂 `console`/`pageerror` 监听并写入测试产物 → 重跑 writing-editor 拿真实异常栈，钉死精确抛错行。
2. 系统性兜底：App 级 ErrorBoundary，任何渲染异常降级为局部错误提示（含重试/返回入口），不再整应用棕屏。
3. 消竞态：`selectWritingFile` 加 requestId 防后发先至（rules general §7）；自动选中 effect 在刚创建文件后不与显式选中打架；`saveWritingFile` 去掉非空断言，显式处理 null。
4. 空 body 兜底：确认 Milkdown v7 在 `defaultValueCtx=''`（及 undefined）下行为，必要时 `WritingEditor` 的 initial 做兜底。
5. 补回 H2 误删：从 `14499ba` 取回 6 个字段的 `StateJson` 声明 + `state.ts` DEFAULT + store `init()` hydration。

---

## 模块五：E2E 补强（验收标准）

**诊断设施**

- fixture 采集渲染进程 console/pageerror（当前只转发主进程 stdout，渲染异常完全不可见）。

**写作**

- 空 writing/ 目录 → 新建第一篇文章 → 无固定 sleep 断言编辑器出现且可立即输入 → 内容落盘。
- 已有多个文件（新文件名排序不在首位）→ 新建 → 断言编辑器是新文件（抓自动选中竞争）。
- 每个 writing spec 加全局 Chrome 存活探针（如 sidebar 仍可见），整树卸载立即可定位。
- 改字号 → reload → 字号保持（持久化读回回归，抓 H2 类问题）。

**求职简报**

- 新增 `seedJobBriefing(libPath, date, content)` helper，复用主进程已预留的 `## Error\nJOB_xxx` 缓存注入口（`electron/ipc/job-briefing.ts:39-42`）。
- seed `JOB_NETWORK_ERROR` → 错误 UI + 重试按钮 + 正确文案；seed `JOB_MISSING_SEARCH_KEY` → 无重试按钮；错误态点重试 → mock 成功渲染；失败后离开再回来 → 不卡骨架屏。
- 档案链路：简报页常驻档案入口可见 → 进入设置 → 编辑保存 → 返回落到求职简报页且内容仍在。

**导读**

- academic / newspaper 两主题下导读文字色值断言（防深色 token 漏进浅色分支）；academic 下导读不被遮罩罩住（颜色对比回归）。

**旁注**

- 拖 se 角 → 被拖角跟随光标；拖 nw 角 → 右下边缘保持不动；resize 到最小尺寸（260×180 clamp）→ input 与发送按钮可见可点，小窗下三控件隐藏、发送常驻。

**总验收**

- `writing-editor` 8/8 恢复绿；全部新用例绿；既有测试不回归；`npx tsc --noEmit` 干净。

---

## 风险与注意

- 模块四第 1 步（诊断）必须先于第 3/4 步的具体修复，避免盲修。
- `briefingStage` 拆分为双 key 涉及 digest 侧既有行为，需回归 `briefing.spec.ts` / `briefing-generation.spec.ts`。
- 删除 IPC 的文件路径必须限制在学习库简报目录内（防路径穿越）。
- ErrorBoundary 文案需含可操作入口（重试/返回首页），符合 ui-styling §2。
