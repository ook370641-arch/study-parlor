# Agent 文章加工链路：宪法可视化报告

- 日期：2026-08-02
- 状态：已实现（单点实例 + 方法论抽象 + skill 编排）
- 实例：Claude's Constitution 交互式可视化报告（~312KB 自包含 HTML，总览 §0–§9 + 双语注解读本 §10，43 条边栏注解）

## 1. 渲染链路

宪法报告进入夜航简报 Anthropic 博客源后的完整渲染路径：

```
用户点击宪法条目 (AnthropicBlogPanel 列表顶部, "交互报告" pill)
  │
  ├─ AnthropicArticleRow.handleClick()
  │    └─ article.local === 'constitution'
  │       → store.openConstitutionReport()
  │         设 constitutionReportOpen: true
  │         同时清 anthropicReaderFilePath (互斥)
  │
  ├─ AnthropicBlogPanel 右栏渲染分支
  │    └─ constitutionReportOpen ? <ConstitutionReportView />
  │       : readerFilePath ? <AnthropicArticleReader />
  │       : 空态
  │
  ├─ ConstitutionReportView
  │    └─ <iframe src="sp-report://constitution/index.html"
  │               sandbox="allow-scripts allow-popups" />
  │
  ├─ Electron 主进程 protocol.handle('sp-report', ...)
  │    ├─ resolveServingPath():
  │    │  ① 学习库副本 (STUDY_LIBRARY_PATH + Anthropic博客/constitution-report/index.html)
  │    │  ② 内置 asar (out/main/constitution/index.html, build 时从 skill 模板复制)
  │    │  ③ skill 模板 (~/.claude/skills/deconstruct-report/templates/constitution/)
  │    └─ fs.readFileSync → new Response(Uint8Array, {
  │         Content-Type: text/html,
  │         Content-Security-Policy: "script-src 'unsafe-inline' …"
  │       })
  │
  └─ iframe 渲染自包含 HTML
       ├─ 内联 CSS/JS 正常运行 (iframe 继承协议响应的宽松 CSP)
       ├─ 外链 (target="_blank") → Electron setWindowOpenHandler → shell.openExternal
       └─ 父页面 CSP (script-src 'self') 不影响 iframe
          (main.ts onHeadersReceived 对 sp-report:// URL 直接放行)
```

**关键机制**：
- **自定义协议** `sp-report://`：Electron `protocol.handle` API 拦截请求，主进程读磁盘返回 Response。响应头携带报告专属 CSP（`script-src 'unsafe-inline'`），与父页面生产 CSP（`script-src 'self'`）互不干扰
- **三层回退**：学习库副本 → asar 内置 → skill 模板（dev），保证 dev / packaged / 用户删除学习库副本后均可用
- **零 IPC 增删**：报告不触发任何 IPC 调用，`constitutionReportOpen` 纯运行时状态，不持久化

## 2. 文章文件序列

每篇交互式可视化报告 = **6 个文件**：

```
constitution-report/
├── index.html              产物：自包含交互报告（零依赖，可离线双击打开）
└── source/
    ├── full-text.md        构建输入：原文全文（章节标题为独占一行的裸文本）
    ├── annotations.json    构建输入：章节翻译 + 夜话总按 + 边栏注解
    │                       schema: { sections: [{ id, title, titleZh, summary, discussion, zhText, notes }] }
    ├── overview.json       构建输入：总览模式全部数据（11 种组件类型，见 §4）
    ├── media-coverage.md   研究溯源：媒体报道/外部评价（构建器不读取，保留供修订）
    └── research-notes.md   研究溯源：过程记录、概念考据、外部链接（同上）
```

**构建**：3 个输入（full-text + annotations + overview）→ `build-report.js`（确定性脚本，零 LLM 调用）→ 1 个 `index.html`。media-coverage / research-notes 是研究阶段的副产物，不参与构建但保留研究完整性。

原始 24 文件的中间产物（章节拆分 ×8、子代理中间产出 ×4、一次性调试脚本 ×3 等）全部可从三输入重推导，不入最终文件序列。

## 3. 应用代码改动

为支撑这篇文章引入的全部应用代码变更。新建 7 + 修改 11 = **18 个文件**（含测试）。

### 3.1 报告呈现链路（新建 4）

| 文件 | 职责 |
|---|---|
| `src/lib/constitution-report.ts` | `CONSTITUTION_ARTICLE_META`（哨兵 url `local://constitution-report`）+ `withConstitutionEntry()` 置顶合成并去重 |
| `src/components/anthropic/ConstitutionReportView.tsx` | `<iframe src="sp-report://constitution/index.html" sandbox="allow-scripts allow-popups">`，不渲染字号按钮（对 iframe 无效） |
| `electron/lib/report-protocol.ts` | `sp-report://` 协议注册（`registerSchemesAsPrivileged` + `protocol.handle`）；三层回退服务；报告专属 CSP |
| `electron/lib/report-sync.ts` | boot 时同步 `index.html` + `source/` 到学习库（大小不一致时覆盖）；不生成索引卡 .md；不 import electron，可单测 |

