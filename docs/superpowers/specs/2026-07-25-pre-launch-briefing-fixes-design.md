# 夜航简报上线前修复 · 设计文档

日期：2026-07-25
状态：待批准
范围：夜航简报全链路（digest / job-briefing / article-assistant / writing）

## 1. 背景

上线前代码审查发现三个维度的缺陷，需要在上线前修复：

1. **运行时 Bug**：`extractJsonObject` fallback 永远不命中、`fetchPageHtml` BrowserWindow 无并发限制、`chatNonStream` 超时无 error code、简报缓存非原子写入
2. **LLM 入参不当**：Kimi thinking=disabled 时 temperature 被静默覆写为 0.6（影响 5 个 extraction 调用 + guide 生成）、`discoverQuestions` 未使用 per-company 查询、synthesis 和 match-jobs 的 reasoning_effort 可用 max
3. **存档与持久化缺陷**：简报缓存非原子写入、`briefingRead` 删除时无 GC、Writing catalog 摘要生成无 UI 反馈

## 2. 决策总表

| # | 修复项 | 裁决 | 风险 |
|---|---|---|---|
| F1 | Extraction 任务启用 thinking | ✅ 全部启用 | 80K HTML + thinking tokens 增加，但 300s 超时 + 准确性提升抵消 |
| F2 | Synthesis / match-jobs reasoning_effort→max | ✅ | 已有独立 300s 计时器 |
| F3 | Guide 生成加 thinking=max | ✅ | — |
| F4 | `generateWritingSummary` 加 thinking | ✅ | — |
| F5 | 简报缓存原子写入 | ✅ temp+rename | 零风险，与 annotations.ts 一致 |
| F6 | `extractJsonObject` fallback | ✅ 移除 `$` 锚点 | JSON.parse 验证兜底 |
| F7 | `discoverQuestions` per-company 查询 | ✅ 并行 3 条 | Tavily 调用从 1→3，上限受 `focus.slice(0,3)` 控制 |
| F8 | BrowserWindow 并发限制 | ✅ 信号量 max=2 | 抓取稍慢但更稳定 |
| F9 | `chatNonStream` 超时加 error code | ✅ 加 `code: 'TIMEOUT'` | 零风险，与 `chatStream` 一致 |
| F10 | `briefingRead` GC on delete | ✅ 从路径提取日期清理 | 零风险 |
| F11 | Writing catalog 摘要 UI 反馈 | ✅ 空摘要时显示提示文案 | 不新增持久化字段 |
| F12 | 补 E2E 测试缺口 | ✅ 3 个新 spec | 走 mock 路径，不依赖外部 API |

## 3. 详细设计

### F1 · Extraction 任务启用 thinking

**问题**：`buildChatBody`（`electron/lib/kimi.ts:64-66`）在 Kimi thinking=disabled 时强制设置 `body.temperature = 0.6`，覆盖调用方传入的 temperature。以下 5 个 extraction 调用传 `temperature: 0.3` 但实际收到 `0.6`：

- `extractJobsFromHtml`：从 HTML 提取岗位 JD
- `runQuestionQuery`：从面经聚合面试题
- `generateJobBriefingKeywords`：从档案生成搜索词
- `generateArticleSearchQuery`：从文章生成搜索查询
- `generateWritingSummary`：生成文章摘要

0.6 的 temperature 让结构化提取更随机，可能编造 JD、面试题、搜索词。

**修复**：给以上 5 个调用全部改为 `thinking: { type: 'enabled' }`。结构化提取本身受益于推理能力——提取岗位要求、判断面经真实性、从档案推导搜索方向，都是需要"想一下"的任务。

**受影响文件**：
- `electron/lib/job-briefing.ts`：L272, L339(追加 reasoning_effort), L542, L569, L594
- `electron/lib/llm-tasks.ts`：L343-349

### F2 · Synthesis / match-jobs reasoning_effort → max

**问题**：`matchJobsToProfile` 和 `synthesize` 是简报质量最关键的两个 LLM 调用，前者决定岗位推荐的精准度，后者决定最终报告的可读性和洞察力。两者均使用 `reasoning_effort: 'high'`，可用 `'max'` 进一步提升。

**修复**：两个调用点的 `reasoning_effort: 'high'` → `'max'`。`synthesize` 已有独立 300s 超时，`'max'` 不会导致额外超时风险。

