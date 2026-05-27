# Markdown 渲染器重构设计文档

## 日期
2026-05-27

## 问题
`SessionViewer` 当前用 `<pre>` 标签直出原始 Markdown 文本，没有任何解析渲染。学习报告、复习报告、寓言三种文件的阅读体验极差——标题层级不可见、列表无缩进、引用块无样式、表格无法显示、代码无高亮。

## 目标
让应用内打开 `.md` 文件可以进行舒适的阅读，融合 Disco Elysium 风格（深色低饱和 + 文学感排版 + 数据磁带气质）与波兰尼默会知识的学术质感。

## 文件类型与检测策略

三种文件需要不同的排版风格：

| 文件类型 | 来源 | 内容特征 | 排版风格 |
|---------|------|---------|---------|
| 报告型 | `学习报告.md` / `复习报告.md` | 结构化知识文本，深层级标题、列表、引用块、表格 | 学术紧凑风 |
| 寓言型 | `寓言.md` / `寓言2.md` | frontmatter type="research"，叙事+解释混合体 | 文学宽松风（叙事段落）+ 学术元素（解释部分的表格/列表） |
| 对话型 | `原始对话.md` | 无 frontmatter，时间戳 + 角色标记 | 时间线格式 |

### 检测优先级

1. **frontmatter `type` 字段优先**
   - `type: "progress"` → 报告型
   - `type: "research"` → 寓言型
   - `type: "review"` → 报告型（复习报告）
2. **fallback：文件名匹配**
   - `学习报告.md` / `复习报告.md` → 报告型
   - `寓言*.md` → 寓言型
   - `原始对话.md` → 对话型
3. **兜底**：无法识别时默认走报告型

> 检测在 `SessionViewer` 内完成，不新增 IPC 调用。读取内容后先用 `gray-matter` 解析 frontmatter，再决定渲染方式。

## 技术栈

| 包 | 用途 | 版本 |
|---|---|---|
| `react-markdown` | Markdown → React 组件 | ^9.x |
| `remark-gfm` | GitHub Flavored Markdown（表格、任务列表、删除线） | ^4.x |
| `@shikijs/rehype` | 代码块语法高亮（VS Code TextMate 引擎） | ^3.x |
| `rehype-raw` | 允许 HTML 标签透传（防御性） | ^7.x |

不需要新增字体文件，使用系统自带字体：
- 衬线正文：`Georgia, "Noto Serif SC", "Source Han Serif SC", serif`
- 等宽标题/代码：`"Courier New", "JetBrains Mono", monospace`

## 排版规格

### 通用容器

```
max-width: 640px（报告型）/ 520px（寓言型）
居中
padding: 24px 28px
背景: ink/50 微透明（与现有 glass 面板融合）
```

### 报告型排版

| 元素 | 规格 |
|------|------|
| H1 | 18px Courier New，颜色 parchment，下边框 1px ember/30 |
| H2 | 13px Courier New，颜色 parchment，**前缀章节标签**（如 `CONCEPT / 核心概念`） |
| H3 | 12px Courier New，颜色 ember |
| H4 | 11px Courier New，颜色 ember/80 |
| 正文 | 13px Georgia，行高 1.7，颜色 parchment 78% |
| 列表 | 缩进 20px，项间距 4px，行高 1.7 |
| 引用块 | 左侧 3px ember 线 + 5% ember 背景 + 斜体 + 圆角右半边 |
| 代码块 | Shiki 高亮，等宽 11px，深背景 #15100d，圆角 4px |
| 行内代码 | 等宽 11px，ink 背景，圆角 3px，ember 色 |
| 表格 | 边框 slate/20，表头 ember 背景，行交替 ink/30 |
| 分隔线 hr | 「线-菱形-线」装饰分隔符 |
| 加粗 | 颜色 parchment 100%（从 78% 提亮） |
| 链接 | ember 色，下划线，hover 提亮 |

**章节标签规则**：H2 渲染时自动提取标题文本的首词或分类词，生成小字大写标签。例如 `## 核心概念` → 标签 `CONCEPT`。不需要完美翻译，用固定映射表覆盖常见词即可。

### 寓言型排版

