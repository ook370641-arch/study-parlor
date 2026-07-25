# 求职简报系统优化 — 设计文档

**日期**: 2026-07-25 | **状态**: 待审核

---

## 1. 背景与动机

### 1.1 配额问题

一次求职简报生成消耗 ~40 次 Tavily API 调用。以免费套餐 1000 次/月计，每天跑一次即耗尽月配额。E2E 测试同样调真实 API，进一步加剧消耗。

三轮因子实验（见 `scripts/experiment-final-report.md`）确定了最优策略：Tavily 调用可降至 3 次（↓92.5%），LLM 调用可降至 5 次（↓87.5%），且通过 `thinking=enabled` 将事件提取幻觉率从 2/5 降至 5/5。

### 1.2 设计缺陷

除配额外，存在 5 个独立设计问题：

1. **文章旁注搜索词粗糙**：当前为 `选中文字 + 最后一条消息` 的简单拼接，未利用文章全文、圈画上下文
2. **搜索关键词硬编码**：`buildEventQueries()` 等函数中写死搜索模板，未基于用户档案动态生成
3. **求职档案与全局设置耦合**：档案在 Settings 页面，与 API key、学习库路径等混在一起，且入口深
4. **官方招聘页 URL 不可见**：`discoverCareerPage` 返回的 URL 存入 state 后用户无法查看/编辑
5. **不支持实习/秋招独立切换**：搜索词固定为秋招模式，7 月是实习季但无法调整

### 1.3 目标

- Tavily 调用 40→3 次，LLM 调用 ~40→5 次
- 搜索关键词由 LLM 基于用户档案智能生成，可见可编辑
- 求职档案面板独立于 Settings，仅从求职简报页面进入
- 官方 URL 可视化、可编辑
- 实习/秋招可独立勾选，搜索并行

---

## 2. 类型扩展

### 2.1 `JobBriefingConfig`（`src/types/index.ts`）

```typescript
export type JobBriefingConfig = {
  companies: JobCompany[]
  roleKeywords: string[]
  cities: string[]
  skillKeywords: string[]
  // 新增 ↓
  eventSearchKeywords: string[]   // LLM 生成的动态搜索关键词（可见、可编辑）
  jobSearchKeywords: string[]     // LLM 生成的岗位搜索关键词
  searchInternship: boolean       // 搜索实习/提前批（默认 false）
  searchFallRecruit: boolean      // 搜索秋招/校招（默认 true）
}
```

### 2.2 `JobProfile`（同上）

```typescript
export type JobProfile = {
  targetRoles: string[]
  direction: string
  skills: string[]
  experience: string
  additionalNotes: string
  updatedAt: string
  // 新增 ↓
  keywordsGeneratedAt: string    // 上次关键词生成时间戳
}
```

### 2.3 新增 IPC 签名

```typescript
// 生成搜索关键词
jobBriefingGenerateKeywords: (args: {
  profile: JobProfile
}) => Promise<{ ok: true; eventKeywords: string[]; jobKeywords: string[] }
            | { ok: false; code: 'LLM_ERROR' | 'EMPTY_PROFILE'; message: string }>

// 智能生成文章旁注搜索词（供 article-assistant 内部调用）
jobBriefingGenerateArticleSearchQuery: (args: {
  articleContent: string
  selection?: string
  lastMessage?: string
}) => Promise<{ ok: true; query: string }
            | { ok: false; code: 'LLM_ERROR'; message: string }>
```

### 2.4 默认值（`src/lib/job-briefing-defaults.ts`）

新字段默认值保证旧 state.json 向后兼容：`eventSearchKeywords: []`、`jobSearchKeywords: []`、`searchInternship: false`、`searchFallRecruit: true`、`keywordsGeneratedAt: ''`。

---

## 3. 搜索策略（冻结实验结论）

### 3.1 Tavily 调用：~40 → 3-5 次

①②③ 阶段均按秋招/实习维度解耦——各自独立搜索词，互不干扰。④ 面经不区分维度。