### 3.2 构建管线（新建 1 + 修改 1）

| 文件 | 职责 |
|---|---|
| `scripts/copy-constitution.js` | Build 步骤：从 skill 模板复制到 `out/main/constitution/`，随 asar 打包 |
| `scripts/dev.js` | `electron-vite build` 成功后自动触发 `copy-constitution.js` |

### 3.3 主进程适配（修改 2）

| 文件 | 改动 |
|---|---|
| `electron/main.ts` | CSP 字符串加 `frame-src sp-report:`；`onHeadersReceived` 豁免 `sp-report://` URL（不覆盖协议自带 CSP）；`runBootSequence` 开头调 `syncConstitutionReportToLibrary` |
| `electron-builder.yml` | 移除显式 `constitution/**` 条目——`out/**/*` 已覆盖 `out/main/constitution/` |

### 3.4 列表与状态（修改 4）

| 文件 | 改动 |
|---|---|
| `src/types/index.ts` | `AnthropicArticleMeta` 加可选字段 `local?: 'constitution'` |
| `src/store/index.ts` | 运行时状态 `constitutionReportOpen: boolean`（默认 false）；`openConstitutionReport()` / `closeConstitutionReport()`；`openAnthropicReader()` 内加 `constitutionReportOpen: false`（互斥） |
| `src/components/anthropic/AnthropicBlogPanel.tsx` | import `withConstitutionEntry` + `ConstitutionReportView`；`displayArticles` 合成置顶；`openOrImportArticle` 加 local 分支；右栏三分支（报告 / reader / 空态）；折叠 rail 加 § 图标 |
| `src/components/anthropic/AnthropicArticleRow.tsx` | `handleClick` 开头检测 `article.local` → 直接开报告跳过导入；§ 占位图 +「内置报告」日期文案 +「交互报告」pill；删除右键菜单因无 filePath 天然不可删 |

### 3.5 测试（新建 2 + 修改 3）

| 文件 | 覆盖 |
|---|---|
| `tests/constitution-report.test.ts` | `withConstitutionEntry` 前置/去重；store 互斥（openConstitutionReport 清 reader，openAnthropicReader 关报告）— 4 例 |
| `tests/report-sync.test.ts` | 首同步/幂等/版本升级 — 3 例 |
| `tests/anthropic-blog-panel.test.tsx` | rail 计数 + ember 边框断言适配 +1 置顶条目 — 修复 2 例 |
| `e2e/helpers/selectors.ts` | 新增 `anthropicConstitutionPill` / `constitutionReportView` / `constitutionReportFrame` |
| `e2e/specs/anthropic-blog.spec.ts` | 离线组加：离线条目仍置顶、点击开 iframe、frame 文本渲染、库文件夹存在、无 .md 索引卡 |

### 3.6 学习库产物（运行时生成）

```
<学习库>/Anthropic博客/constitution-report/
├── index.html              交互报告（可离线双击打开）
└── source/                 完整源数据（5 文件）
```

`Anthropic博客/` 根下不生成任何文件——只有这一个文件夹。

## 4. 可视化组件目录（11 种标准积木）

构建器 `build-report.js` 支持的组件类型，由 `overview.json` 的 `sections[].type` 驱动：

| type | 用途 | 关键字段 |
|---|---|---|
| `glance` | 统计卡行 | `cards: [{num, unit?, label, desc?}]` |
| `structure` | 结构总图（可展开节点） | `nodes: [{root?, open?, label, title, question, detailHtml}]` |
| `pyramid` | 优先级金字塔 | `levels: [{label, title, desc}]` |
| `chapters` | 逐章深读（手风琴） | `chapters: [{num, label, title, bodyHtml}]` |
| `redlines` | 红线清单 | `cards: [{num, textHtml, tag?}]` + `noteHtml?` |
| `philosophy` | 哲学卡片组 | `cards: [{icon, title, descHtml, source?}]` |
| `critique` | 正反评价并置 | `prosTitle, consTitle, pros: [{label, textHtml}], cons` |
| `quotes` | 语录墙 | `quotes: [{text, sourceHtml}]` |
| `appendix` | 术语表 + 外部链接 | `terms: [{term, def}], links: [{text, url}]` |
| 读本模式 | 双语对照 + 总按 + 边栏按 | `annotations.json` 的 `sections` 数组（构建器按 title 从 full-text.md 切分原文） |
| 章节导航 | 侧栏 + 下拉 + 上下章 | 构建器从 combinedSections 自动生成 |

统一调色板：夜色底 `#1a1410` / 米色衬线 `#e8d5b7` / 琥珀点睛 `#d97757`。产物永远单文件自包含。

## 5. Agent 加工链路（六阶段）

