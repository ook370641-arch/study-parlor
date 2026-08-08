# 写作功能 UX 修复设计

日期：2026-08-08
状态：已批准（brainstorming 逐节确认）
范围：写作功能（编辑器 + 文章树 + 摘要机制），一次性修完 7 个体验问题

## 红线

- **绝不删除用户已有文章**：本迭代不改动学习库现有数据；所有删除操作改为移入回收站目录，文件始终可从磁盘回溯。
- 只改代码，不做学习库数据迁移/清洗。

## 问题与根因

| # | 用户感受 | 根因 |
|---|---|---|
| 1 | 加粗、分级标题"用不了" | 项目无任何编辑器内容 CSS；Tailwind preflight 把 h1-h6 重置为 `font-size/weight: inherit`，标题与正文视觉无差；`strong` 仅靠 `bolder` 相对计算，在当前正文字重下几乎无视觉跳变 |
| 2 | 报纸版式字体不是黑色；颜色不能按选中文字切换 | 整篇色调靠 🎨 循环按钮（parchment/plain/ink），默认暖米；无选中文字级着色 |
| 3 | 字号体系混乱 | 两套字号并存：工具栏 A-/A+（`writingFontSize` 管正文）与右上角 −/+（`writingUIFontSize` 管 UI） |
| 4 | 分组混乱：能拖入不能拖出，无法排序整理 | 根级区域不是放置目标；分组行只接受"拖入"，无 before/after 排序；`writingOrder` 仅覆盖文件 |
| 5 | 展开写作助手后文字被挤压消失 | 面板展开时编辑区不让宽；编辑器无 `overflow-wrap`，长串溢出到面板下 |
| 6 | 找不到新增/删除入口 | 新建/删除只在右键菜单（隐藏式交互是唯一路径，违反 feature-development §12） |
| 7 | 悬停展开摘要+框变高，不需要 | 摘要每次保存都 fire-and-forget 重生成（`electron/ipc/writing.ts`），且树行悬停显示 |

## 设计 A：编辑器内核（问题 1/2/3/5）

### A1. 新增 `src/components/writing/writing-editor.css`

编辑器内容专用样式（补回被 preflight 重置的语义）：

- 正文 = `var(--writing-body-size)`。
- **标题阶梯（只支持 H1-H3）**：H1/H2/H3 = 正文 × 1.6 / 1.35 / 1.15，字重 600。Milkdown commonmark 自带 `#`/`##`/`###` 输入即转，补 CSS 后即活。
- `strong { font-weight: 700 }`，不依赖 `bolder`。
- 编辑器容器 `overflow-wrap: anywhere`，长 URL/无空格串强制换行。

### A2. 字号统一

- 移除工具栏 A-/A+ 与 `writingFontSize` 的使用（state 字段保留不读，兼容旧 state.json）。
- 正文字号按档位从 `writingUIFontSize` 映射：新增 `WRITING_BODY_FROM_UI` 常量（`src/lib/briefing-font-size.ts`，逐档写死 px，与 `ACADEMIC_BODY_STYLES` 同档同值，独立常量便于日后分化），标题按 A1 阶梯再放大。右上角 −/+ 一个入口管全局。

### A3. 字体颜色

- **默认色**：跟随主题——报纸主题默认黑 `#1a1a1a`，学术主题默认暖米 `#e8d5b7`。移除 🎨 循环按钮与 `writingTone` 的使用（字段保留不读）。
- **选中文字变色**：工具栏新增颜色下拉框（`data-testid="writing-toolbar-color"`）。色板：默认（跟随主题）、暖橙 `#d97757`、赤红 `#b34747`、墨灰 `#9c9490`、黑 `#1a1a1a`。
- 实现：Milkdown v7 自定义 mark `textColor`（`@milkdown/utils` 的 `$mark`/`$markSchema` + `$command`），toMarkdown 序列化为 `<span style="color:#xxx">…</span>`；选区为空时设置 stored mark 作用于后续输入。
- **回读（本迭代最大技术风险）**：Milkdown v7 remark 管线不会自动把 inline `<span>` 还原成 mark，需一个小的 mdast 转换插件（识别 `<span style="color:…">` html 节点 → `textColor` mark 节点）。**实现计划第一个任务是 round-trip 验证 spike**：写带色文字 → 保存 → 重开 → 颜色仍在，通过后才铺开其余工作。
- 工具栏标题按钮：新增 H1/H2/H3 下拉或循环按钮（`data-testid="writing-toolbar-heading"`），与输入规则双路径。

### A4. 面板挤压（问题 5）

写作助手面板是 flex 布局的在流兄弟节点（`WritingAssistantPanel` 有固定宽度、编辑区 `flex-1 min-w-0` 会让宽），文字被吞的真因是编辑器缺少 `overflow-wrap`——长串不换行、横向溢出到面板下方。修复 = A1 CSS 的 `overflow-wrap: anywhere`（编辑列 `min-w-0` 已具备），不加额外 padding。E2E 断言：面板展开时长行在可见区域内换行。

## 设计 B：树与分组管理（问题 4/6）

### B1. 拖拽统一协议（对标飞书/如流知识库，零新增常驻 UI）

拖拽全程只有两种视觉反馈，**落点语义完全由拖动位置表达**：