| 阶段 | 当前 | 优化后 | 搜索词 |
|---|---|---|---|
| ① 发现动态 | 11 次 | **1-2 次**（并行） | 秋招、实习各一个搜索词（依据 toggle 勾选） |
| ② 官方招聘页 | 最多 20 次 | **0 次** | 移除独立 Tavily 搜索（URL 由用户预配置或面板手动发现） |
| ③ 岗位搜索 | 5 次 | **1-2 次**（并行） | 秋招、实习各一个搜索词（依据 toggle 勾选） |
| ④ 面经问题 | 最多 4 次 | **1 次** | `"{direction} 面经 面试题 高频"` + nowcoder.com/zhihu.com/xiaohongshu.com 限域 |

搜索参数：`maxResults: 15`（事件）、`maxResults: 10`（岗位/面经）、`days: 14`（事件）、`days: 30`（岗位）、`days: 90`（面经）。

**Tavily 调用数由 toggle 决定**：
- 仅秋招或仅实习：事件 1 + 岗位 1 + 面经 1 = **3 次**
- 秋招 + 实习均勾选：事件 2 + 岗位 2 + 面经 1 = **5 次**（仍 ↓87.5% vs ~40）
- 两项均不勾选：事件 0 + 岗位 1（不区分维度）+ 面经 1 = **2 次**（需在 UI 给出警告）

阶段①和③内部均使用 `Promise.all` 并行执行秋招和实习搜索。

### 3.2 LLM 策略：~40 → 5-7 次

①②③ 按秋招/实习解耦，各自独立提取。④ 面经不区分。

| 阶段 | 次数 | Thinking | 理由 |
|---|---|---|---|
| 事件提取 | 1-2 次（批量，与 Tavily 1:1 对应） | **enabled** | 降低幻觉 2/5→5/5 |
| 岗位提取 | 1-2 次（批量，与 Tavily 1:1 对应） | disabled | 结构化数据无需思考 |
| 面经聚合 | 1 次（批量） | disabled | 同上 |
| 岗位匹配 | 1 次 | enabled, high | 需要深度推理 |
| 综合生成 | 1 次 | enabled, high | 叙事连贯性 |

**LLM 调用数**：秋招+实习均勾选时 7 次，仅勾选一项时 5 次。

阶段①和③内部秋招/实习的 LLM 提取各自独立——避免混合提取导致 eventType 混淆（秋招公告 vs 实习招聘）和 JD 要求混淆（校招岗 vs 实习岗）。面经不区分是因为面试题本身不随招聘类型变化。

### 3.3 搜索词生成逻辑

重构 `buildEventQueries()` 和 `buildFocusJobQueries()`：

```
buildEventQueries(config):
  1. 取 eventSearchKeywords（优先）或 roleKeywords（fallback）
  2. 生成 0-2 个搜索词（根据 toggle）：
     若 searchFallRecruit → "{keywords} 秋招 校招 2026 2027届 {全部公司名} {城市}"
     若 searchInternship → "{keywords} 实习 提前批 2026 2027届 {全部公司名} {城市}"
  3. 每个搜索词带 includeDomains: ['nowcoder.com', 'yingjiesheng.com']
  4. Promise.all 并行执行 → 各返回结果打维度标签

buildFocusJobQueries(config, profile):
  1. 取 jobSearchKeywords（优先）或 roleKeywords（fallback）
  2. 生成 0-2 个搜索词（根据 toggle）：
     若 searchFallRecruit → "{keywords} 秋招 校招 招聘 2026 {全部焦点公司名} {城市}"
     若 searchInternship → "{keywords} 实习 提前批 招聘 2026 {全部焦点公司名} {城市}"
  3. Promise.all 并行执行 → 各返回结果打维度标签
```

①②③ 均遵循：toggle ON → 生成独立搜索词 → 并行 Tavily → 各自 LLM 提取。维度标签贯穿整个管道。

### 3.4 执行流程（秋招+实习均勾选的完整路径）

```
toggle: [✓] 秋招  [✓] 实习

Phase 1 ─────────────────────────────────────
  Tavily (并行):  秋招事件 ×1   +  实习事件 ×1    = 2 次
  LLM   (并行):  秋招提取 ×1   +  实习提取 ×1    = 2 次
  → eventsFallRecruit[] + eventsInternship[]

Phase 3 ─────────────────────────────────────
  Tavily (并行):  秋招岗位 ×1   +  实习岗位 ×1    = 2 次
  LLM   (并行):  秋招提取 ×1   +  实习提取 ×1    = 2 次
  → jobsFallRecruit[] + jobsInternship[]

Phase 4 ─────────────────────────────────────
  Tavily:  面经 ×1                              = 1 次
  LLM:    聚合 ×1                               = 1 次
  → questions[]

Phase 5-6 ───────────────────────────────────
  LLM: 岗位匹配 ×1 (全部岗位去重后统一匹配)
  LLM: 综合生成 ×1 ({eventsFallRecruit} + {eventsInternship}
                    + {jobs} + {questions} + {profile})
```