| 阶段 | 输入 → 输出 | 做什么 | 调用预算 |
|---|---|---|---|
| ① 获取 | URL/文件 → `source/full-text.md` | 抓取/清洗原文，保留权威单源 | ~1 |
| ② 解构 | 全文 → 章节列表 + 结构数据 | 章节标题提取、层级关系、核心问题 | ~1 |
| ③ 增读 | 章节 → `annotations.json` | **并行子代理**逐章翻译 + 边栏注解 + 总按 | ~6–8（成本大头） |
| ④ 研究 | 主题 → `media-coverage.md` / `research-notes.md` | 外部评价、批判视角、概念考据 | ~1–2 |
| ⑤ 构建 | 数据 → `index.html` | 确定性脚本装配（零 LLM 调用） | 0 |
| ⑥ 集成 | 产物 → 应用内可读 | `sp-report://` 协议 + 列表入口 + boot 同步 | 0（一次性基建） |
| **合计** | | | **~9–12** |

①–④ 是 Agent 工作区（可重跑、可增量）；⑤ 是 `build-report.js`（数据驱动，按 title 匹配切分，弯/直引号归一化）；⑥ 是应用一次性基建，新报告零额外应用代码。

### annotations.json schema

```json
{
  "sections": [{
    "id": "being-helpful",
    "title": "Being helpful",
    "titleZh": "论有助",
    "summary": "…（30 字以内）",
    "discussion": "…（夜话总按：哲学伦理讨论）",
    "zhText": "…（中文译文全文）",
    "notes": [
      { "anchor": "文中被注解的短语", "text": "夜话按：2-4 句注解" }
    ]
  }]
}
```

关键约束：`title` 必须与原文独占一行的裸文本逐字一致（构建器按此切分原文）。LLM 输出先 extract → sanitize → JSON.parse，不裸用。

## 6. 关键约束与决策

| 约束 | 决策 |
|---|---|
| 生产 CSP `script-src 'self'` 无 `unsafe-inline` | 自定义协议 `sp-report://`，响应头携带报告专属宽松 CSP |
| 报告外链全部 `target="_blank"` | iframe `sandbox="allow-scripts allow-popups"`，由 `setWindowOpenHandler` 转系统浏览器 |
| 报告数据不放在项目仓库 | 数据源 = skill 模板，build 时复制到 `out/main/` 随 asar 打包 |
| 文章应在学习库中有可独立打开的完整副本 | boot 时同步 `index.html` + `source/` 到 `Anthropic博客/constitution-report/`，不生成索引卡 .md |
| 不新增 IPC、不新增持久化字段 | 条目渲染进程合成；`constitutionReportOpen` 仅运行时状态 |
| 产物单文件自包含是硬约束 | 离线可用、可入库、可双击打开、可 iframe 沙箱渲染 |

## 7. 系统化路线（按优先级）

1. **目录约定**：每篇报告 6 文件（`index.html` + `source/` 下 5 文件），落于学习库 `Anthropic博客/<slug>/`。skill 模板 `~/.claude/skills/deconstruct-report/templates/<slug>/` 为构建源
2. **annotations schema 校验**：JSON Schema 校验后再进构建器
3. **应用侧注册表**：`local?: 'constitution'` 单点 → `localReports: [{slug, title, summary}]` 注册表；`withConstitutionEntry` 泛化为 `withLocalReports`
4. **同步泛化**：`report-sync.ts` 按注册表循环
5. **加工编排**：`deconstruct-report` skill（用户级 + 项目副本）已固化为完整编排，constitution 模板为参考实例

### 端到端操作序列（一篇新报告从零到应用内可读）

```
① Agent 用 deconstruct-report skill 加工一篇新文章
   产出: source/ 下 full-text.md + annotations.json + overview.json
         + media-coverage.md + research-notes.md

② node ~/.claude/skills/deconstruct-report/builder/build-report.js reports/<slug>/
   → 生成 reports/<slug>/index.html

③ 将 reports/<slug>/ 整体复制到学习库 Anthropic博客/<slug>/
   （或由 report-sync.ts 泛化后自动同步）

④ 重启应用 → Anthropic 博客列表自动出现新条目（注册表泛化后）
   点击 → sp-report://<slug>/index.html → 三层回退服务 → iframe 渲染
```


## 8. Skill 参考

`/deconstruct-report` — 用户级 skill（`~/.claude/skills/deconstruct-report/`）+ 项目副本（`.claude/skills/deconstruct-report/`）。包含：
- `SKILL.md`：六阶段链路 + 调用预算 + annotations schema
- `builder/build-report.js`：通用构建器（11 种组件类型，按标题切分原文）
- `builder/template.css` / `builder/template.js`：共享样式/脚本
- `templates/constitution/`：完整模板实例（`index.html` + `source/` 5 文件）

## 9. 明确不做

- 不生成 markdown 版、不接 `ArticleAssistantPanel`（阶段二候选）
- 报告字号不接入全局字号控制（iframe 自带排版）
- 不生成 frontmatter 索引卡 .md（`source/` 下文件即为数据本体）

## 10. 验证（2026-08-02）

- 单测 84/85（report-sync 3/3 + constitution-report 4/4 + anthropic 系列 + store；唯一失败为预存 swap painting button 断言）
- `npx playwright test e2e/specs/anthropic-blog.spec.ts -g "离线场景"` — 2/2
- `npx playwright test e2e/specs/startup-health.spec.ts` — 1/1
