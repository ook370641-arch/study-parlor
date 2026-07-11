# 求职简报（Job Briefing）设计

- 日期：2026-07-11
- 状态：待实现
- 范围：`src/pages/Briefing.tsx`、`src/components/BriefingSourceSidebar.tsx`、新增 `electron/ipc/job-briefing.ts`、新增 `src/components/job-briefing/*`、求职简报文件缓存

## 1. 摘要

为「夜航简报」增加第三个来源：「求职简报」。每日（手动触发）生成一份面向国内 AI 产品岗位的求职咨询报告，整合 Tavily 全网搜索与可配置官方招聘页抓取，输出岗位清单、技能雷达、趋势解读三部分。求职简报完全复用现有简报页面的统一外壳、来源侧边栏、日期列、背景插画、字号主题控制、往期 drawer 以及旁注对话小助手。

## 2. 目标

1. 成为用户一手求职资讯与求职资料准备的信源。
2. 优先展示大厂与 AI 独角兽的高含金量岗位。
3. 提炼岗位 JD 背后的「默会知识」与当前市场所需技能。
4. 与 AI 日报、Anthropic 博客共享同一套页面框架和视觉语言。
5. 支持用户对报告内容进行苏格拉底式旁注提问。

## 3. 非目标

1. 不替代招聘平台完整功能（投递、简历管理等）。
2. 不主动绕过招聘平台反爬或登录墙；官方招聘页抓取仅针对可公开访问的公司招聘页。
3. 不在第一版提供自动定时生成；先以手动触发为主。
4. 求职简报不生成 LLM 导读侧栏，只引入对话小助手。
5. 不修改 AI 日报或 Anthropic 博客的内容生成逻辑。

## 4. 信源策略

采用 **Tavily 全网搜索为主 + 官方招聘页定向抓取为辅** 的完整版策略。

### 4.1 Tavily 发现层

对公司列表中的每一项，用 Tavily 查询官方招聘页 URL：

- 查询模板：`"{company} 官方招聘 AI产品经理"`、`"{company} careers AI product manager"`
- 返回：`{company, careerPageUrl, confidence}`
- 结果写入配置，供后续抓取使用；仅写入置信度高于阈值的 URL，低置信度时 `careerPageUrl` 留空。
- 提供一键「刷新公司招聘页链接」。

### 4.2 官方招聘页抓取层

- 对配置中 `enabled: true` 且 `careerPageUrl` 存在的公司，发起抓取。
- 优先用轻量 `fetch`；若页面是 JS 渲染，fallback 到 Electron 内置 `BrowserWindow` 离屏渲染。
- 用 LLM 做结构化提取：`{company, title, city, salary, requirements, url}`。
- 每个公司抓取独立 `AbortController`，超时 15 秒，支持取消。

### 4.3 Tavily 趋势/技能层

并行运行三类查询：

1. **岗位查询**：`"AI产品经理 / 大模型产品经理 / Agent产品经理 招聘"`
2. **公司查询**：`"字节跳动 / 阿里巴巴 / 腾讯 / MiniMax / 智谱AI 产品经理 招聘"`
3. **趋势查询**：`"2026 AI产品 技能要求 招聘趋势"`、`"AI产品经理 薪资 2026"`

### 4.4 合并与优先级

- 官方招聘页结果优先级最高。
- 配置中 `priority` 决定公司排序。
- 同公司 + 同岗位 或 URL 相同则去重。
- 失败的官方页自动 fallback 到 Tavily 搜该公司岗位。

## 5. 数据流与缓存

### 5.1 生成流程

```
用户点击「生成求职简报」
  → store.generateJobBriefing(date)
    → IPC jobBriefing:generate(date)
      → 1. 检查 {library}/求职简报/求职简报-YYYY-MM-DD.md
           → 命中：直接读取返回
           → 未命中：进入 pipeline
      → 2. 读取 jobBriefingConfig
      → 3. 并行执行：
           a. 官方招聘页抓取（每公司一个请求，带 AbortController）
           b. Tavily 多查询（岗位/公司/趋势）
      → 4. LLM 结构化提取官方页岗位
      → 5. Tavily 结果与官方页结果去重合并
      → 6. LLM 综合生成最终 Markdown
           （优先岗位 + 技能雷达 + 趋势解读）
      → 7. 写入缓存文件
      → 8. 返回 {content, sourceStatus, generatedAt, date, filePath}
```

### 5.2 缓存策略

- 以自然日为 key：`{library}/求职简报/求职简报-YYYY-MM-DD.md`。
- 当天生成后不再自动重新生成；用户可手动点「重新生成」覆盖。
- 生成失败时不写缓存，保留上一天文件（如有）并提示用户。
- 缓存文件 frontmatter 类型为 `job-briefing`，包含 `date`、`generated_at`、`companies`、`role_keywords`、`cities`、`sources`。

### 5.3 文件格式示例