### 3.5 报告分区

当秋招和实习均勾选时，综合报告中的「今日新动态」板块按维度分两个子区：

```
## 今日新动态

### 秋招/校招
- **[秋招开启] 腾讯** · 2026-07-19 — ...
### 实习/提前批
- **[实习招聘] 字节跳动** · 2026-07-20 — ...
```

仅勾选一项时不显示子标题。综合生成 prompt（`synthesize.md`）接收 `{{eventsFallRecruit}}` 和 `{{eventsInternship}}` 两个独立变量，由 LLM 自行组织叙事。

---

## 4. UI 设计：求职档案面板

### 4.1 入口位置

**方案 A：内容区顶部工具栏**（选定）

- 仅当 `source === 'job-briefing'` 时渲染
- 位于简报标题同行右侧：齿轮图标 +「求职档案」文字
- `data-testid="job-profile-panel-trigger"`

### 4.2 面板形式

右侧滑出抽屉，420px 宽，与 ArticleAssistantPanel 对称。

- 打开：点击齿轮图标
- 关闭：✕ 按钮 / 覆盖层点击 / Esc 键
- 覆盖层：半透明黑色遮罩（点击关闭）
- `data-testid="job-profile-panel"`

### 4.3 面板内容（自上而下）

```
┌─ ⚙ 求职档案 ───────────────────── ✕ ─┐
│                                        │
│ 搜索维度                               │
│  [✓] 秋招/校招    [✓] 实习/提前批      │
│                                        │
│ 个人档案                               │
│  意向岗位 [AI产品经理, 模型产品经理]     │
│  方向描述 [大模型/Agent 产品...]        │
│  技能清单 [RAG, 提示词工程...]          │
│  经历摘要 [AI 产品实习经历...]          │
│  补充说明 [只要北上深杭]                │
│                                        │
│ 搜索关键词                    [🔄 重新生成] │
│  动态搜索                               │
│  [2026秋招 AI产品 ×] [校招 提前批 ×]    │
│  岗位搜索                               │
│  [AI产品经理 校招 ×] [大模型实习 ×]     │
│                                        │
│ 关注公司                    [+ 添加]    │
│  ☑ 1 字节跳动  jobs.bytedance.com  [✏] │
│  ☑ 2 阿里巴巴   talent.alibaba.com [✏] │
│  ☑ 3 腾讯      未发现招聘页      [🔍]  │
│  ☐ 8 月之暗面  未发现招聘页      [🔍]  │
│  [🔄 刷新所有官方招聘页链接]            │
│                                        │
│  [保存档案]  [取消]                    │
└────────────────────────────────────────┘
```

### 4.4 交互细节

- **编辑模式**：所有字段使用本地 `useState`，保存时一次性写入 store + 持久化
- **关键词 tags**：每个 tag 可独立删除（× 按钮），支持手动添加（输入框 + 回车）
- **公司 URL**：已发现显示蓝色链接，未发现显示灰色「未发现招聘页」
- **刷新 URL**：调 `discoverJobBriefingPages()` → Tavily 搜索 → 回填 URL
- **重新生成关键词**：调 `generateJobBriefingKeywords()` → LLM 生成 → 回填 tags
- **档案为空时**：面板入口旁显示「档案完整度 0%」提示，内容区显示引导条（替代当前「去设置」链接）

### 4.5 组件规范

- 面板作为**页面级元素**渲染在 `Briefing.tsx` 中，非条件分支内（ui-styling §8）
- 仅当 `source === 'job-briefing'` 时 `display !== 'none'`
- 遵循学术主题配色：`bg-[#2a1f1a]`、`text-[#e0d5c0]`、`border-[#3a3028]`、accent `#d97757`

---

## 5. Settings 页面清理

- **移除**：「求职档案」section（~70 行：5 个字段 + 保存按钮）
- **移除**：「求职简报」section 中的公司列表子区（checkbox + name + priority + URL indicator）
- **保留**：roleKeywords、cities、skillKeywords 作为快捷入口（可选）
- **新增**：跳转提示——「完整的求职档案（岗位、经历、公司）请在求职简报页面中编辑」

