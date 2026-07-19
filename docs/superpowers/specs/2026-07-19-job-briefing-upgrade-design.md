# 求职简报整体升级设计（个人档案 + 三级漏斗串行管道）

- 日期：2026-07-19
- 状态：待实现
- 前置：`docs/superpowers/specs/2026-07-11-job-briefing-design.md`（初版，已实现）
- 范围：`electron/lib/job-briefing.ts`、`electron/lib/search.ts`、`electron/prompts/job-briefing/*`、`src/types/index.ts`、`src/store/index.ts`、`electron/ipc/state.ts`、Settings 求职档案面板、`src/components/job-briefing/*`

## 1. 背景与问题

初版求职简报无法完成求职信息辅助功能，三个失败点：

1. **无个人背景**：没有任何用户建模，无法做岗位适配（「与我最适配的是哪个」无从谈起）。
2. **无时效性**：搜索查询无时间窗、无信源分层，泛搜结果被 LLM 自由分拣，「百度刚开秋招」「字节 AI PM 线下活动」这类**事件级**动态被淹没，输出碎片化。
3. **无备战内容**：缺少当前市场真实考察点（源于求职社区的高频面试问题）。

## 2. 用户模型（需求建模结论）

- **用户画像**：AI 产品方向求职者，当前意向**模型产品**（大模型/Agent 产品经理），秋招季主动求职。
- **信息需求**（按优先级）：
  1. **事件级时效情报**——「谁先开了」比「开了什么」更重要：秋招开启、新发岗位、线下活动、宣讲会。
  2. **个性化适配**——岗位列表不是目的，「哪条与我匹配、为什么」才是。
  3. **备战内容**——源于求职社区（牛客/知乎/小红书）的真实面经高频问题，针对其模型产品方向。
- **阅读偏好**：报告必须是一条**串行叙事线**——今天谁开了 → 这轮释放的岗位里什么最适合我 → 针对这些岗位该准备什么题。拒绝并行松散的板块堆砌。
- **触发方式**：维持手动触发（每日缓存复用不变）。

## 3. 目标

1. 新增求职档案（JobProfile）：结构化表单 + 自由文本，注入简报生成全流程。
2. 三级漏斗串行搜索管道：新动态 → 焦点岗位深挖 → 面经聚焦，层级间数据驱动聚焦。
3. 四板块叙事线输出：今日新动态 → 与你最适配的岗位 → 高频考察问题 → 趋势解读。
4. 时效性在搜索参数层根治：所有查询带时间窗（`days`），求职社区用域名定向（`includeDomains`）。
5. 真实链路验证迭代：实现后用真实 Tavily + Kimi 生成并检查渲染结果，迭代记录存档于本 spec 附录。

## 4. 非目标

1. 不改变手动触发方式；不做定时/自动生成。
2. 不改动 AI 日报、Anthropic 博客两个来源。
3. 官方招聘页抓取层逻辑不变（仍仅当配置了 `careerPageUrl` 才触发；默认公司均未配置，该层实际不激活）。
4. 不做投递、简历管理等招聘平台功能。
5. 高频问题不含完整参考答案，只到「考察意图 + 准备要点」。

## 5. 数据模型

### 5.1 JobProfile（新增持久化字段）

存 `~/.studyparlor/state.json`，与学习用 `Profile` 完全隔离：

```ts
type JobProfile = {
  targetRoles: string[]    // 意向岗位，如 ["模型产品经理", "AI产品经理"]
  direction: string        // 方向描述，如 "大模型/Agent 产品，偏评测与平台"
  skills: string[]         // 技能清单，如 ["提示词工程", "RAG", "数据分析"]
  experience: string       // 经历摘要（自由文本，项目/实习/学历）
  additionalNotes: string  // 补充说明（自由文本，如 "只要北上深"）
  updatedAt: string        // ISO 时间戳；空档案时为 ""
}
```

