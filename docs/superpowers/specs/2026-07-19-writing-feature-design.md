---
date: 2026-07-19
status: approved-pending-review
---

# 写作功能设计：夜航简报第四来源「写作」

## 1. 背景与目标

把夜航简报页扩展为用户的**长期写作基地**：一个默认写作板 + 写作库。核心价值：

1. **写作板**：Typora 式所见即所得 md 编辑器，产出纯 `.md` 文件。
2. **写作库**：`writing/` 目录（新写作，分组=嵌套子文件夹）+ `repository/` 目录（过去的写作积累，手动导入），完整目录树管理。
3. **AI 写作助手**：可读取学习库全部资料（学习报告、博客+旁注、AI 日报、求职日报、repository、writing），通过渐进式披露 + 单一本地读取工具实现，读取来源对用户可见；支持网络搜索与思考深度开关；可直接把内容插入编辑器。

非目标（MVP 明确不做）：图片粘贴/拖拽上传、版本历史、大纲侧边栏、查找替换、AI 直接改写文章、发布/导出、回收站。

## 2. 信息架构与布局

不新增页面路由。`briefingSource` 新增第四个来源 `writing`，在来源栏置顶。选中后页面为四区结构：

1. **来源栏**（左一，结构不变）：✍️ 写作置顶并高亮，下方为 digest / anthropic / job-briefing。
2. **文章列表栏**（左二）：顶部 segment tabs **「文章」|「repository」**，整栏内容二选一（不上下堆叠）。
   - 「文章」页：`＋新建文章` `新建分组` 按钮 + `writing/` 嵌套分组树（可折叠、拖拽移动、右键重命名/删除/新建子分组）。
   - 「repository」页：`⬆ 导入文件…` 按钮（系统对话框选 md 复制进来）+ `repository/` 完整树（同样支持目录管理操作）。
3. **写作板**（主区）：Typora 式 WYSIWYG 编辑器 + 顶部固定工具栏 + 右上角保存状态。未选文章时为空态页（最近文章 + 新建引导）。
4. **AI 助手**（右，停靠式）：默认收起为竖排 tab；点击展开为可拖宽面板（宽度持久化），写作板向左挤。

背景（SurfaceBackground）、暗色主题、简报字号档位机制全部复用。

## 3. 存储与目录结构

### 3.1 两个根目录（`STUDY_LIBRARY_PATH` 下）

```
<学习库>/
├── writing/                       ← 新写作（应用首次进入写作源时自动创建）
│   ├── .catalog.json              ← AI 摘要目录（见 §6.2，树扫描隐藏）
│   └── <分组>/[<子分组>/...]<文章>.md
└── repository/                    ← 过去积累（自动创建；手动放入或应用内导入）
    ├── .catalog.json
    └── <任意嵌套>/xxx.md
```

### 3.2 文章文件格式

新写文章带极简 frontmatter：

```yaml
---
type: writing
title: 七月夜话
created: 2026-07-19
updated: 2026-07-19
---
```

- 分组关系**只由目录路径表达**，frontmatter 不冗余存 group。
- repository 旧文件**不要求** frontmatter，照样可读、可被 AI 检索。
- `DocType` 联合类型新增 `'writing'`，按 ipc-state §11 完成全链路同步（序列化扩展字段、文件名推断、渲染映射、测试）。

### 3.3 与现有 files:scan 的兼容

`files:scan` 会误把 `writing/`、`repository/` 当学习主题扫进学习首页。本次**按目录名排除这两个根**（`夜航简报/`、`Anthropic博客/` 的同类历史问题不顺手改）。

### 3.4 AI 伴生文件

每篇写作文章的 AI 对话存为同目录 `<文章名>.assistant.md`，完全复用现有旁注读写 IPC 与文件格式（`parent_type` 增加 `'writing'`）；树扫描时隐藏 `.assistant.md` / `.annotations.md` / `.guide.md` / `.catalog.json` / `.assets/`。

## 4. IPC 契约