---

## 6. 文章旁注智能搜索

### 6.1 现状

`electron/ipc/article-assistant.ts:460`：
```typescript
const query = [args.selection, args.messages.at(-1)?.content]
  .filter(Boolean).join(' ').trim()
```

### 6.2 新方案

```typescript
// 新函数：electron/lib/job-briefing.ts
export async function generateArticleSearchQuery(
  cfg: AppConfig,
  args: { articleContent: string; selection?: string; lastMessage?: string }
): Promise<string> {
  const prompt = readPrompt('generate-search-query')
    .replace('{{articleContent}}', args.articleContent.slice(0, 3000))
    .replace('{{selection}}', args.selection ?? '')
    .replace('{{lastMessage}}', args.lastMessage ?? '')
  const text = await chatNonStream(cfg, {
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.3,
    thinking: { type: 'disabled' },
  })
  return text.trim()
}
```

### 6.3 调用方式

在 `article-assistant.ts` 中：
```typescript
let query: string
try {
  query = await generateArticleSearchQuery(cfg, {
    articleContent: args.articleContent,
    selection: args.selection,
    lastMessage: args.messages.at(-1)?.content,
  })
} catch {
  // Fallback: 保留旧拼接方式
  query = [args.selection, args.messages.at(-1)?.content]
    .filter(Boolean).join(' ').trim()
}
```

### 6.4 Prompt 设计

`electron/prompts/job-briefing/generate-search-query.md`：
- 输入：文章内容（截断 3000 字）、选中文字、用户最后一条消息
- 输出：一个简洁搜索词（≤15 词）
- 语言跟随文章语言
- 聚焦具体术语/概念，不逐字复述选中内容

---

## 7. 实习/秋招并行

### 7.1 状态

两个布尔 toggle 存储在 `JobBriefingConfig` 中：
- `searchFallRecruit: boolean`（默认 true）
- `searchInternship: boolean`（默认 false）

### 7.2 搜索与提取影响

`buildEventQueries()` 根据 toggles 生成 0-2 个搜索词：
```
维度词 = []
if searchFallRecruit → 追加 "秋招" "校招"
if searchInternship → 追加 "实习" "提前批"
```

每个 toggle 为 ON 的维度生成一个独立搜索词，通过 `Promise.all` 并行执行 Tavily 搜索。

然后对每份搜索结果**单独调 LLM 提取**（thinking=enabled），各自产出 `events[]` 数组打上维度标签（`source: 'fallRecruit' | 'internship'`）。

传给综合生成 prompt 时，秋招和实习事件作为两个独立 JSON 数组注入（`{{eventsFallRecruit}}` / `{{eventsInternship}}`），LLM 在报告中自然分区展示。

### 7.3 报告分区

当两项均勾选时，「今日新动态」板块按维度分两个子区：
```
## 今日新动态
### 秋招/校招
- **[秋招开启] 腾讯** ...
### 实习/提前批
- **[实习招聘] 字节跳动** ...
```
仅勾选一项时不显示子标题，直接列出事件。

### 7.4 UI 表达

面板顶部两个并列 toggle，独立操作，无联动。

---

## 8. 文件变更汇总

| 文件 | 操作 | 内容 |
|---|---|---|
| `src/types/index.ts` | 修改 | 扩展 JobBriefingConfig、JobProfile、IpcApi |
| `src/lib/job-briefing-defaults.ts` | 修改 | 新字段默认值 |
| `electron/lib/job-briefing.ts` | 修改 | 新函数 ×2、重构查询构建器、应用最优策略 |
| `electron/ipc/job-briefing.ts` | 修改 | 新 IPC ×2、重构 generate 流程 |
| `electron/ipc/article-assistant.ts` | 修改 | 智能搜索词替换拼接 |
| `electron/preload.ts` | 修改 | 暴露新 IPC |
| `src/store/index.ts` | 修改 | 新 action、新 state 初始化 |
| `src/pages/Briefing.tsx` | 修改 | 集成 JobProfilePanel、工具栏入口 |
| `src/pages/Settings.tsx` | 修改 | 移除求职档案 section + 公司列表 |
| `src/components/job-briefing/JobProfilePanel.tsx` | **新建** | 求职档案抽屉面板 |
| `electron/prompts/job-briefing/generate-keywords.md` | **新建** | 关键词生成 prompt |
| `electron/prompts/job-briefing/generate-search-query.md` | **新建** | 文章搜索词生成 prompt |
| `src/components/job-briefing/index.ts` | 修改 | 导出 JobProfilePanel |

