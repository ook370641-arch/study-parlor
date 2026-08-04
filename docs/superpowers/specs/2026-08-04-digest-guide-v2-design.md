# 夜航简报-前沿导读升级：背景铺陈式导读（v2）设计

日期：2026-08-04
状态：已确认（brainstorming 完成，待写实施计划）

## 背景与问题

夜航简报（digest）的导读当前由 `articleAssistant:generateGuide` 一次性 LLM 调用生成（`electron/prompts/digest-guide.md`），输出 `{ background, chunks: [{heading, summary, terms}] }`。

问题（用户实证，8月3日 `.guide.md`）：每个条目的 `summary` 是对条目内容的转述（"Swyx 推荐了…"、"Thibault 观察到…"），对读者没有增量信息。用户（AI 初学者）需要的是**背景铺陈**：这条代表什么观点、在什么讨论语境里有意义、让一个资深从业者看到这条时脑海里浮现的前见是什么。名词解释（terms）质量不错，保留。

## 已确认的需求决策

| 决策点 | 结论 |
|---|---|
| 形态 | 两层：整体一段背景 + 每条目一段背景铺陈；名词解释保留 |
| 搜索 | 每条目都是潜在搜索目标；搜索次数动态（0-N），查询与条目建立映射 |
| 范围 | 只改夜航简报-前沿（digest）；Anthropic 博客、拾贝文章走旧路径不动 |
| 篇幅 | 自适应，由模型按条目重要性定详略 |
| 旧缓存 | 版本化（`guide_version: 2`），digest 旧缓存自动失效重新生成 |
| 进度 UI | 分阶段细粒度：阶段名、搜索 x/x、撰写 §x/§y + 已写字数（不额外调 LLM） |

## 架构与数据流

新链路放在主进程，仅 digest 类型走新链路；其他文章类型沿用现有单次调用。

```
打开夜航简报（digest）且无 v2 缓存
  │
  ├─ 阶段 1 检索规划（chatNonStream，轻量）
  │    输入：简报全文（§1–§N 已带编号）
  │    输出 JSON：{ queries: [{ query, entries: [条目索引...], reason }] }
  │    —— 每条目默认是候选；纯观点/常识条目可不配查询；
  │       一条查询可挂多个条目索引
  │    → 发进度事件 { stage: 'planning' }，完成时得 total = queries.length
  │
  ├─ 阶段 2 并行搜索（复用 scout 的 Tavily 封装）
  │    每个 query 一次搜索，取该查询 top 结果摘要，
  │    按 entries 映射归档 → 每个条目得到自己的资料夹（可为空）
  │    → 每个查询完成发 { stage: 'searching', done, total }
  │
  └─ 阶段 3 流式撰写（主进程内部走 Kimi SSE 流式读取，非新 LLM 调用）
       system：新版 electron/prompts/digest-guide-v2.md
       user：简报全文 + 按条目组织的资料夹（无资料条目显式标注
             "无外部资料，用模型自身知识"）
       → 每 chunk 发 { stage: 'writing', chars, entriesDone, entriesTotal }
       收齐后走现有 JSON 提取校验，invoke 返回值不变
       输出：新版导读 JSON → 写入 .guide.md（guide_version: 2）
```

关键决策：

- **规划与生成分离**：规划输出可单测（索引合法、查询非空），"哪条查了、哪条没查"可观测、可调试。
- **资料按条目归档**：生成时每条只看到自己相关的资料，避免张冠李戴。
- **撰写进度免费可得**：handler 内边收 chunk 边累计，`chars` = 累计字符数；`entriesDone` = 已收文本中 `"heading"` 键出现次数（字符串计数，不解析半成品 JSON）；`entriesTotal` = 简报正文 H2/H3 标题数（渲染层已知，调用时传入）。

## 数据结构与 prompt

### 新版导读 JSON schema（v2）

```json
{
  "background": "整体一段：把这期简报放进当周 AI 领域的语境——这几条线索共同反映什么趋势/争论",
  "chunks": [
    {
      "heading": "原标题，保持原语言（与现有导航契约一致，不变）",
      "context": "本条背景铺陈：观点定位、讨论语境、读者需要的前见，自适应详略",
      "terms": [ { "term": "...", "translation": "...", "explanation": "..." } ]
    }
  ]
}
```