**受影响文件**：`electron/lib/job-briefing.ts` L475, L779

### F3 · Guide 生成加 thinking=max

**问题**：`articleAssistant:generateGuide`（`electron/ipc/article-assistant.ts:256-262`）调用 `chatNonStream` 时未传 `thinking` 参数。在 Kimi 上默认走 thinking=disabled 路径，temperature 从 0.7 被覆写为 0.6。

导读需要理解文章结构、识别关键术语、写出准确的中文摘要——是典型的 reasoning 密集型任务。

**修复**：追加 `thinking: { type: 'enabled', reasoning_effort: 'max' }`。

**受影响文件**：`electron/ipc/article-assistant.ts` L256-262

### F4 · Writing 摘要生成加 thinking

**问题**：`generateWritingSummary`（`electron/lib/llm-tasks.ts:343-349`）同样未传 `thinking`，temperature 被覆写。摘要虽短（≤40字），但需要准确概括文章内容。

**修复**：追加 `thinking: { type: 'enabled' }`（不需要 max，摘要任务相对简单）。

### F5 · 简报缓存原子写入

**问题**：Digest 和 Job 简报的缓存写入用 `fs.writeFileSync` 直接写目标路径。如果应用在写入中途崩溃（例如断电、进程被杀），缓存文件损坏，下次读取时 `parseFrontmatter` 抛异常——用户看到白屏或错误页。

对比 `electron/ipc/annotations.ts:118-122` 已使用 temp+rename 原子模式。

**修复**：
```ts
// Before
fs.writeFileSync(filePath, content, 'utf8')

// After
const tmpPath = filePath + '.tmp'
fs.writeFileSync(tmpPath, content, 'utf8')
fs.renameSync(tmpPath, filePath)
```
`renameSync` 在 POSIX 和 Windows 上都是原子操作——要么旧文件完整保留，要么新文件完整替换。

**受影响文件**：
- `electron/ipc/briefing.ts` L515（digest 简报缓存）
- `electron/lib/job-briefing.ts` L817（job 简报缓存）
- E2E mock 路径中的 `fs.writeFileSync`（`electron/ipc/briefing.ts:388`、`electron/ipc/job-briefing.ts:145`）也需要统一

### F6 · extractJsonObject fallback 修复

**问题**：`electron/lib/extract-json.ts:87` 的 fallback 正则：
```ts
const fallback = text.slice(start).match(/\{[\s\S]*?\}(?=\s*$)/)
```
`(?=\s*$)` 要求 `}` 在字符串末尾（允许后有空白）。LLM 输出几乎永远在 JSON 后有额外文本（"以上是提取结果" 等），所以 fallback 从不命中。主解析失败 → 直接返回 `null` → 上层 `EXTRACTION_ERROR`，整条生成链中断。

**修复**：移除 `$` 锚点，改为从最后一个 `}` 切分：
```ts
// 找到最后一个 }
const lastBrace = text.lastIndexOf('}')
if (lastBrace > start) {
  const candidate = text.slice(start, lastBrace + 1)
  try {
    JSON.parse(candidate)
    return candidate
  } catch { /* fall through to return null */ }
}
```
只比原来多一个 `lastIndexOf` + `JSON.parse` 验证，不被坏数据欺骗。

**受影响文件**：`electron/lib/extract-json.ts` L84-95

### F7 · discoverQuestions 使用 per-company 查询

**问题**：`buildQuestionQueries`（`electron/lib/job-briefing.ts:504-514`）已为前 3 个焦点公司生成针对性查询（如 "字节跳动 AI产品经理 面经 面试题"），但 `discoverQuestions`（L616-634）完全未使用它——只用了一个通用查询 `${direction} 面经 面试题 高频`。公司针对性丢失。

**修复**：`discoverQuestions` 改为使用 `focus` 参数（需要调用方传入），对 `buildQuestionQueries` 的结果并行执行 `runQuestionQuery`，合并去重：

