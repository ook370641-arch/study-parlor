# 两轮渐进搜索 + 研究报告合成 设计文档

**日期**: 2026-07-28
**状态**: 设计完成，待评审
**范围**: `electron/lib/search.ts`, `electron/ipc/search.ts`, `tests/search.test.ts`

---

## 1. 问题

当前 `search:prepare` 管线是**单轮盲搜**：LLM 根据 topic 一次生成 3 个查询词 → 并行搜索 → 合成为"导师备课笔记"。两个缺陷：

1. **搜索深度不足**：查询词是"猜"出来的，没有从实际搜索结果中识别子维度深入钻探
2. **产出物错配**："导师备课笔记"是为苏格拉底导师设计的"我知道但不说"备忘录，不适合作为面向用户的研究材料

用户反馈：当在 PreStudyModal 的"附加要求"中提出研究型问题时（如"为什么 Claude Code 的 harness 更好"），最终产出的外部资料质量远低于预期。

## 2. 目标

将搜索管线从"单轮 3 查询 → 备课笔记"升级为：

```
两轮渐进搜索 → 结构化研究报告 → 独立节点(导师笔记+苏格拉底提问方向)
```

**不改动**：苏格拉底对话管线、学习报告归档管线、UI 层（ExternalSummaryPanel 已支持 markdown 渲染）

**泛用性**：所有 prompt 均为 topic-agnostic，不预设特定领域的维度或模板。报告结构由材料自然产生。

## 3. 新管线

### 3.1 总体流程

```
search:prepare IPC
  │
  ├─ Step 1: generateExploratoryQueries(topic)
  │     LLM生成2-3个宽域查询词（覆盖不同角度）
  │
  ├─ Step 2: searchWebWithRetry(宽域查询) → 第1轮结果
  │     并行Tavily搜索，1次重试
  │
  ├─ Step 3: identifySubDimensions(topic, 第1轮结果)
  │     LLM通读第1轮摘要，识别2-4个值得深挖的子维度
  │     对每个子维度生成1个精准查询词
  │
  ├─ Step 4: searchWebWithRetry(子维度查询) → 第2轮结果
  │     并行Tavily搜索，1次重试
  │     如果全部失败：降级为仅用第1轮结果合成
  │
  ├─ Step 5: synthesizeResearchReport(topic, 第1轮结果, 第2轮结果)
  │     LLM合成结构化研究报告（纯markdown）
  │
  └─ Step 6: generateTutorSupplement(topic, 研究报告)
        LLM基于已完成的报告，生成：
        - 导师备课笔记（核心概念/关键区分/常见误解/前置知识）
        - 苏格拉底提问方向（场景化引导问题+期望结论）
```

### 3.2 每一步的错误处理

| 步骤 | 失败策略 |
|---|---|
| Step 1 查询词生成 | 抛 `LLM_ERROR` |
| Step 2 第1轮搜索 | 全部失败 → `NETWORK_ERROR`；部分失败 → 继续用成功的结果 |
| Step 3 子维度识别 | 失败 → 跳过第2轮，仅用第1轮结果合成（降级） |
| Step 4 第2轮搜索 | 全部失败 → 降级，仅用第1轮结果合成 |
| Step 5 研究报告合成 | 抛 `LLM_ERROR` |
| Step 6 导师笔记补充 | 失败 → 返回仅有报告的 SearchResult（导师笔记为可选增强） |

### 3.3 合成 prompt 设计原则

**不预设维度**。报告结构由材料自然产生。不要求"必须包含核心概念/对比分析/…"等固定模板。

**不预设论证标准**。经过实验验证，两轮搜索管线自然产出的报告已具备：对比定位、量化锚点、反面论点呈现、来源可追溯、关键收获提炼。无需在 prompt 中显式要求这些。

**唯一的格式约束**：
- 纯 markdown
- 内联来源编号
- 结尾附来源列表
- 控制在 4000 字以内

## 4. 新增函数

### 4.1 `electron/lib/search.ts`