```markdown
---
type: job-briefing
date: 2026-07-11
generated_at: 2026-07-11T08:30:00+08:00
role_keywords: ["AI产品经理", "大模型产品经理", "Agent产品经理"]
cities: ["北京", "上海", "杭州", "深圳"]
companies: ["字节跳动", "阿里巴巴", "腾讯", "MiniMax", "智谱AI"]
sources:
  - type: official
    company: 字节跳动
    url: https://jobs.bytedance.com/...
  - type: tavily
    query: AI产品经理 招聘 2026 7月
    url: https://www.liepin.com/...
---

## 优先岗位

### [OFFICIAL] 腾讯 · AI产品经理培训生
- **城市**: 深圳
- **薪资**: 年薪 40W+
- **难度**: ★★★★☆
- **JD 要点**: ...
- **来源**: [原文链接](https://...)

> 💭 **默会知识**: ...

## 技能雷达

| 技能 | 频次 |
|---|---|
| 大模型 / LLM | 92% |
| Agent 设计 | 78% |
| 提示词工程 | 65% |

## 趋势解读

...
```

## 6. UI/UX 设计

### 6.1 整体定位

求职简报作为「夜航简报」的第三个来源，与 AI 日报、Anthropic 博客并列，完全复用现有页面框架。

### 6.2 来源侧边栏

- 在 `BriefingSourceSidebar` 的 `navItems` 中新增 `job-briefing` 项。
- 标签：「求职简报」。
- 折叠态显示 SVG 图标（公文包/放大镜风格）。
- 激活态边框/背景跟随 `briefingTheme`。

### 6.3 日期列复用 AI 日报

- `source === 'job-briefing'` 时渲染 `BriefingListColumn` + `BriefingDateColumn`。
- `BriefingListColumn` 的 `title="日期"`。
- `BriefingDateColumn` 需要新增 `todayLabel?: string` prop，求职简报传「生成简报」。
- 历史数据来自独立的 `jobBriefingHistory` store。

### 6.4 主内容区

| 状态 | 行为 |
|---|---|
| 空态 | 居中显示「今日求职简报尚未生成」+「生成求职简报」按钮 |
| 加载中 | 复用 `BriefingProgress` / `BriefingSkeleton`，阶段包括「发现招聘页」「抓取官方页」「Tavily 搜索」「综合生成」 |
| 错误 | 复用 `BriefingError`，根据错误码显示文案 |
| 成功 | 渲染求职简报正文 |

### 6.5 正文渲染

- 使用专门的 `JobBriefingRenderer` 组件，但底层仍基于 `MarkdownRenderer`。
- 岗位块：识别 `### [OFFICIAL|TAVILY] 公司 · 岗位` 格式，渲染为卡片。
- 卡片包含：来源标签、公司岗位、城市/薪资、难度星级（由 LLM 根据 JD 要求估算，可选）、JD 要点、来源链接、默会知识提示。
- 技能雷达：识别 `| 技能 | 频次 |` 表格，渲染为横向进度条。
- 趋势解读：普通 Markdown 段落，可加左侧高亮边框。
- 所有外链 `target="_blank" rel="noopener noreferrer"`。

### 6.6 背景与全局 Chrome

- 学术主题下始终渲染 `SurfaceBackground` + 暗色遮罩。
- 学术主题下显示「换画」按钮。
- `BriefingHeader` 标题显示「求职简报」或当前日期；`sourceStatus` 显示 Tavily/官方页失败源。
- 字号、主题切换、返回按钮、往期 drawer 全部保留。

### 6.7 旁注对话小助手

- 生成成功后挂载 `ArticleAssistantPanel`，传 `showGuide={false}`（需给该组件新增此可选 prop）。
- 只显示「旁注」竖条和可拖拽对话小窗，不生成右侧导读；`GuideSidebar` 在该模式下不渲染。
- 用户可选中岗位文字提问，助手基于全文 + 选中内容回答。
- 旁注记录保存到 `{library}/求职简报/求职简报-YYYY-MM-DD-assistant.md`，`type: article-assistant`，`parent_path` 指向原文件。

## 7. 配置设计

### 7.1 配置项

```ts
interface JobBriefingConfig {
  companies: JobCompany[];
  roleKeywords: string[];
  cities: string[];
  skillKeywords: string[];
}

interface JobCompany {
  name: string;
  careerPageUrl?: string;
  priority: number;
  enabled: boolean;
}
```

### 7.2 默认值

- 公司：字节跳动、阿里巴巴、腾讯、百度、美团、MiniMax、智谱AI、月之暗面、零一万物、百川智能。
- 岗位关键词：`["AI产品经理", "大模型产品经理", "Agent产品经理"]`。
- 城市：`["北京", "上海", "杭州", "深圳"]`。
- 技能关键词：`["RAG", "Agent", "提示词工程", "多模态"]`。

### 7.3 配置入口

- Settings 页面新增「求职简报」折叠面板。
- 支持增删公司、编辑关键词/城市、刷新官方招聘页链接、恢复默认。
- 配置变更后下次生成时生效，不自动刷新当天缓存。