```ts
export async function discoverQuestions(
  cfg: AppConfig,
  profile: JobProfile,
  config: JobBriefingConfig,
  focus: FocusCompany[],  // 新参数
  opts: { apiKey: string; signal?: AbortSignal }
): Promise<InterviewQuestion[]> {
  const queries = buildQuestionQueries(focus, profile, config)
  const results = await Promise.all(
    queries.map(q =>
      runQuestionQuery(cfg, q.query, { ...opts, includeDomains: q.includeDomains })
        .catch(err => { console.warn(...); return [] as InterviewQuestion[] })
    )
  )
  return dedupQuestions(results.flat())
}
```

调用方 `generateJobBriefing` L747 传入 `focus`。

**受影响文件**：
- `electron/lib/job-briefing.ts`：`discoverQuestions` 签名 + 实现
- `electron/lib/job-briefing.ts`：`generateJobBriefing` L747 调用点

### F8 · BrowserWindow 并发限制

**问题**：`generateJobBriefing` 对每个焦点公司循环调用 `fetchPageHtml`。`fetchPageHtml` 在普通 HTTP 失败时走 browser fallback——创建隐藏 `BrowserWindow`（`offscreen: true`）加载页面。5 个公司同时 browser fallback = 5 个隐藏 Electron 窗口并发，在 Windows 上可能资源竞争。

**修复**：添加一个简单的信号量：
```ts
const browserSemaphore = new Semaphore(2)
// 在循环中：
await browserSemaphore.acquire()
try {
  const html = await fetchPageHtml(companyCfg.careerPageUrl, { signal, useBrowserFallback: true })
  // ...
} finally {
  browserSemaphore.release()
}
```
Semaphore 是几行代码的轻量实现（基于 Promise 队列），不需要引入依赖。

**受影响文件**：`electron/lib/job-briefing.ts`，`generateJobBriefing` 函数中的官方页面抓取循环

### F9 · chatNonStream 超时加 error code

**问题**：`chatNonStream` 内部 300s 超时（`electron/lib/kimi.ts:90-92`）：
```ts
const timeoutId = setTimeout(() => ctl.abort(), TIMEOUT_MS)
```
abort 后 `fetch` 抛出 `AbortError`。`chatNonStream` 不设 `code` 属性，`toJobErrorCode` 只能匹配 `err.name === 'AbortError'`（已处理，映射为 `TIMEOUT`）。但如果外层 `synthesize` 的独立 300s 超时先于内层触发，`opts.signal.aborted` 被检测到后抛出 `new Error('ABORTED')`——这个错误不带 `code` 也不叫 `AbortError`，被 `toJobErrorCode` 映射为 `NETWORK_ERROR`。

对比 `chatStream`（L217-220）正确设置了 `err.code = 'TIMEOUT'`。

**修复**：在 `chatNonStream` 的超时回调中也设 `code`：
```ts
const timeoutId = setTimeout(() => {
  const err = new Error('Request timeout after 300000ms')
  ;(err as any).code = 'TIMEOUT'
  ctl.abort()
}, TIMEOUT_MS)
```
但由于 `AbortController.abort()` 不接受参数，`fetch` 只会抛 `AbortError`。正确的修法是：不在 `setTimeout` 中 abort，而是在 catch 中检查超时：
```ts
// 在 catch 中：
if (timedOut) {
  const e: any = new Error(`Request timeout after ${TIMEOUT_MS}ms`)
  e.code = 'TIMEOUT'
  throw e
}
```
需要加一个 `timedOut` 标记变量，模式与 `chatStream`（L173-175, L257-259）一致。

**受影响文件**：`electron/lib/kimi.ts` L90-135

### F10 · briefingRead GC on delete

**问题**：`briefingRead` 记录用户已阅读的简报日期。删除简报时，对应的 read 条目不清理。如果用户频繁删除/重新生成（例如测试），`briefingRead` 数组持续增长到 `slice(-120)` 上限。

**修复**：在 `deleteBriefings` 和 `deleteJobBriefings` 中，从文件路径提取日期并清理：
```ts
// deleteBriefings
const datesToRemove = new Set(
  filePaths.map(p => {
    const m = p.match(/夜航简报-(\d{4}-\d{2}-\d{2})\.md$/)
    return m?.[1]
  }).filter(Boolean)
)
if (datesToRemove.size > 0) {
  const cur = get().briefingRead
  const next = { ...cur, digest: cur.digest.filter(d => !datesToRemove.has(d)) }
  set({ briefingRead: next })
  await ipc.patchState({ briefingRead: next } as Partial<StateJson>)
}
```
Job 简报同理，匹配模式 `求职简报-YYYY-MM-DD.md`。

