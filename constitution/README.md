# Claude's Constitution — 可视化报告

将 Anthropic 于 2026 年 1 月发布的 Claude 宪法（约 29,000 词 / 84 页）制作成**交互式 HTML 可视化报告 + 双语注解读本**，支持快速理解宪法的结构、内容、设计原则、批判视角，并逐章阅读英文原文与中文译文对照。

## 项目结构

```
constitution/
├── README.md                          # 本文件
├── index.html                         # 主可视化报告（浏览器直接打开）
├── scripts/                           # 生成脚本（过程文件）
│   ├── build-reader.js                # 从注释数据生成 index.html
│   ├── combine-annotations.js         # 合并各来源的注释数据
│   ├── fix-json-quotes.js             # 修复 JSON 引号问题
│   └── split-sections.js              # 拆分宪法章节
└── source/                            # 过程文件与原始资料
    ├── constitution-full-text.md      # 宪法英文原文全文
    ├── reader-annotations.json        # 中文翻译 + 夜话按注释（核心数据）
    ├── reader-annotations-partial.json # 手动翻译的前五节
    ├── agent-results-*.json           # 子代理翻译的后八节
    ├── media-coverage.md              # 主流媒体报道摘要
    ├── research-notes.md              # 研究过程记录与资源链接
    └── sections/                      # 拆分的英文章节文件
```

## 报告内容

### 模式一：总览（§0–§9）

| # | 板块 | 说明 |
|---|------|------|
| 0 | 扉页 | 标题、作者、发布日期、CC0 声明 |
| 1 | 速览 | 关键数字：29,000 词 / 5 章 / 7 条红线 / 4 层优先级 |
| 2 | 结构总图 | 5 大章节层级关系与核心问题 |
| 3 | 优先级金字塔 | Safety > Ethics > Guidelines > Helpfulness |
| 4 | 逐章深读 | 每章结构、关键段落、设计意图（手风琴展开） |
| 5 | 七条红线 | 绝对禁止事项 + 设计逻辑 |
| 6 | 哲学基础 | 美德伦理学、phronesis、人格化设计 |
| 7 | 批判视角 | 正反评价对照 |
| 8 | 关键语录 | Askell 和宪法中的标志性语句 |
| 9 | 附录 | 术语表、外部链接、迁移说明 |

### 模式二：双语注解读本（§10）

点击侧边栏「读本」切换：

- **13 个原文章节**：Authors / Published / Acknowledgements / Preface / Overview / Being helpful / Following Anthropic's guidelines / Being broadly ethical / Hard constraints / Being broadly safe / Claude's nature / Concluding thoughts / A final word
- **英文原文 + 中文译文对照**：每个阅读块先展示英文原文，再展示中文翻译
- **夜话总按**：每章开头的摘要与哲学/伦理讨论
- **夜话按**：43 条边栏式注解，标注关键概念、隐喻与张力
- **章节导航**：左侧章节列表 + 顶部下拉菜单 + 右侧上下章切换

## 使用方式

```bash
# 直接在浏览器中打开
start constitution/index.html
```

零依赖，单文件自包含 HTML（内联 CSS/JS），可离线使用。使用侧边栏顶部的「总览 / 读本」切换两种模式。

## 视觉设计

基于 Study Parlor 同源调色板：
- 背景：`#1a1410`（深褐）
- 正文：`#e8d5b7`（米色）
- 强调：`#d97757`（琥珀/暖橙）

暗色学术主题，衬线正文，粘性侧边导航。

## 迁移至夜航简报模块

### 可行路径

本报告定位为"**外部文章展示**"类型，与简报模块现有的 `anthropic` 源（Anthropic 官方博客抓取）属于同一模式：

| 维度 | 现有 anthropic 源 | 本报告 |
|------|-------------------|--------|
| 数据来源 | `ipc.anthropicDiscover()` 抓取博客列表 | 本地 HTML / 结构数据 |
| 渲染组件 | `AnthropicBlogPanel.tsx` | 新组件或嵌入 `ArticleAssistantPanel` |
| 内容模式 | 文章列表 → 点击阅读 | 单页滚动报告 |

### 迁移所需步骤

1. **类型层** (`src/types/index.ts`)：新增 source id（如 `'constitution'`）
2. **IPC 层**：可复用 `anthropicDiscover` 模式或直接读取本地 HTML
3. **Store 层**：新增 `constitution` 状态切片
4. **组件层**：新增面板组件，支持 academic/newspaper 双主题
5. **页面层** (`src/pages/Briefing.tsx`)：在侧边栏添加导航项 + 渲染分支
6. **侧边栏**：`BriefingSourceSidebar.tsx` 的 `navItems` 数组添加新条目

### 关键接口要求

- 面板组件接收 `theme: 'academic' | 'newspaper'`
- 需处理 loading / empty / error 三态
- 需兼容全局 Chrome 元素（字号、画作、烛光层）
- 可接入 `ArticleAssistantPanel` 进行导读对话

详见 `source/research-notes.md` 中简报模块探索的完整结果。

## 许可

- 宪法原文：CC0 1.0（公共领域），版权归 Anthropic
- 本可视化报告：MIT
