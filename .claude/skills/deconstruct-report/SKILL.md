# deconstruct-report

将长篇文章（论文、报告、宪法等）系统化解构为自包含的交互式可视化报告，支持：结构总图、优先级金字塔、逐章深读、双语对照读本 + 边栏注解。

六阶段加工链路：获取 → 解构 → 增读（并行子代理翻译+注解）→ 研究 → 构建（数据驱动，无 LLM）→ 应用集成。每阶段可独立重跑。

## 触发条件

用户要求"解构"、"深度分析"、"做可视化报告"一篇长文章/论文/宪法文档，或指定 URL/本地文件。

## 目录约定

```
reports/<slug>/
├── index.html                产物：自包含交互报告（零依赖，可离线打开）
├── README.md                 项目说明
└── source/
    ├── full-text.md          权威输入：原文全文
    ├── annotations.json      核心数据：章节翻译 + 夜话总按 + 边栏注解
    ├── overview.json         总览数据：§0–§9 所有可视化内容
    ├── media-coverage.md     研究溯源：相关报道/评价
    └── research-notes.md     研究溯源：过程记录与资源链接
```

所有文件入仓。输入文件（full-text / annotations / overview）即为可重跑构建的全部数据。

## 加工链路（六阶段）

### ① 获取 Acquire（~1 次调用）

输入 URL（或本地文件）→ `source/<slug>-full-text.md`。抓取/清洗原文为纯 Markdown，保留权威单源，不做任何抽取。

### ② 解构 Decompose（~1 次调用）

全文 → 章节列表 + 层级关系 + 核心问题。产出：章节标题列表（供标注匹配）+ 结构数据（供 overview.json 的 structure 节点）。章节标题必须与原文独占一行的裸文本逐字一致。

### ③ 增读 Annotate（~6–8 次调用，整个链路的成本大头）

章节 → `annotations.json`（schema 见下）。**并行子代理**：每 2–3 章一个子代理，并行翻译 + 边栏注解 + 总按。完成后合并为统一 JSON。

```json
{
  "sections": [
    {
      "id": "being-helpful",
      "title": "Being helpful",
      "titleZh": "论有助",
      "summary": "…（30 字以内）",
      "discussion": "…（夜话总按：哲学伦理讨论，可多段）",
      "zhText": "…（中文译文全文）",
      "notes": [
        { "anchor": "文中被注解的短语或概念", "text": "夜话按：简短注解（2-4 句）" }
      ]
    }
  ]
}
```

关键约束：
- `title` 必须与原文独占一行的裸文本逐字一致（构建器按此切分原文）
- `notes` 每章 2–6 条，标注关键概念、隐喻、内在张力
- LLM 输出先 extract → sanitize → JSON.parse，不裸用

### ④ 研究 Research（~1–2 次调用）

产出 `media-coverage.md`（相关报道摘要表）+ `research-notes.md`（作者背景、关键概念、外部链接、批判观点）。为 overview.json 的 critic/pros-cons 提供素材。

### ⑤ 构建 Build（0 次调用，确定性脚本）

```bash
node ~/.claude/skills/deconstruct-report/builder/build-report.js reports/<slug>/
```

输入：`source/full-text.md` + `source/annotations.json` + `source/overview.json`。
输出：`index.html`（单文件自包含，内联 CSS/JS，零依赖）。

构建器按 annotations.sections[].title 从原文中逐字匹配切分章节（支持弯引号/直引号归一化）。总览模式内容由 overview.json 的 sections 数组按 order 驱动，11 种组件类型：`glance` / `structure` / `pyramid` / `chapters` / `redlines` / `philosophy` / `critique` / `quotes` / `appendix`。

### ⑥ 集成 Integrate（应用侧一次性基建，已实现）

见 `constitution/README.md` 迁移章节。

## overview.json 总览内容节

总览模式的所有内容数据化在 `overview.json` 中。节按 `order` 渲染，`type` 指定组件：

| type | 用途 | 关键字段 |
|---|---|---|
| `glance` | 统计卡行 | `cards: [{num, unit?, label, desc?}]` |
| `structure` | 结构总图（手风琴） | `nodes: [{root?, open?, label, title, question, detailHtml}]` |
| `pyramid` | 优先级金字塔 | `levels: [{label, title, desc}]` |
| `chapters` | 逐章深读（手风琴） | `chapters: [{num, label, title, bodyHtml}]` |
| `redlines` | 红线清单 | `cards: [{num, textHtml, tag?}]` + `noteHtml?` |
| `philosophy` | 哲学卡片 | `cards: [{icon, title, descHtml, source?}]` |
| `critique` | 正反评价对照 | `prosTitle, consTitle, pros: [{label, textHtml}], cons` |
| `quotes` | 语录墙 | `quotes: [{text, sourceHtml}]` |
| `appendix` | 术语表 + 链接 | `terms, links` |

## 调用预算（完整档）

| 阶段 | 调用 | 说明 |
|---|---|---|
| ① 获取 | 1 | 抓取/清洗原文 |
| ② 解构 | 1 | 章节列表 + 结构 |
| ③ 增读 | 6–8 | 并行子代理翻译+注解（全篇双语读本，成本大头） |
| ④ 研究 | 1–2 | 报道摘要 + 研究笔记 |
| ⑤ 构建 | 0 | 确定性脚本 |
| ⑥ 集成 | 0 | 一次性 |
| **合计** | **9–12** | |

## 模板实例

`constitution/`（Claude's Constitution 可视化报告）是此链路的唯一落地实例。学习此实例时重点看这四个文件的数据形态：

- `constitution/source/full-text.md` — 原文如何以章节裸标题行来组织（"Being helpful" 独占一行）
- `constitution/source/annotations.json` — title 字段如何与原文章节标题逐字对应
- `constitution/source/overview.json` — 每种 type 的数据结构
- `constitution/index.html` — 构建器产出（312KB，自包含，零依赖）

## 约束

- 产物单文件自包含是硬约束：离线可用、可入库、可双击打开、可 iframe 沙箱渲染
- 构建器零 LLM 调用——纯数据驱动装配，可反复重跑
- 增读阶段 annotations schema 用 JSON Schema 校验后再扔进构建器（rules：extract → sanitize → shape-check）
- 研究阶段不追求穷举——2 个代表性媒体报道 + 5–8 个关键外部链接即可
- 文件命名用英文 slug（小写 + 连字符），中文内容保留在 json 字段里
