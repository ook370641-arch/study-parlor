# Tavily + LLM 策略实验最终报告

**日期**: 2026-07-25
**API**: Tavily (tvly-dev-RqCHK...) + DeepSeek v4-pro
**条件**: 10家关注公司, 4城市, 3个岗位方向

---

## 1. Tavily 搜索策略对比

### 阶段① 发现动态 (Events)

| 策略 | 调用 | 唯一URL | 效率 | 耗时 | 得分 |
|---|---|---|---|---|---|
| **B-全量合并** | **1** | **15** | **15.0** | 1.5s | **69.0** ★ |
| C-双层(社区+全网) | 2 | 19 | 9.5 | 2.4s | 49.4 |
| A-逐家(当前) | 11 | 50 | 4.5 | 5.4s | 48.0 |
| D-三层 | 3 | 24 | 8.0 | 1.4s | 46.4 |
| E-极简单次 | 1 | 10 | 10.0 | 0.9s | 46.0 |

**分析**:
- 当前方案(A)虽然拿到50条唯一URL，但11次调用效率极低，且大量噪音(百度百科、新闻转载)
- B(全量合并)效率最高：1次调用15条，覆盖了talent.alibaba.com、nowcoder、知乎等核心来源
- C(双层)的社区层极其精准：nowcoder.com贡献了10/19条结果，但需2次调用
- **推荐: C-双层** — 社区限域+全网补充，比B多1次调用但覆盖质量更高

### 阶段③ 岗位搜索 (Jobs)

| 策略 | 调用 | 唯一URL | 效率 | 耗时 |
|---|---|---|---|---|
| **C-分层(大厂+创业)** | **2** | **16** | **8.0** | 2.0s ★ |
| B-全量合并 | 1 | 9 | 9.0 | 1.0s |
| A-逐公司(当前) | 5 | 22 | 4.4 | 6.8s |

**分析**:
- C-分层拿到官方招聘页(阿里巴巴campus、美团zhaopin、腾讯careers)，质量最高
- B-全量合并虽然效率高，但只拿到9条结果，覆盖不足
- **推荐: C-分层** — 大厂 + AI创业公司分开搜，精准度最高

### 阶段④ 面经问题 (Questions)

| 策略 | 调用 | 唯一URL | 效率 | 耗时 |
|---|---|---|---|---|
| **B-全量合并** | **1** | **12** | **12.0** | 1.6s ★ |
| A-逐公司(当前) | 4 | 17 | 4.3 | 6.0s |

**分析**:
- nowcoder.com 占绝对主导(17/17 for A, 11/12 for B)
- 逐公司搜索在面经场景完全浪费——牛客网的面经贴本身就跨公司
- **推荐: B-全量合并** — 1次调用足够

---

## 2. LLM 提取策略对比

### 事件提取 (Events)

| 策略 | 事件数 | 输出长度 | 耗时 | 评分 |
|---|---|---|---|---|
| **batch (no thinking)** | **10** | **2376字符** | **11.1s** | ★★★ |
| individual (当前方案) | 10 | 2518字符 | ~4×N秒 | ★★ |
| batch (high thinking) | 4 | 938字符 | 47.5s | ★ |

**关键发现**:
- **高思考强度(high)在提取任务中适得其反**：输出从10个事件降到4个，耗时4倍
- batch + no thinking = 与逐条提取同等质量，但只需1次LLM调用
- 提取阶段应该禁用thinking，只在综合生成(synthesize)阶段开启

### 岗位提取 (Jobs) — 推断结论
- 与事件提取模式一致：batch + no thinking 效果最好
- 当前逐公司提取每家公司5个结果 → 25次LLM调用，优化后只需1次

### 面经提取 (Questions) — 推断结论
- 同模式：batch + no thinking 即可
- 当前4次LLM调用 → 优化后1次

---

## 3. 最终推荐方案

### Tavily 调用: 40次 → 5次 (↓87.5%)

| 阶段 | 当前 | 优化后 | 搜索词 |
|---|---|---|---|
| ① 发现动态 | 11次 | **2次** (并行) | 社区层: `2026秋招 校招 AI产品 大模型 提前批 汇总` + nowcoder.com/yingjiesheng.com<br>全网层: `2026秋招 AI产品经理 校招 宣讲会 字节 阿里 腾讯 百度 美团 北京 上海 杭州 深圳` |
| ② 官方招聘页 | 20次 | **0次** | 移除(预配置careerPageUrl已覆盖) |
| ③ 岗位搜索 | 5次 | **2次** (并行) | 大厂: `AI产品经理 大模型 校招 2026 字节 阿里 腾讯 百度 美团 北京 上海`<br>创业: `AI产品经理 大模型 校招 2026 MiniMax 智谱 月之暗面 零一 百川 北京 上海` |
| ④ 面经问题 | 4次 | **1次** | `AI产品经理 面经 面试题 高频 字节 阿里 腾讯` + nowcoder.com/zhihu.com |
| **合计** | **~40** | **5** | ↓87.5% |