## 8. 错误处理

| 错误码 | 场景 | 行为 |
|---|---|---|
| `MISSING_SEARCH_KEY` | 未配置 Tavily key | 提示去 Settings 配置 |
| `NETWORK_ERROR` | Tavily 超时/非 2xx | 显示重试按钮 |
| `OFFICIAL_PAGE_FAILED` | 某公司招聘页抓取失败 | 标记 sourceStatus，fallback 到 Tavily |
| `EXTRACTION_ERROR` | LLM 提取失败 | 抛出 ASSEMBLY_ERROR，写 debug 文件 |
| `EMPTY_RESULTS` | 所有源无有效内容 | 显示「今日暂无岗位信息」，保留重试 |
| `CACHE_WRITE_FAILED` | 文件写入失败 | 返回内容，标记 `cacheWriteFailed` |

### 降级规则

- 部分失败继续生成，失败的源进入 `sourceStatus`。
- 官方页失败时，用 Tavily 补一条该公司搜索结果。
- LLM 提取失败时，把原始内容直接 append 到 Markdown。
- 用户可随时取消正在进行的抓取/搜索。

## 9. 跨层同步清单

新增 `job-briefing` IPC 必须按顺序更新：

1. `src/types/index.ts`：`IpcApi`、`JobBriefingResult`、`JobBriefingConfig`、`JobCompany`、`JobErrorCode`。
2. `electron/ipc/job-briefing.ts`：handler 注册。
3. `electron/preload.ts`：暴露 `jobBriefingGenerate`、`jobBriefingList`、`jobBriefingDiscoverPages`。
4. `src/lib/ipc.ts`：facade 包装。
5. `src/store/index.ts`：state、actions、defaults。
6. `electron/ipc/state.ts`：`DEFAULT` 中新增 `jobBriefingConfig`。
7. 组件与测试。

## 10. 测试计划

### 10.1 单元测试

- `tests/job-briefing.test.ts`：
  - 查询模板生成
  - Tavily 结果去重合并
  - 官方页 HTML 结构化提取（mock）
  - sourceStatus 构建
  - 配置默认值与迁移

### 10.2 组件测试

- `tests/job-briefing-layout.test.tsx`：
  - loading / error / empty / success 四种状态
  - 岗位卡片外链可点击
  - 技能雷达进度条渲染
  - 主题切换后样式正确

### 10.3 E2E

- `e2e/specs/job-briefing-generation.spec.ts`（mock 链路）：
  - 切换求职简报源 → 点击生成 → 断言岗位/技能/趋势板块
  - 断言缓存文件写入 `{library}/求职简报/`
- `e2e/specs/job-briefing-real-api.spec.ts`（`@real`）：
  - 真实 Tavily + 官方页链路回归

## 11. 验收标准

- [ ] 来源侧边栏出现「求职简报」第三项，折叠态显示 SVG 图标。
- [ ] 求职简报源下左侧显示日期列，与 AI 日报风格一致。
- [ ] 空态显示「生成求职简报」按钮，点击后进入加载。
- [ ] 加载中显示 Tavily/官方页抓取阶段。
- [ ] 生成成功后正文包含优先岗位、技能雷达、趋势解读三部分。
- [ ] 岗位卡片包含来源标签、城市/薪资、难度、JD 要点、默会知识、原文链接。
- [ ] 学术/报纸主题下求职简报视觉与其他两源统一。
- [ ] 旁注对话小助手可用，可选中文字提问。
- [ ] 配置面板可编辑公司/关键词/城市，刷新官方招聘页链接。
- [ ] 旧用户升级后 `state.json` 自动填充默认配置。
- [ ] 生成失败时 sourceStatus 正确反映失败源。

## 12. 规则对应

- **General Rule 1**：官方页/Tavily 缺字段、空结果都有防御和降级。
- **General Rule 2**：新增 IPC 按 types → handler → preload → facade → store → 组件顺序同步。
- **General Rule 4**：LLM 输出使用结构化提取，prompt 强制 Markdown 格式。
- **General Rule 5**：覆盖空数据、部分失败、旧缓存兼容、跨重启持久化。
- **General Rule 7**：每个抓取/搜索请求独立 AbortController，UI 提供取消。
- **General Rule 8**：新 persisted 字段提供默认值，旧 `state.json` 兼容。
- **UI Rule 8/9**：全局 Chrome 与内容状态解耦；新增子源同步检查背景、Header、Drawer、字号、主题。

## 13. 参考

- `docs/superpowers/specs/2026-07-10-briefing-blog-reader-ui-fixes-design.md`
- `docs/superpowers/specs/2026-07-11-briefing-assistant-design.md`
- `src/pages/Briefing.tsx`
- `src/components/BriefingSourceSidebar.tsx`
- `src/components/BriefingListColumn.tsx`
- `src/components/BriefingDateColumn.tsx`
- `src/components/article-assistant/ArticleAssistantPanel.tsx`