- 默认值：全部为空（`targetRoles: []`、`direction: ''` 等），旧 `state.json` 自动兼容（General Rule 8）。
- **空档案不阻断生成**：综合 prompt 中档案段替换为「用户未提供背景，按通用 AI 产品求职者处理」；「为什么适合你」改为「岗位亮点」；UI 在简报页提示补充档案。
- 判断空档案：`targetRoles` 为空且 `direction` 为空且 `experience` 为空。

### 5.2 管道中间数据（主进程内部，不持久化）

```ts
type JobEvent = {
  company: string
  eventType: '秋招开启' | '新岗位' | '线下活动' | '宣讲会' | '其他'
  title: string
  date: string         // 事件日期，LLM 从来源推断；推断不出为 ""
  summary: string
  url: string
}

type MatchedJob = RawJob & {
  matchLevel: 1 | 2 | 3 | 4 | 5   // 与 JobProfile 的匹配度
  matchReason: string              // 「为什么适合你」
  sourceEventTitle?: string        // 溯源：来自哪条新动态（第 2 级聚焦自该事件的公司时填写）
}

type InterviewQuestion = {
  question: string
  intent: string        // 考察意图
  prepTip: string       // 准备要点
  frequency: string     // 如 "出现 6 次"（LLM 基于聚合结果估算）
  companies: string[]   // 出现在哪些公司面经中
  url: string           // 原文链接
}
```

## 6. 搜索层扩展（`electron/lib/search.ts`）

`searchWeb` 新增可选参数，向后兼容：

```ts
type TavilySearchOptions = {
  query: string
  apiKey: string
  baseUrl?: string
  maxResults?: number
  signal?: AbortSignal
  days?: number              // 新增：Tavily 时间窗（天）
  includeDomains?: string[]  // 新增：域名定向
}
```

请求体在参数存在时加入 `days` / `include_domains` 字段；不传则不出现该字段（现有调用方零影响）。

## 7. 三级漏斗串行管道（`electron/lib/job-briefing.ts` 重构）

```
第 1 级 · 新动态发现 (discoverEvents)
  per-company（enabled 公司逐个）:
    "{company} 秋招 校招 开启 宣讲会 线下活动 招聘"  days=7, maxResults=5
  社区定向:
    "AI产品 秋招开启 校招 汇总"  includeDomains=[nowcoder.com, yingjiesheng.com]  days=7
  → LLM 结构化提取 → JobEvent[]（extract → sanitize → 形状校验，LLM Rule 4）
  → 去重（company + title 相似）

第 2 级 · 焦点岗位深挖 (discoverJobs，依赖第 1 级)
  焦点公司 = 有新鲜事件的公司 ∩ enabled 关注列表
  回退：当天无事件 → priority 前 5 的 enabled 公司
  per 焦点公司:
    "{company} {targetRoles.join(' ')} 招聘 校招 2026"  days=30, maxResults=5
    （空档案时用 config.roleKeywords 替代 targetRoles）
    若该公司配置了 careerPageUrl → 官方抓取结果一并并入（现有 extract 复用）
  → extractJobsFromHtml（复用现有）→ mergeAndDedupJobs
  → LLM 按 JobProfile 评估匹配度 → MatchedJob[]（Top 10）
  → 焦点公司来自某事件时填 sourceEventTitle 溯源

第 3 级 · 面经聚焦 (discoverQuestions，依赖第 2 级)
  per 焦点公司（最多 3 家）:
    "{company} {direction 或 targetRoles[0]} 面经 面试题"
    includeDomains=[nowcoder.com, zhihu.com, xiaohongshu.com]  days=90, maxResults=5
  → LLM 聚合 → InterviewQuestion[]（Top 8）
  回退：焦点公司面经全空 → "{direction 或 'AI产品经理'} 面经 高频问题" 通用聚合

综合生成 (synthesize)
  prompt 注入：JobProfile 全文 + events JSON + matchedJobs JSON + questions JSON
  → 一次 LLM 调用（thinking enabled, reasoning_effort: high）→ 四板块 Markdown
```