### LLM 调用: ~40次 → 5次 (↓87.5%)

| 阶段 | 当前 | 优化后 | 设置 |
|---|---|---|---|
| 事件提取 | 11次(逐公司) | **1次(批量)** | temp=0.3, thinking=disabled |
| 岗位提取 | 15-25次(逐结果) | **1次(批量)** | temp=0.3, thinking=disabled |
| 面经聚合 | 4次 | **1次(批量)** | temp=0.3, thinking=disabled |
| 岗位匹配 | 1次 | **1次** | temp=0.3, **thinking=enabled, high** |
| 综合生成 | 1次 | **1次** | temp=0.5, **thinking=enabled, high** |
| **合计** | **~32-42** | **5** | ↓87.5% |

### Thinking 使用原则

| 任务类型 | Thinking | 理由 |
|---|---|---|
| 结构化提取(JSON) | ❌ disabled | 高思考减少输出量、增加耗时4倍 |
| 匹配/排序 | ✅ enabled, high | 需要深度推理 |
| 综合生成(Markdown) | ✅ enabled, high | 需要叙事连贯性 |

---

## 4. 搜索词清单 (可直接替换代码)

### buildEventQueries → 新函数

```js
// 双层事件搜索 (2次Tavily, 并行)
const EVENT_QUERIES = [
  {
    query: '2026秋招 2027届 校招 AI产品 大模型 提前批 汇总',
    includeDomains: ['nowcoder.com', 'yingjiesheng.com'],
    maxResults: 10, days: 7,
  },
  {
    query: '2026秋招 AI产品经理 校招 宣讲会 字节跳动 阿里巴巴 腾讯 百度 美团 北京 上海 杭州 深圳',
    maxResults: 10, days: 7,
  },
]
```

### buildJobQueries → 新函数

```js
// 分层岗位搜索 (2次Tavily, 并行)
const JOB_QUERIES = [
  {
    query: 'AI产品经理 大模型产品经理 Agent产品经理 校招 2026 字节跳动 阿里巴巴 腾讯 百度 美团 北京 上海 杭州 深圳',
    maxResults: 10, days: 30,
  },
  {
    query: 'AI产品经理 大模型产品经理 Agent产品经理 校招 2026 MiniMax 智谱AI 月之暗面 零一万物 百川智能 北京 上海 杭州 深圳',
    maxResults: 10, days: 30,
  },
]
```

### buildQuestionQuery → 新函数

```js
// 单次面经搜索 (1次Tavily)
const QUESTION_QUERY = {
  query: 'AI产品经理 面经 面试题 高频',
  includeDomains: ['nowcoder.com', 'zhihu.com', 'xiaohongshu.com'],
  maxResults: 12, days: 90,
}
```

---

## 5. 预期效果

| 指标 | 当前 | 优化后 | 改进 |
|---|---|---|---|
| Tavily 调用/次 | ~40 | 5 | ↓87.5% |
| LLM 调用/次 | ~40 | 5 | ↓87.5% |
| 月配额可生成次数* | ~25次 | ~200次 | 8x |
| 搜索耗时(纯Tavily) | ~20s(串行) | ~2s(并行) | ↓90% |
| LLM总耗时 | ~2-4min | ~1-2min | ↓50% |
| 每日一次可用 | ❌(配额不足) | ✅(月5%配额) | — |

*按Tavily免费套餐1000次/月计算

---

## 6. 实施优先级

1. **P0 - 立即**: 合并搜索词 + 并行化 (改buildEventQueries/buildJobQueries/buildQuestionQueries)
2. **P0 - 立即**: 批量LLM提取替代逐条提取 (改discoverEvents/extractJobsFromHtml/discoverQuestions)
3. **P1 - 同步**: 移除discoverOfficial的Tavily搜索
4. **P2 - 同步**: 更新E2E mock server适配新搜索词
5. **P3 - 后续**: 更新extract-events.md/extract-jobs.md/aggregate-questions.md prompt支持多公司输入