- `summary` → `context`：语义从"概括内容"变为"铺陈背景"，本次升级的核心契约变更。
- `heading` / `terms` 契约不变，chunk 切分导航（§ 对应、`data-chunk-index`、点击互跳）不受影响。
- `ArticleAssistantGuide` 类型中 chunk 增加 `context?: string`，保留 `summary?: string` 兼容旧格式；GuideSidebar 优先渲染 `context`，回退 `summary`。

### prompt 设计（新文件 `electron/prompts/digest-guide-v2.md`，旧文件保留给其他类型）

核心构造四块：

1. **读者假设**：读者自己会读正文，正文里已有的信息都是废品；`context` 只写正文没说的、资深者习以为常的语境。
2. **自问清单**（每条写作前默默过一遍）：
   - 这条踩在哪个正在进行的故事线上？（某场争论、某个技术脉络、某家公司的战略走向）
   - 说话者是谁？为什么这个人的声音在这个话题上有分量？
   - 这条在支持或挑战哪个流行看法？
   - 初学者读这条时，最缺的是哪块拼图？
   - 若某条是自足的纯观点，用一句话说明它为何仍值得注意，不硬凑背景。
3. **语言风格**（中庸标准）：
   - 平实准确：不写空话套话（"命题""范式""赋能"之类抽象名词堆叠），也不刻意口语化、刻意通俗。
   - 判断落实成具体的人、事、数字；措辞以准确为先，深浅自然。
   - 术语首次出现由名词解释（terms）兜底，铺陈文字本身保持通畅即可。
4. **三层正反锚点**（示例即标准示范）：

> ❌ 摘要（禁止）：「Karpathy 用 Opus 5 将《指环王》片段渲染为 Three.js 动画，仅花 2 小时 10 美元，展示了 LLM 使个性化体验近乎零成本。」
>
> ❌ 掉书袋（禁止）：「圈内转发它，是因为"2 小时 10 美元"给"个性化软件成本趋零"这个反复被争论的命题提供了一个具体数据点。」
>
> ❌ 刻意通俗（禁止）：「用大白话告诉 AI 想要什么，让 AI 把整个程序写出来……这账算得很具体。」
>
> ✅ 期望：「Karpathy 是 OpenAI 创始成员、前特斯拉 AI 总监。2025 年初他提出"vibe coding"一词，指用自然语言描述需求、让模型生成完整程序的做法，这条推文是该主张的又一次公开实验。它受到关注，在于成本与耗时的具体：过去需要专业团队完成的动画，如今一个人以 10 美元、两小时即可完成。」

名词解释规则沿用旧版（中英对照格式），并修掉旧版冗余嵌套毛病（如"LLM（大语言模型（LLM））"）。输出约束沿用项目 LLM 规则：只输出 JSON、禁 markdown fence、空字段用 `""`；同时禁止复述条目内容（给负面示例）。

## 缓存、错误处理与降级

### 缓存版本化

- `.guide.md` frontmatter 新增 `guide_version: 2`（新版生成时写入）。
- 失效判定在渲染层打开文章时：digest 类型 + `guide_version` 缺失或 < 2 → 视为无缓存，自动触发新链路重新生成，生成后覆盖写入同一路径。
- 非 digest 类型不做版本检查，继续用旧格式。

### 错误处理与降级矩阵

| 失败点 | 行为 |
|---|---|
| 规划调用 JSON 解析失败 | 重试 1 次；仍失败 → 跳过搜索，全部条目按"无外部资料"生成 |
| 单个 Tavily 查询失败/超时 | 该查询服务条目的资料夹置空，记 debug 日志，继续 |
| Tavily 完全不可用（无 key/网络断） | 全部资料夹为空，退化为纯模型知识版，照常产出导读 |
| 生成调用 JSON 提取/校验失败 | 沿用现有 `GUIDE_JSON_ERROR` 路径，UI 显示"未能生成导读"，原文不受影响 |
| 用户中途关闭/切换文章 | 复用现有 abort 机制；部分搜索结果丢弃，不写半成品缓存 |