**受影响文件**：`src/store/index.ts` L687-696, L741-750

### F11 · Writing catalog 摘要 UI 反馈

**问题**：`writing:write` 和 `writing:importFiles` 成功后通过 `setTimeout` 触发 `generateWritingSummary`，失败时 `catch { /* silent */ }`。用户看不到摘要生成状态。

`WritingTree` 组件已在 hover 时显示 `node.summary`，但无摘要时什么都不显示——用户不知道是"正在生成中"还是"生成失败了"。

**修复**（最小方案）：
1. `electron/ipc/writing.ts`：在 fire-and-forget 之前先在 catalog 写一个空摘要占位（`updateEntry` with `summary: ''`）。LLM 成功后再覆盖为真实摘要。失败时保留空摘要。
2. `src/components/writing/WritingTree.tsx`：hover 时若 `!node.summary`，显示淡色提示 "摘要生成中…"（表示系统已知此文件但尚未生成摘要）。

不新增持久化字段——用 `summary: ''` 作为"pending/未生成"的信号。

**受影响文件**：
- `electron/ipc/writing.ts` L78-85, L113-121
- `src/components/writing/WritingTree.tsx` L152

### F12 · 补 E2E 测试缺口

新增 3 个 E2E spec，覆盖上线前审查中发现的关键盲区：

#### Spec 1: `e2e/specs/briefing-annotations-persistence.spec.ts`
- **场景**：生成简报 → 选中文字做标注 → 保存 → 关闭应用 → 重新打开 → 进入同一简报 → 验证标注仍存在
- **标签**：`@p1`
- **走 mock 路径**：不依赖外部 API
- **验证点**：`ipc.annotationsRead` 返回持久化的标注、DOM 中存在 `data-testid="anno-marked-text"` 元素

#### Spec 2: `e2e/specs/briefing-assistant-session-persistence.spec.ts`
- **场景**：生成简报 → 打开旁注面板 → 发消息 → 收到回复 → 切换到 writing 源 → 切回 digest → 验证对话历史恢复
- **标签**：`@p1`
- **走 mock 路径**
- **验证点**：消息列表中仍有历史消息、`.assistant.md` 文件存在

#### Spec 3: `e2e/specs/briefing-delete-cleanup.spec.ts`
- **场景**：生成简报 → 做标注 → 删简报（通过日期列右键菜单）→ 确认删除 → 验证 `.annotations.md` `.assistant.md` `.guide.md` 三个 sibling 文件均已删除
- **标签**：`@p1`
- **走 mock 路径**
- **验证点**：`fs.existsSync` 对三个 sibling 路径均返回 `false`

## 4. 测试策略

### 单元测试
- `tests/article-assistant/json-extract.test.ts`：确保 F6 fallback 修复后现有 9 个 case 仍然 PASS
- `tests/job-briefing.test.ts`：确保 F1/F2/F7 不影响现有测试
- `tests/briefing.test.ts`：确保 F5 原子写入不影响缓存读写

### E2E 测试
- 新增 3 个 spec（F12）
- 现有 12 个 briefing spec 全部回归

### 真实 API 验证
```bash
# 确保真实 API 路径不受 F1/F2 影响
npx playwright test --config e2e/playwright.config.ts briefing-real-api --env E2E_BRIEFING_DISABLE_MOCK=1
npx playwright test --config e2e/playwright.config.ts job-briefing-real
```

## 5. 实现顺序

按依赖关系和风险排列：

1. **F9** `chatNonStream` 超时 error code（基础层修复，其他修复依赖它做正确错误映射）
2. **F6** `extractJsonObject` fallback（基础层修复，LLM 调用的安全网）
3. **F1+F2+F3+F4** LLM 入参修复（核心逻辑层，一起改减少漏改风险）
4. **F5** 缓存原子写入（IO 层修复）
5. **F7** `discoverQuestions` per-company 查询（逻辑增强）
6. **F8** BrowserWindow 并发限制（逻辑增强）
7. **F10** `briefingRead` GC（状态层修复）
8. **F11** Writing catalog UI（渲染层修复）
9. **F12** E2E 测试补充（最后，验证以上修复）