新增 `electron/ipc/writing.ts`，全部处理器做越界校验（只允许 `writing/`、`repository/` 两个根内）。按 ipc-state §1 顺序同步：types → handler → preload → facade → store → 组件/测试。

| IPC | 说明 |
|---|---|
| `writing:scanTree` | 递归扫描两个根 → 嵌套树（目录+md，名称排序，隐藏伴生文件），每个文件节点带 `type: 'writing' \| 'repository'` |
| `writing:createFile` / `writing:createFolder` | 新建；重名复用 `-HHMM` 后缀约定 |
| `writing:rename` / `writing:move` / `writing:delete` | 目录树管理；delete 前 UI 确认，不做回收站 |
| `writing:read` / `writing:write` | 读写单文件；write 更新 frontmatter `updated` |
| `writing:importFiles` | 系统对话框选文件复制进 repository 指定目录 |
| `writingAssistant:sendMessage` | AI 对话（参数含当前文章、历史、`useSearch`、`thinkingEffort`），主进程内跑工具循环 |
| `writingAssistant:abort` | 中断（AbortController，复用现有模式） |
| `writingAssistant:tool` （事件） | 主进程 → 渲染端：工具调用状态（`{tool, ids?, status}`），驱动来源 chips UI |
| `writingAssistant:reasoningChunk` （事件） | 思考过程流式 chunk（参照 annotation-iteration spec 的 `articleAssistant:reasoningChunk` 设计） |

流式正文复用 `llm:chunk` / `llm:done` / `llm:error`（以 sessionId 区分域）。会话读写复用 `articleAssistant:readSession/writeSession`。

**错误码**（`src/types/index.ts` 联合类型，三层同步）：`WRITING_IO_ERROR` / `WRITING_PATH_FORBIDDEN` / `WRITING_NOT_FOUND` / `WRITING_NAME_CONFLICT`，对话错误复用 `CHAT_TIMEOUT` / `CHAT_NETWORK_ERROR` / `CHAT_LLM_ERROR`。

## 5. state.json 新字段（全部带默认值，兼容旧 state）

| 字段 | 默认 | 说明 |
|---|---|---|
| `writingFontSize` | `'base'` | 写作板字号，复用 `BriefingFontSize` 枚举与常量表（ipc-state §4，不新造枚举） |
| `writingTone` | `'parchment'` | 视图级配色预设：`'parchment'`（暖米）/ `'plain'`（素白）/ `'ink'`（墨灰） |
| `writingListTab` | `'articles'` | 列表栏 tab：`'articles' \| 'repository'` |
| `writingAssistantWidth` | `320` | AI 面板宽度（px） |
| `writingAssistantOpen` | `false` | AI 面板展开态 |
| `lastWritingFile` | `null` | 上次打开的文章路径，重启恢复 |
| `assistantSearchEnabled` | `false` | 🔍 全局开关（与 annotation-iteration spec 同字段，写作助手先落地） |
| `assistantThinkingEffort` | `'off'` | 🧠 三态 `'off' \| 'high' \| 'max'`（同上） |

## 6. 编辑器（写作板）

### 6.1 框架：Milkdown

ProseMirror 内核、md 双向转换为设计目标、官方 React 支持。依赖：`@milkdown/core` `@milkdown/ctx` `@milkdown/react` `preset-commonmark` `preset-gfm`（表格/删除线/任务列表）`plugin-listener`（变更 → 序列化回 md）`plugin-history`（撤销/重做）`plugin-clipboard`（粘贴 md 自动转换）。样式用项目自有 CSS 变量定制，不引官方主题包。

**打包注意**：Milkdown 各包是懒加载链裸依赖，必须全部加入 `electron.vite.config.ts` 的 `optimizeDeps.include`（build-dev §10），否则触发 Vite re-optimization 整页 reload。

### 6.2 md 往返保真（本功能最大技术风险）

- 验收标准：加载 → 不改动 → 保存，文件字节级不变；表格、嵌套列表、代码块、引用 round-trip 有专项单测。
- **Task 0 spike 先做**：保真不达标则回退到「编辑/预览切换」方案（源码 textarea + MarkdownContent 渲染），spec 其余部分不受影响。
- frontmatter 不进编辑器——Milkdown 只编辑 body；frontmatter 由主进程读写时合并，避免被序列化器吞掉。