---

## 9. 向后兼容

1. 旧 `state.json` 无新字段 → `normalizeJobBriefingConfig()` 补默认值
2. 旧 `jobProfile` 无 `keywordsGeneratedAt` → 默认 `''`
3. 已缓存的求职简报 `.md` 文件不受影响（仅渲染内容）
4. `job-briefing:generate` IPC 参数不变（profile 仍从 state 读取）
5. Settings 页面移除的字段自动迁移：已保存的 jobProfile/jobBriefingConfig 数据仍在 state.json 中，面板首次打开即可读取

---

## 10. 验证清单

- [ ] `npm run build` 通过
- [ ] `npm run test` 通过
- [ ] 切换到求职简报 → 齿轮图标可见 → 点击打开面板
- [ ] 编辑档案 → 保存 → 关闭面板 → 重新打开 → 数据持久化
- [ ] 点击「重新生成关键词」→ LLM 生成 → tags 更新
- [ ] 切换实习/秋招 toggle → 生成简报 → 验证搜索词反映选择
- [ ] 文章旁注中开启搜索 → 验证 query 由 LLM 生成（含文章内容上下文）
- [ ] Settings 页面不再显示求职档案 section
- [ ] 旧 state.json 启动无报错，面板显示默认值
- [ ] E2E mock 适配新搜索策略

---

## 附录 A：实验数据引用

以下数据来自 `scripts/experiment-final-report.md`（2026-07-25 因子实验），作为搜索策略和 LLM 配置的决策依据。

### A.1 搜索词效果对比（K × G 因子，9 组）

| 排名 | 策略 | 调用 | 相关性/5 | 可操作率 | 公司覆盖 | 综合分 |
|---|---|---|---|---|---|---|
| **1** | **K3-混合-G3-合并** | 1 次 | **2.40** | 40% | 8/10 | **62.9** |
| 2 | K1-秋招-G1-逐公司（当前） | 11 次 | 2.04 | 18% | 10/10 | 51.1 |
| 3 | K2-实习-G2-双层 | 2 次 | 2.20 | 40% | 7/10 | 47.2 |

**实验中使用的实际搜索词**：

```
K3-混合: "AI产品经理 招聘 校招 实习 2026 {全部10家公司名} {城市}"  days=14, maxResults=15
K1-秋招: "2026秋招 AI产品经理 校招开启 {全部10家公司名}"              days=7,  maxResults=15
K2-实习: "AI产品经理 实习 2026 2027届 {全部10家公司名} {城市}"        days=7,  maxResults=15
```

本 spec 采用**分别搜索**策略（秋招 + 实习各自独立搜索词），而非实验中的 K3 混合——分区展示需要各自独立的结果集，且各自搜索词的召回率更高。

### A.2 LLM 提取质量对比（thinking × 搜索输入）

以 K1-G1 搜索结果（49 条）为输入：

| 策略 | 事件数 | 耗时 | 准确/5 | 无幻觉/5 | 综合/5 |
|---|---|---|---|---|---|
| **L2: batch + think** | 11 | 51s | **4** | **5** | **4.3** |
| L1: batch + no think | 9 | 11s | 3 | 3 | 3.0 |
| L3: individual + no think（当前） | 10 | ~15s | 2 | 2 | 2.8 |

**LLM 裁判对当前方案的评语**："10 个事件中有 8 个在原文中完全无据可查，属于严重编造。"

**结论**：thinking=enabled 是降低幻觉的唯一有效手段（3/5→5/5）。岗位和面经提取不受此影响——结构化数据中 no-think 足够准确。

### A.3 LLM 裁判 prompt（可用于自动化测试）

```text
你是一位招聘信息质量评估员。对以下搜索结果逐一评分。
关注公司：{公司列表}
目标场景：AI产品经理岗位的2026/2027届校招或实习信息

评分维度：relevance(1-5), contentType(校招公告|岗位信息|实习招聘|面经|汇总帖|行业新闻|无关),
companiesFound(公司名数组), hasActionableInfo(bool), isCurrentSeason(bool)
```