**降级规则**（每级独立容错，Feature Rule 4）：

| 失败点 | 行为 |
|---|---|
| 第 1 级无事件 | 新动态板块写「今日关注公司暂无新动态」，第 2 级回退泛搜，报告不为空 |
| 第 1 级搜索全失败 | `sourceStatus.events = 'failed'`，同上回退 |
| 第 2 级某公司无岗位 | 跳过该公司；全部为空 → 适配板块显示「本期暂无」，`sourceStatus.jobs = 'failed'` |
| 第 3 级无面经 | 回退通用高频问题；仍空 → 板块显示「本期暂无」 |
| LLM 提取/聚合失败 | 该级原始结果丢弃，按上级失败处理；debug 文件写 `~/.studyparlor/debug/` |

**取消**：整个管道共享一个 `AbortController`（沿用现有 `signal` 透传），UI 可随时取消。

**进度阶段**（`JobBriefingStage` 重新定义）：`scanning-events`（扫描新动态）→ `digging-jobs`（深挖焦点岗位）→ `aggregating-questions`（聚合面经）→ `synthesizing`（综合生成）→ `finalizing` → `done`。旧阶段名 `discovering`/`scraping`/`searching` 全部移除（跨层同步删除）。

### 7.1 查询入参总表

| 级 | 查询模板 | days | 域名定向 | 数量 |
|---|---|---|---|---|
| 1 | `{company} 秋招 校招 开启 宣讲会 线下活动 招聘` | 7 | 无 | 每 enabled 公司 1 条 |
| 1 | `AI产品 秋招开启 校招 汇总` | 7 | nowcoder.com, yingjiesheng.com | 1 条 |
| 2 | `{company} {targetRoles} 招聘 校招 2026` | 30 | 无 | 每焦点公司 1 条 |
| 3 | `{company} {direction} 面经 面试题` | 90 | nowcoder.com, zhihu.com, xiaohongshu.com | 焦点公司 ≤3 条 |
| 3 回退 | `{direction} 面经 高频问题` | 90 | 同上 | 1 条 |

时间窗取值理由：新动态要「最先知道」取 7 天；岗位释放周期较长取 30 天；面经积累慢取 90 天。

## 8. 综合 prompt 与输出契约（`electron/prompts/job-briefing/synthesize.md` 重写）

正文必须包含四个一级板块，顺序固定：

```markdown
## 今日新动态
- **[秋招开启] 腾讯** · 2026-07-19 — 2027 届秋招正式启动，AI 产品线首批放出…
  [原文链接](url)

## 与你最适配的岗位
### [★★★★★] 腾讯 · 模型产品经理（校招）
- **城市**: 深圳
- **源自**: [秋招开启] 腾讯 · 2027 届秋招正式启动（今日新动态）
- **JD 要点**: ...
- **为什么适合你**: 你的 RAG 项目经历直接对应 JD 第 2 条…
- **来源**: [投递链接](url)
> 💭 **准备建议**: ...

## 高频考察问题
1. **如何为多解问题确定评测指标？**（出现 6 次 · 腾讯/字节模型产品面经 · [原文](url)）
   - 考察意图: ...
   - 准备要点: ...

## 趋势解读
（2-3 段，聚焦本期焦点公司释放的信号，不泛泛而谈）
```

**契约要点**（LLM Rule 5）：

- 岗位卡片**必须**标注溯源：来自今日新动态的公司写 `- **源自**: [事件类型] 公司 · 事件标题（今日新动态）`；来自回退泛搜的写 `- **源自**: 关注列表常规检索`。用户要一眼看出岗位是否来自今日新动态。
- 岗位必须有投递/原文链接；高频问题必须有原文链接。全部标准 markdown 链接 `[text](url)`。
- 星级 = 与 JobProfile 的匹配度（1-5）；空档案时星标题改为 `[推荐]`，「为什么适合你」改为「岗位亮点」。
- 新动态按日期倒序；事件日期未知的排在最后。
- 禁止装饰性标题、JSON、代码块包裹正文；无内容的板块写「本期暂无」而非省略标题。
- 趋势解读必须引用本期 events/jobs 中的具体信号，禁止通用行业套话。