### 6.3 工具栏（md 原生 + 视图级排版）

`H1 H2 H3` ｜ `B I S` ｜ `引用 有序/无序列表 分割线` ｜ `插入表格`（弹出小网格选行列）｜ `A- A+`（档位）｜ `🎨`（3 套配色预设）。

字体大小与配色均为**视图级**（CSS 变量 `--writing-body-size` 等，挂编辑器根节点），不写入 md。表格是 md 原生 GFM，直接进文件。

### 6.4 保存策略

- 编辑停顿 1.5s 防抖自动保存 + `Ctrl+S` 立即保存；切换文章前强制落盘。
- 状态指示：`保存中… / 已保存 ✓ / 保存失败`。
- 写入失败 → 复用 `files:recoveryDump` 暂存 `~/.studyparlor/recovery/` 并提示。
- 保存成功后触发 `.catalog.json` 条目更新（见 §7.2）。

## 7. AI 写作助手

架构：渲染端面板 ↔ IPC ↔ 主进程工具循环（`electron/ipc/writing-assistant.ts` + `electron/lib/writing-assistant/`）。

### 7.1 目录摘要预注入（系统 prompt）

每次会话启动时主进程构建"资料目录"注入系统 prompt，六类，每条 = 标题 + 一句话摘要 + 条目 id：

| type | 来源 | 一句话摘要取自 |
|---|---|---|
| `study` | 学习库各主题 | 学习报告 frontmatter 的 `description` 字段（不截正文） |
| `blog` | `Anthropic博客/` | 伴生 `.guide.md` 的「背景」段 |
| `digest` | `夜航简报/` | frontmatter description；无则标题 |
| `job` | 求职简报 | 同上 |
| `repository` | `repository/` | `.catalog.json`（LLM 预生成） |
| `writing` | `writing/` | `.catalog.json`（LLM 预生成） |

无 description / guide / catalog 条目的旧文件退回文件名本身，**绝不截正文充摘要**（会败坏 prompt 质量）。

条目 id = `类型前缀:相对路径`（如 `writing:随笔/七月夜话.md`），模型只照抄 id，路径解析全部在模型外完成。

### 7.2 .catalog.json 生成管线

- 位置：`<学习库>/writing/.catalog.json`、`<学习库>/repository/.catalog.json`。
- 结构：`{ [相对路径]: { title, summary, updatedAt } }`，带 `version` 字段便于将来失效重建（ipc-state §12）。
- 更新触发：
  - 写作文章保存落盘后 → 非流式 LLM 摘要任务更新该条目（防抖合并，避免逐键入调用）；
  - `writing:importFiles` 导入后 → 为新文件补生成；
  - 启动/扫描时发现无条目的文件（手动拖入的）→ 批量补生成；
  - 文件删除/移动 → 条目同步清理。
- 失败静默跳过、下次补；JSON 损坏 → 丢弃重建。摘要 LLM 调用走 `llm-tasks.ts` 模式（非流式、短输出、extract→shape-check）。

### 7.3 工具协议与循环（单一协议，3 个工具）