```typescript
// 新增：生成探索式宽域查询词
async function generateExploratoryQueries(
  cfg: AppConfig,
  topic: string
): Promise<string[]>

// 新增：从第1轮结果识别子维度并生成深钻查询词
async function identifySubDimensions(
  cfg: AppConfig,
  topic: string,
  round1Results: TavilyResult[]
): Promise<string[]>

// 重命名+重写：原 generateTutorBrief → 合成研究报告
async function synthesizeResearchReport(
  cfg: AppConfig,
  topic: string,
  round1Results: TavilyResult[],
  round2Results: TavilyResult[]
): Promise<string>  // 返回纯markdown报告

// 新增：基于报告生成导师笔记+提问方向
async function generateTutorSupplement(
  cfg: AppConfig,
  topic: string,
  report: string
): Promise<{ tutorNotes: string; questions: string }>
```

保留现有 `searchWeb()` 和 `generateSearchQueries()` 不变（后者仍被旧管线引用，后续可清理）。

### 4.2 `electron/ipc/search.ts`

更新 `search:prepare` handler 的管线编排逻辑。返回类型不变（`SearchResult`），但 `summary` 字段由三部分组成：

```
summary = 研究报告 + "\n\n---\n\n" + 导师笔记 + "\n\n---\n\n" + 提问方向
```

如果 Step 6 失败，summary 仅包含研究报告。`sources` 字段保持不变。

### 4.3 成本

| | 旧管线 | 新管线 |
|---|---|---|
| Tavily 调用 | 3 次 | 4-7 次（第1轮2-3 + 第2轮2-4） |
| LLM 调用 | 2 次 | 4 次（探索查询+子维度识别+合成报告+导师补充） |
| 额外延迟 | — | 约 +5-10s（多一轮搜索+一次LLM） |

Tavily 免费套餐（1000 credits/月）可支持约 140-250 次学习，仍可接受。

## 5. 不改动的部分

- `electron/lib/prompts.ts` — assemblePrompt 中的 externalMaterialsSummary 注入不变
- `src/lib/session-runtime.ts` — kickoffSession 中的 prepareExternalMaterials 调用不变
- `src/lib/finalize.ts` — 归档管线不变（外部资料仍写为 外部资料.md）
- `src/components/ExternalSummaryPanel.tsx` — 已是 markdown 渲染，内容升级直接生效
- `src/types/index.ts` — `SearchResult` 类型不变
- `electron/ipc/llm.ts` — 苏格拉底对话的 system prompt 组装不变

## 6. 测试

### 单元测试 (`tests/search.test.ts`)

新增：
- `generateExploratoryQueries` — 正常生成、JSON 解析失败
- `identifySubDimensions` — 正常识别、空结果降级
- `synthesizeResearchReport` — 正常合成、第2轮为空时降级
- `generateTutorSupplement` — 正常生成、解析失败
- 两轮搜索集成测试（mock Tavily + mock LLM）

### E2E

`e2e/specs/external-materials-real-search.spec.ts` 需更新 mock Tavily 返回数据以匹配新管线的搜索词模式。现有断言（"出现 ExternalMaterialsCard"）保持不变。

## 7. 实施参考：已验证的 prompt 原文

以下 prompt 直接来自实验脚本，已通过两轮独立实验验证有效。实施时直接复用，无需重新设计。

### 7.1 Step 1 — 探索查询词生成

来自 `scripts/test-synth-variants.js`（两轮实验均使用同一版本）：

```
用户想研究：「{topic}」

请生成 2-3 个宽域搜索查询词，用于全面了解这个主题。要求：
- 覆盖不同角度（架构设计、工程实践、对比分析、底层原理）
- 查询词简短、精准，适合英文搜索引擎
- 查询词用英文（此类技术资料英文质量更高）
只输出 JSON 数组：["查询1", "查询2"]
```

### 7.2 Step 3 — 子维度识别

```
以下是关于「{topic}」的第一轮网络搜索结果。请通读，识别 2-4 个值得深挖的子维度，生成精准搜索查询词。

第一轮结果：
{formatResults(round1Results, 'R1')}

只输出 JSON 数组：["查询1", "查询2"]
```