## 9. 渲染（`src/components/job-briefing/*`）

- **今日新动态** → 时间线条目：事件类型徽标（不同 eventType 不同颜色）+ 公司加粗 + 日期 + 摘要 + 可点击外链。
- **与你最适配的岗位** → 复用现有卡片样式，新增「源自」溯源行（今日新动态的用 ember 色高亮）、「为什么适合你」段落；星级为匹配度。
- **高频考察问题** → 有序列表卡片：题面 + 频次/公司/原文链接，考察意图与准备要点默认折叠可展开（`<details>` 或手风琴）。
- **趋势解读** → 普通段落 + 左侧高亮边框（沿用现有）。
- 全部外链 `target="_blank" rel="noopener noreferrer"`（UI Rule 5）。
- 空档案时主内容区顶部显示可关闭提示条：「完善求职档案以获得个性化适配 → 去设置」。

## 10. 设置页：求职档案面板

- Settings 页新增「求职档案」折叠面板，与现有「求职简报」配置面板并列。
- 字段：意向岗位（tag 输入）、方向描述（单行）、技能清单（tag 输入）、经历摘要（多行文本框）、补充说明（多行文本框）。
- 保存即写 `state.json` 的 `jobProfile` 并更新 `updatedAt`；下次生成简报生效。
- 不提供「恢复默认」（默认即空）。

## 11. 跨层同步清单（General Rule 2）

按顺序更新：

1. `src/types/index.ts`：`JobProfile`、`JobEvent`、`MatchedJob`、`InterviewQuestion`、`JobBriefingStage` 新值（删旧值）、`JobBriefingSourceStatus` 改为 `{ events, jobs, questions, official }`、`IpcApi` 中 state 读写覆盖 `jobProfile`（走现有 state 通道，不新增 IPC）。
2. `electron/ipc/state.ts`：`DEFAULT` 新增 `jobProfile` 空默认值。
3. `electron/lib/search.ts`：`days` / `includeDomains` 参数。
4. `electron/lib/job-briefing.ts`：三级漏斗重构。
5. `electron/prompts/job-briefing/`：`synthesize.md` 重写；新增 `extract-events.md`、`match-jobs.md`、`aggregate-questions.md`（均含格式禁令与负面示例）。
6. `src/lib/job-briefing-defaults.ts`：新增 `DEFAULT_JOB_PROFILE`。
7. `src/store/index.ts`：`jobProfile` state + `updateJobProfile` action；`briefingStage` 新阶段文案。
8. 组件：`JobBriefingRenderer` 扩展、Settings 求职档案面板、空档案提示条；`Briefing.tsx` Header 的 `sourceStatus` 读取改为新 shape（旧 `.tavily` 键移除）。
9. 测试。

`jobProfile` 读写复用现有 `state:get`/`state:set` 通道，**不新增 IPC**（YAGNI）。

## 12. 错误处理

沿用现有错误码，新增/调整：

| 错误码 | 场景 | 行为 |
|---|---|---|
| `MISSING_SEARCH_KEY` | 未配置 Tavily key | 提示去 Settings 配置（不变） |
| `NETWORK_ERROR` | Tavily 超时/非 2xx | 重试按钮（不变） |
| `EXTRACTION_ERROR` | 某级 LLM 提取/聚合失败 | 该级按失败降级，写 debug 文件 |
| `EMPTY_RESULTS` | 三级全部无有效内容 | 显示「今日暂无求职信息」+ 重试 |
| `CACHE_WRITE_FAILED` | 缓存写入失败 | 返回内容，标记 `cacheWriteFailed`（不变） |