| 元素 | 规格 |
|------|------|
| H1 | 18px Georgia 居中，颜色 parchment，无下划线 |
| H2 | 13px Georgia，颜色 ember，居中 |
| 叙事段落 | 14px Georgia，行高 2.0，**首行缩进 2em** |
| 解释段落 | 同报告型正文（13px / 1.7 / 无缩进） |
| 对话 | 左缩进 2em + 说话人名 ember 色 + 正文斜体 |
| 分隔线 | 同报告型（线-菱形-线） |
| 引用块 | 同报告型 |
| 表格 | 同报告型 |

**叙事 vs 解释段落区分**：寓言文件结构通常是"上半叙事 + 下半解释"。以第一个 `## 这个寓言真正讲的概念` 或 `---` 后的 `##` 为分界点：之前走叙事风格（首行缩进、宽松行高），之后走解释风格（无缩进、紧凑行高）。

### 对话型排版

```
时间戳行：等宽 10px，slate/50 色，上间距 16px
角色标记：加粗，用户=ember 色，AI=parchment 色
对话内容：13px Georgia，行高 1.6
分隔：每条消息间 1px slate/10 横线
```

## 组件架构

```
SessionViewer (现有)
  └── MarkdownRenderer (新)
        ├── FileTypeDetector (检测逻辑)
        ├── ReportStyles (报告型 CSS)
        ├── FableStyles (寓言型 CSS)
        └── components/ (react-markdown 自定义组件映射)
              ├── Heading.tsx (H1-H4，含章节标签)
              ├── Blockquote.tsx (暖色引用块)
              ├── Code.tsx / CodeBlock.tsx (Shiki 高亮)
              ├── Table.tsx (边框表格)
              ├── HorizontalRule.tsx (菱形分隔线)
              └── Dialogue.tsx (对话解析，仅寓言型)
```

### 组件职责

- **MarkdownRenderer**：接收 raw markdown 字符串，解析 frontmatter，选择样式集，调用 react-markdown
- **FileTypeDetector**：根据 frontmatter type + 文件名返回 `'report' | 'fable' | 'dialogue'`
- **Heading**：H1/H2 用 Courier New，H3/H4 用 Courier New 小号，H2 附加章节标签
- **Blockquote**：左侧线 + 暖色背景 + 斜体
- **CodeBlock**：用 Shiki 高亮，适配暗色主题（暖橙关键字 + 柔绿函数 + 米黄字符串）
- **Table**：边框、表头背景、斑马纹
- **HorizontalRule**：CSS 实现「线-菱形-线」
- **Dialogue**：仅寓言型使用，解析 `"名字："` 前缀的对话格式

## Shiki 主题配置

使用自定义暗色主题，基于现有配色：

```
关键字 (keyword)     → #d97757 (ember)
函数 (function)      → #7fb069 (柔和绿)
字符串 (string)      → #c9a86c (暖黄)
数字 (number)        → #deb887 (米黄)
注释 (comment)       → #6b6b5e (暗灰)
变量 (variable)      → #e8d5b7 (parchment)
类型 (type)          → #d4a574 (浅棕)
```

Shiki 配置在 build 时静态加载，避免运行时 bundle 过大。只导入常用语言（js, ts, python, bash, json, markdown）。

## 与现有 UI 的融合

- `SessionViewer` 的 glass 面板（`bg-ink/70 backdrop-blur-md`）作为容器背景保持不变
- Markdown 渲染区内部背景用 `bg-ink/50`，与外层 glass 形成微妙层次
- 滚动条使用现有自定义样式（如有）
- 关闭按钮、标题栏保持不变

## 边界与约束

1. **不处理编辑**：只读渲染，不实现编辑功能
2. **不处理图片**：现有图片展示逻辑（base64 img）保持不变，不与 markdown 渲染冲突
3. **不处理外部链接**：点击外部链接时提示或忽略（Electron 安全考虑）
4. **代码块语言检测**：Shiki 对未识别语言 fallback 到 plaintext，不报错
5. **表格宽度**：超长表格允许横向滚动，不破坏容器宽度
6. **性能**：Shiki 高亮在渲染时同步完成，文件通常 < 100KB，不会阻塞

## 测试策略

1. 用真实学习库文件做视觉回归测试（人工浏览确认）
2. 单元测试：FileTypeDetector 的检测逻辑
3. 单元测试：Heading 章节标签生成规则
4. 单元测试：Dialogue 解析规则