`formatResults` 格式：`[R1-{i}] {title}\nURL: {url}\n摘要: {content前400字}`

### 7.3 Step 5 — 研究报告合成

来自 `scripts/test-synth-variants.js` 的 `buildReportPrompt()`（变体B验证版）：

```
你是一位技术研究助手。以下是从两轮网络搜索得到的关于「{topic}」的资料。

## 第一轮（全景扫描）
{formatResults(round1Results, 'R1')}

## 第二轮（子维度深钻）
{formatResults(round2Results, 'R2')}

请撰写一份结构化的研究报告。要求：

1. 输出纯 markdown 格式，控制在 4000 字以内
2. 结构灵活但不失深度——根据材料自然产生的维度组织章节，而不是套固定模板
3. 优先使用：对比表格、分层分析、关键数据点
4. 每个事实性陈述后附上来源编号 [1] [2] ...
5. 如果材料之间存在矛盾或不同观点，明确指出
6. 结尾附"关键收获"：3-5 条最值得记住的要点
7. 结尾附"来源列表"

写作风格：资深工程师写的内部技术备忘录。
```

### 7.4 Step 6 — 导师笔记 + 提问方向（独立节点）

来自 `scripts/test-synth-variants.js` 变体B的 Step 2：

```
以下是一份关于「{topic}」的研究报告。

---
{report}
---

请基于以上报告，生成以下两部分内容：

### 导师备课笔记
将报告的核心知识转化为苏格拉底式导师的备课参考。包含：核心概念（2-4个）、关键区分点、常见误解（2-3个）、前置知识。风格：导师知道但不直接告诉学生的背景笔记。控制在 800 字以内。

### 提问方向
基于报告内容，给出 3-5 个苏格拉底式提问方向，用于引导学生自己发现这些知识。每个提问方向包含：引导问题 + 期望学生最终自己发现的结论。

请用 markdown 分隔线 --- 隔开两个部分。
```

### 7.5 实施优先级

上述 prompt 是已验证的最小充分集合。实施时：
- **直接复用**，不改措辞（实验已证明有效）
- 函数签名按 §4.1 封装，prompt 文本内联在函数体中
- `formatResults()` 已在 `search.ts` 中无等效函数，需新增一个私有 helper

### 7.6 实验脚本参考

实施时可直接对照以下脚本的对应函数：

| 脚本 | 对应函数 | 用途 |
|---|---|---|
| `scripts/test-synth-variants.js` | `buildReportPrompt()` | Step 5 合成 prompt 的参考实现 |
| `scripts/test-synth-variants.js` | `variantB()` | Step 5 + Step 6 分步调用的参考实现 |
| `scripts/test-two-round-search.js` | `round1_explore()`, `identifyDimensions()` | Step 1-4 搜索编排的参考实现 |

## 8. 实验验证记录

所有设计决策均有实验数据支撑。实验脚本和结果保存在 `.experiment-results/`：

| 实验 | 脚本 | 关键发现 |
|---|---|---|
| 两轮搜索可行性 | `scripts/test-two-round-search.js` | 报告质量达到原始 Claude Code 分析约 80%，5/6 论证标准自然达成 |
| 单次 vs 两次 LLM | `scripts/test-synth-variants.js` | 单次LLM导致报告主体损失约15%篇幅和深度，独立节点更优 |

## 9. 实施顺序

1. 在 `electron/lib/search.ts` 中新增 4 个函数（prompt 文本直接复用 §7.1-7.4）
2. 新增私有 helper `formatResultsForPrompt()` 替代实验脚本中的 `formatResults()`
3. 在 `electron/ipc/search.ts` 中更新 `search:prepare` 管线为 6 步
4. 更新 `tests/search.test.ts` 单元测试
5. 更新 `e2e/specs/external-materials-real-search.spec.ts`
6. 验收：`npx tsx scripts/test-two-round-search.js`（跑一次完整搜索验证端到端质量）
7. 跑定向测试：`npx vitest run tests/search.test.ts tests/search-ipc.test.ts`