模型输出中允许出现 ` ```tool ` 代码块（JSON）。主进程流式接收时**缓冲拦截**（块未闭合前不透传渲染端），闭合后 extract→sanitize→shape-check（项目规则 4 管线），执行后把结果作为 user 消息回注，继续生成。**单轮对话最多 6 次工具调用**，超限或协议错误注入提示让模型直接回答。

| 工具 | 参数 | 行为 |
|---|---|---|
| `read_local` | `{ ids: string[] }` | **唯一本地读取工具**。`ids` 为空或含 `'index'` 时返回完整可调取列表（渐进披露的触发动作）；否则按 id 读全文——有旁注/导读伴生文件时**全文+旁注一并返回**。越界/未知 id → 回注错误说明让模型自我纠正 |
| `web_search` | `{ query: string }` | 复用现有 Tavily 链路（`electron/lib/search.ts`）；受 🔍 开关约束，关时回注"搜索未开启" |
| `insert_into_article` | `{ markdown: string }` | 内容经 Milkdown parser 转节点**直接插入当前光标处**，无确认步骤（编辑器 history 提供撤销） |

**Task 0 spike**：探测该端点是否支持原生 `tools` 参数；支持则协议层换原生 function-calling 格式，循环骨架、工具集、UI 不变。

### 7.4 上下文策略（不做截断）

每次发送自动携带：当前文章标题+全文、完整对话历史、目录摘要。**不做 token/轮数截断**（用户明确决策）。唯一兜底：API 因上下文过长报错时，如实映射为 `CHAT_LLM_ERROR` 在 UI 提示，不静默截断。

### 7.5 UI

- **消息布局**：two-sided（用户靠右气泡、AI 靠左无气泡），与 annotation-iteration spec 的样式一致。
- **来源显示**：每次 `read_local` / `web_search` 调用在对应 AI 消息上方生成来源 chip——**type 徽标 + 文件名**（如 `[repository] 2023-旧博客.md`、`[study] 分布式系统`）；流式中显示"正在读取 xxx…"；点击 chip 展开路径与摘要。来源随会话持久化到 `.assistant.md`（`> 来源：[type] path` 行，向后兼容，无需用户确认读取）。
- **🔍 / 🧠 开关**：输入栏左下角，按 annotation-iteration spec 样式实现（🔍 灰↔蓝；🧠 三态循环 关→高→MAX 角标；流式中禁用）。持久化到 state.json 共享字段（§5）。
- **思考过程**：`reasoning_content` 渲染为正文上方可折叠灰字区块，流式中展开、完成后折叠；不写入 `.assistant.md`。
- **一键插入**：每条 AI 消息底部"插入到编辑器"按钮（整条消息作为 md 片段插入光标处）。

### 7.6 会话持久化

每篇文章一个 `<文章名>.assistant.md`（复用旁注格式，`parent_type: 'writing'`）。切换文章即切换会话；repository 文章只读但对话照常保存。

## 8. 错误处理

- 工具协议：畸形 JSON / 未知工具 / 未知 id → 回注错误说明；6 次封顶。
- 文件 IO：读取失败或文件被外部删除 → 该来源 chip 标记失效并提示；写入失败 → recoveryDump。
- LLM：超时/断网/上下文超长 → 类型化错误码映射 UI。
- `.catalog.json`：生成失败静默跳过；损坏丢弃重建。
- Milkdown 解析失败的 md：退回只读预览 + 提示，不丢原文。

## 9. 测试策略

### 9.1 Vitest 单测

- **md 往返保真**：表格/嵌套列表/代码块/引用/frontmatter 剥离合并，字节级 diff。
- **工具协议解析**：extract→sanitize→shape-check 全路径（畸形 JSON、未闭合块、超轮次、未知 id、ids 含 index）。
- **目录树 IPC**：越界拒绝、重名 `-HHMM`、嵌套移动、删除保护、伴生文件隐藏。
- **.catalog.json**：增/改/删/移文件的增量更新、损坏重建、version 失效。
- **目录摘要装配**：description 优先、guide 背景段、无摘要降级文件名、六类 type 标注。
- **空态**：空 writing/、空 repository/、老库无两目录自动创建。
- **state 迁移**：8 个新字段默认值、旧 state.json 兼容。

### 9.2 E2E（Playwright，复用现有设施）

复用：`createMockServer`（SSE 流式响应可含 tool 块）、`mock-tavily-server`、`createTestLibrary` + seed 系列、`E2E_CONFIG_DIR` 隔离、请求体落盘断言模式（annotation-iteration plan Task 11 的 `last-assistant-request.json` 策略推广为 `last-writing-request.json`）。新增 page object `WritingPage.ts` + `WritingAssistantPanel.ts`；新增 seed：`seedWritingTree`、`seedRepository`、`seedCatalogJson`、`seedGuideFile`。每条启动路径默认静默（E2E_SILENT）。

### 9.3 E2E 覆盖矩阵（覆盖度决定开发周期，以下为最小全集）

| spec 文件 | 覆盖点 |
|---|---|
| `writing-navigation.spec.ts` | 写作源置顶多选；三来源切换互不干扰；折叠态点击展开；**重启后来源/tab/最后打开文件恢复** |
| `writing-tree.spec.ts` | 嵌套树渲染与折叠；新建文章/分组/子分组；重命名；删除确认与取消；拖拽移动（含跨分组、移入嵌套）；重名 `-HHMM`；伴生文件不显示 |
| `writing-repository.spec.ts` | tab 切换互斥显示；repository 树目录管理；导入文件落盘并可打开；repository 文章只读提示 |
| `writing-editor.spec.ts` | 新建→输入→防抖自动保存→重开验证；`Ctrl+S`；保存状态三态指示；表格/嵌套列表 round-trip 后文件内容断言；工具栏各按钮；字号档位与配色预设**跨重启持久化**；保存失败 → recovery 提示 |
| `writing-assistant.spec.ts` | tab 展开/收起；宽度拖拽持久化；流式渲染；two-sided 布局；中断（abort）；会话随文章切换；**`.assistant.md` 跨重启恢复** |
| `writing-assistant-tools.spec.ts` | mock LLM 返回 tool 块 → 请求体落盘断言 `read_local` 参数与轮次；来源 chips 显示 **type 徽标+文件名**；读取中状态；`insert_into_article` 内容直接落编辑器；6 次封顶后模型直接回答；畸形 JSON 自我纠正；未知 id 错误回注 |
| `writing-assistant-search-thinking.spec.ts` | 🔍 开 → Tavily mock 命中、请求含搜索结果段；🔍 关 → web_search 回注未开启；🧠 三态 → 请求体 `reasoning_effort` 断言；reasoning 区块流式展开/完成折叠；两开关**跨重启持久化** |
| `writing-catalog.spec.ts` | 保存触发摘要任务（mock 断言调用）；导入/手动新文件补生成；删除同步清理；损坏 JSON 重建；**系统 prompt 注入断言**（请求体含六类目录摘要与条目 id） |
| `writing-edge.spec.ts` | 空 writing/ 空 repository/；老库无两目录自动创建；外部删除文件降级；无 description/guide 文件降级为文件名 |
| `writing-real-api.spec.ts` | 真实 API 冒烟（可选运行，同 briefing-real-api 模式）：一轮对话 + 一次 read_local + 一次 insert |
| 启动探测 | `window.api` 新 IPC 存在性断言（并入 smoke.spec.ts 或独立） |

## 10. 实现顺序建议

1. **Task 0 spike**：Milkdown round-trip 保真验证 + 端点 `tools` 参数探测（两个结论分别决定 §6.2 是否回退、§7.3 协议格式）。
2. 存储层：目录树 IPC + frontmatter + files:scan 排除 + state 字段。
3. 编辑器：Milkdown 集成 + 工具栏 + 保存策略。
4. 列表栏：tabs + 分组树 + 拖拽 + 导入。
5. AI 助手：工具循环 + 目录摘要注入 + 来源 UI + 🔍🧠。
6. catalog 管线 + E2E 补全 + 打包冒烟（`npm run package` 后验证 optimizeDeps 与学习库路径）。

## 11. 风险与开放问题

| 风险 | 缓解 |
|---|---|
| Milkdown 表格/嵌套列表保真不达标 | Task 0 spike + 回退方案（编辑/预览切换） |
| 端点不支持原生 tools | prompt 协议为默认路径，原生仅作增强 |
| 目录摘要 LLM 生成质量 | 摘要不进文件、只进 prompt，差摘要代价低；可随时删 `.catalog.json` 重建 |
| 大库全文读取撑爆上下文 | 用户已决策不截断；错误如实上报。后续可加"读取预算"提示，不进 MVP |
| `insert_into_article` 误插入 | 编辑器 history 撤销；会话记录可溯 |