### 可观测性

阶段 1 的规划结果（哪些条目配了查询、查询词）、阶段 2 的查询成败，写入 `~/.studyparlor/debug/` 日志。

## 进度 UI

### IPC

新增事件通道 `articleAssistant:guideProgress`（types → main → preload → facade → store → GuideSidebar 五层同步）。事件负载：

```ts
type GuideProgress =
  | { stage: 'planning' }
  | { stage: 'searching'; done: number; total: number }
  | { stage: 'writing'; chars: number; entriesDone: number; entriesTotal: number }
```

E2E mock 路径直接发合成进度事件。

### 视觉（双版式）

进度指示落在 GuideSidebar 加载区，遵守设计语言与 ui-styling §11（不新增诗意资产）：

- 学术版（暗色）：主文案 `text-parchment/60`，阶段关键词用琥珀 `text-ember` 点睛；报纸版（浅色）：`text-[#6b5d52]` / `text-ember`。
- 形态：一行阶段文案 + 一条 1px 高 `bg-ember/60` 细进度痕，宽度随进度推进（搜索 `done/total`，撰写 `entriesDone/entriesTotal`），`transition: width 400ms`，`prefers-reduced-motion` 静态回退。
- 字数计数用 `tabular-nums` 防跳动。
- 元素加 `data-testid="guide-progress"`。

三态文案：

```
规划检索中…
检索背景资料中… 3/7
撰写导读中… §2/§14 · 已写 860 字
```

## 测试策略

### 单元测试（新增 `tests/article-assistant/guide-v2.test.ts` + 扩展现有文件）

| 环节 | 用例 |
|---|---|
| 规划输出校验 | entries 索引越界/为空 → 丢弃该查询；JSON 畸形 → 重试 1 次 → 降级无搜索；一条查询挂多条目 |
| 资料归档 | 查询失败仅置空对应条目资料夹；Tavily 全失败 → 全空照常生成 |
| 进度事件 | `"heading"` 计数启发式（0/N、中途、超发 clamp）；字数累计 |
| 缓存版本 | digest + 无 `guide_version`/v1 → 失效重新生成；digest + v2 → 命中；非 digest 旧格式 → 命中不失效 |
| prompt 装配 | 沿用 `tests/article-assistant/prompt.test.ts` 模式：`digest-guide-v2.md` 含 schema、三层 ❌/✅ 锚点、语言规约、禁 fence |
| GuideSidebar 组件 | 渲染 `context`（v2）；渲染 `summary`（旧，非 digest）；三态进度文案与进度痕；双版式 class |
| store | 失效缓存触发重新生成；进度事件流转到 state |

### E2E（mock 路径，确定性）

1. 无缓存打开 digest → mock 合成进度事件（三态依次出现，断言文案）→ v2 导读渲染（context + terms）→ § 点击互跳导航仍工作
2. 旧 v1 `.guide.md` 缓存 → 自动失效 → 重新生成 → 新内容替换
3. Anthropic 博客（非 digest）→ 旧路径不受影响（summary 渲染、无版本失效）
4. 双版式：报纸主题下进度与导读正常渲染
5. 维护 `e2e/source-map.json`：更新 `article-assistant-guide.spec.ts` / `guide-visibility.spec.ts` 覆盖关系

### 真实 API 回归

保留可独立运行的真实链路冒烟脚本（不进 CI），验证 Kimi 实际输出能过 JSON 校验。

## 验收清单

- [ ] digest 导读 v2：整体背景一段 + 每条 `context` 背景铺陈 + 名词解释；无复述条目内容
- [ ] 搜索动态 0-N 次，查询与条目映射正确（debug 日志可查）
- [ ] 降级矩阵各路径行为符合上表
- [ ] 旧 v1 digest 缓存自动失效重新生成；非 digest 不受影响
- [ ] 进度 UI 三态文案 + 进度痕，双版式渲染，reduced-motion 回退
- [ ] 所有新增 IPC/类型五层同步，启动探测或测试断言覆盖