- **横线**（排序落点，线的缩进 = 目标层级）：
  - 根级两行之间、无缩进 → 移动到根目录（未分组）该位置。**这就是"拖出分组"**。
  - 组内两行之间、带缩进 → 在该分组内排序；从别的组拖来 = 移入该组并落在该位置。
  - 列表底部留白区 → 根级末尾。
- **分组整行 ring 高亮**（现有行为不变）：悬停分组行中部 → 放入该组末尾。
- 分组行上/下边缘 → 无缩进横线 → 分组自身参与根级排序。

统一规则：落在线上的 = 移到该线所属父级 + 该序号；落在分组中部 = 移入该组。一个协议覆盖拖入/拖出/排序/换组。

- `writingOrder` 扩展到分组节点（state 加默认值，兼容旧数据）。
- 右键菜单补"移出分组"作为非拖拽辅助路径（不是唯一路径，仅辅助）。

### B2. 行内增删按钮

- 每行右侧按钮，平时 `opacity-0`，行悬停 `opacity-100`：
  - **文章行：仅 🗑**（`data-testid="writing-node-delete"`）。
  - **分组行：＋ + 🗑**（＋ = 新建文章到该组，`data-testid="writing-node-create"`）。
- 右键菜单保留（辅助路径）。列表顶部"＋ 新建文章 / 新建分组"不动。

### B3. 删除语义（红线落地）

- `writing:delete` 改语义：目标移到 `<学习库>/<root>/.trash/`（保留相对目录结构，重名加 `-HHMM` 后缀），**不真删**。`.trash` 加入扫描隐藏名单（`HIDDEN_FILE_PATTERNS`），树中不可见。
- 删文章确认文案："确定删除《xx》？文件将移入回收站（.trash/），可手动恢复。"
- 删分组 = **解散**：组内文章先全部移回该组父级（不删除任何文章），仅当目录为空才移入 .trash。确认文案："确定解散分组「xx」？组内 N 篇文章将移回上一级，不会被删除。"
- 复用现有 `ConfirmDialog`。

## 设计 C：摘要机制（问题 7）

- **移除展示**：`WritingTree` 悬停展开摘要+框变高整块删除，行高固定。
- **触发时机收敛为唯一时机**：点击"写作"来源按钮进入写作页、tree 加载时，主进程 diff：扫描树 vs `.catalog.json`——新增（无条目）与变动（文件 mtime > 条目记录 mtime）的文章，后台静默逐篇生成摘要写回 catalog。
- `WritingCatalogEntry.updatedAt` 改存文件 mtime（毫秒数）；旧格式（日期字符串）条目视为全部待更新，自然迁移一轮。
- 砍掉 `writing:write` 与 `writing:importFiles` 里的保存即生成逻辑——保存完全不动 catalog；下次进入写作页时 diff 凭 mtime 自然捕获变动（若保存时同步 mtime，diff 反而看不到变动，这是坑）。
- 生成失败静默跳过，下次进入 diff 再捞。UI 无阻塞、无摘要展示。
- **隐藏消费方不动**：写作助手 prompt 继续读 `.catalog.json`（`writing-assistant/prompt.ts`）。

## UI 出口声明（feature-development §12）

| 功能 | 入口 | 收起态 | testid |
|---|---|---|---|
| 选中文字变色 | 工具栏颜色下拉框 | 一个色块按钮 | `writing-toolbar-color` |
| 标题级别 | 工具栏 H 下拉 + `#` 输入规则 | 一个 H 按钮 | `writing-toolbar-heading` |
| 行内删除/新建 | 行右侧悬停按钮 | 不可见（opacity-0） | `writing-node-delete` / `writing-node-create` |
| 拖出分组/排序 | 拖拽横线（无缩进 = 根级） | 无 | 横线容器加 `data-testid="writing-drop-line"` |

每个入口至少一个 E2E 断言证明运行时渲染。

## 向后兼容

- `writingFontSize` / `writingTone`：state 字段保留，代码停止读取；旧 state.json 不报错。
- `.catalog.json` 旧 `updatedAt`（日期字符串）：解析失败即视为待更新，自动迁移。
- `writingOrder` 新增分组键：默认 `{}`，旧数据无键 = 按扫描顺序。
- `.trash/` 目录不存在时首次删除自动创建；扫描隐藏名单兜底，旧库无 .trash 不受影响。

## 测试计划（定向，不跑全量）

- **单元**（`tests/`）：
  - `writing-catalog`：diff 新增/变动/未变/旧格式迁移。
  - `.trash` 移动：文件/分组解散/重名后缀/隐藏名单。
  - `textColor` mark 序列化与回读 round-trip。
- **E2E 定向**（`node scripts/e2e-changed.js --run`）：writing 域 spec——颜色 round-trip、标题阶梯渲染、拖拽出分组到根级、行内删除确认、悬停按钮可见性；"保存触发 catalog 更新"旧断言按新时机改写。
- 新增/改动 spec 同步登记 `e2e/source-map.json`。
- 打包假设无变化（纯代码改动，无新二进制依赖）。

## 明确不做

- 不支持 H4-H6。
- 不做跨主题独立配色记忆（默认色跟主题走）。
- 不做回收站的 App 内恢复 UI（手动从 `.trash/` 捞回即可，本期不建）。
- 不改动学习库现有文件与目录结构（除用户主动删除/移动操作）。