部分失败继续生成，失败级进入 `sourceStatus`（UI Rule 3：只在 Header 暴露异常）。

## 13. 测试计划

### 13.1 单元测试（`tests/job-briefing.test.ts` 扩展）

- `searchWeb`：`days`/`includeDomains` 参数正确进请求体；不传时不出现该字段。
- 查询构建：三级查询模板、焦点公司选择（有事件/无事件回退）、空档案时 targetRoles 回退 roleKeywords。
- 事件去重、LLM 提取输出形状校验（缺字段/畸形 JSON/空数组）。
- `JobProfile` 默认值与旧 `state.json` 兼容。
- sourceStatus 构建（各级失败组合）。

### 13.2 组件测试

- `JobBriefingRenderer`：四板块渲染、溯源行高亮、问题折叠展开、外链属性、空档案提示条、「本期暂无」板块。

### 13.3 E2E

- mock 链路：生成 → 断言四板块与溯源标注；档案填写后重新生成断言适配内容变化。
- `@real` 真实链路：真实 Tavily + Kimi 回归。

### 13.4 真实链路验证迭代（本 spec 核心验收手段）

实现完成后，用真实 API 走完整管道生成一份简报，读取生成的 md 与渲染结果，按以下检查表验收：

1. 新动态含近 7 天事件，事件类型正确，有原文链接。
2. 适配岗位与 JobProfile 相关，溯源标注正确（今日新动态 vs 常规检索）。
3. 高频问题源于求职社区，有考察意图/准备要点/原文链接。
4. 四板块齐全、叙事线连贯（岗位确来自新动态的焦点公司）。
5. 降级路径：人为断掉某级，报告其余板块正常。

迭代轮次记录于附录 A（每轮：发现的问题 → 调整 → 结果）。

## 14. 验收标准

- [ ] Settings 出现「求职档案」面板，五字段可填可存，重启后保留。
- [ ] 空档案可正常生成（通用模式），填写档案后岗位出现匹配度星级与「为什么适合你」。
- [ ] 新动态板块含事件类型徽标、日期、原文链接，内容为近 7 天事件。
- [ ] 岗位卡片标注溯源，来自今日新动态的高亮。
- [ ] 高频问题板块含频次、考察意图、准备要点、原文链接，可折叠展开。
- [ ] 某级失败时对应板块显示「本期暂无」且 sourceStatus 正确。
- [ ] 旧 `state.json` 升级自动兼容。
- [ ] 真实链路验证检查表 5 项全过，迭代记录存档于附录 A。

## 15. 规则对应

- **General 1**：外部数据缺字段/空结果全部防御；空档案显式分支。
- **General 2**：跨层同步清单 §11；`JobBriefingStage` 旧值全层删除。
- **General 4 / LLM 4-5**：所有 LLM 输出走提取→校验；prompt 含格式禁令与负面示例。
- **General 5 / Feature 9**：空数据、部分失败、旧缓存兼容、跨重启持久化全覆盖。
- **General 7**：管道单 AbortController，UI 可取消；进度阶段可见。
- **General 8**：`jobProfile` 空默认值，旧 state 兼容。
- **Feature 3-4**：错误码域化；网络失败与空数据区分。
- **UI 3/5/8/9**：状态只暴露异常；外链规范；全局 Chrome 不变；渲染扩展不影响其他两源。

## 16. 参考

- `docs/superpowers/specs/2026-07-11-job-briefing-design.md`（初版）
- `electron/lib/job-briefing.ts`、`electron/lib/search.ts`
- `src/components/job-briefing/`、`src/pages/Briefing.tsx`

## 附录 A · 真实链路验证迭代记录

（实现后填写。每轮格式：）

```
### 迭代 N（YYYY-MM-DD）
- 输入档案：...
- 发现的问题：...
- 调整：...
- 结果：...
```
