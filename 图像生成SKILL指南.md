# 图像生成 SKILL 指南

---

## 快速选择指南（先看这个）

| 你要做什么 | 用哪个 Skill | 一句话说明 | 输出形式 |
|-----------|-------------|-----------|---------|
| 给文章/应用出封面图 | **baoyu-cover-image** | 5 维度定制封面，分析内容后输出 prompt | 可复制到 ChatGPT/即梦的 prompt 文本 |
| 给长文配多张插图 | **baoyu-article-illustrator** | 分析文章结构，批量规划统一风格插图 | 每张插图一份 prompt 文本 + 汇总表 |
| 画流程图/架构图/知识树 | **baoyu-diagram** | 直接生成可嵌入网页的 SVG 代码 | 独立的 `.svg` 文件（暗色主题） |

**一句话判断**：
- 要「一张好看的图」→ 用 cover-image 或 article-illustrator
- 要「一张能说明结构的图」→ 用 diagram

---

## 上半部分：用户篇 —— 三个 Skill 能做什么、怎么用

### 一、总览

当前项目安装了三个图像/可视化相关的 skill：

| Skill | 用途 | 触发方式 | 输出 |
|-------|------|---------|------|
| `baoyu-cover-image` | 为文章/博客/应用生成封面图 | "给这篇文章出个封面"、"生成封面图" | prompt 文本（复制到外部生图工具） |
| `baoyu-article-illustrator` | 为长文配多张插图 | "给这篇文章配图"、"生成插图" | 多张 prompt 文本 |
| `baoyu-diagram` | 生成 SVG 矢量图（流程图、架构图等） | "画个知识树"、"画个架构图"、"diagram" | `.svg` 代码文件（直接嵌入网页） |

**核心特点**：
- `cover-image` / `article-illustrator`：不需要任何图像生成 API key，skill 完成「内容分析 → 风格匹配 → 提示词工程」后，你手动复制 prompt 到 ChatGPT / Gemini / 即梦 等网页版工具生成图片。
- `diagram`：直接输出 SVG 代码，无需 API key，也无需外部生图工具，可直接嵌入网页。

---

### 二、Skill 1：baoyu-cover-image（封面图生成器）

#### 2.1 它能做什么

- **分析文章主题**：自动提取关键词、判断情绪基调、识别视觉隐喻
- **匹配 5 个维度**：类型（Type）× 调色板（Palette）× 渲染风格（Rendering）× 文字密度（Text）× 情绪强度（Mood）
- **生成封面提示词**：输出一份结构化的英文 prompt，包含布局、配色、元素、字体等细节
- **支持参考图**：你可以上传一张参考图，skill 会提取其风格/色调融入提示词

#### 2.2 5 个维度速查

| 维度 | 可选值 | 默认 |
|------|--------|------|
| **Type（构图类型）** | hero（大视觉冲击力）/ conceptual（概念可视化）/ typography（文字为主）/ metaphor（隐喻）/ scene（氛围场景）/ minimal（极简） | auto |
| **Palette（调色板）** | warm（暖橙）/ elegant（优雅珊瑚）/ cool（工程蓝）/ dark（电影暗调）/ earth（自然绿棕）/ vivid（高饱和）/ pastel（柔和粉彩）/ mono（黑白）/ retro（复古）/ duotone（双色调）/ macaron（马卡龙） | auto |
| **Rendering（渲染风格）** | flat-vector（扁平矢量）/ hand-drawn（手绘）/ painterly（水彩笔触）/ digital（数字精致）/ pixel（像素风）/ chalk（粉笔黑板）/ screen-print（丝网印刷） | auto |
| **Text（文字密度）** | none（纯图）/ title-only（仅标题）/ title-subtitle（标题+副标题）/ text-rich（带标签） | title-only |
| **Mood（情绪强度）** | subtle（低对比柔和）/ balanced（均衡）/ bold（高对比强烈） | balanced |

#### 2.3 上手方式

**方式 A：直接给文章路径**
```
给这篇文章出个封面：./posts/my-article.md
```
Skill 会读取文章内容，自动分析并输出封面提示词。

**方式 B：直接给标题/主题**
```
给"AI 辅助学习的未来"出个封面，要科技感的
```

**方式 C：粘贴文章内容**
直接把文章全文粘贴过来，skill 会保存并分析。

**方式 D：带参考图**
```
给这篇文章出个封面，参考这张风格：./refs/style-ref.png
```

#### 2.4 输出格式

Skill 最终会给出一个 Markdown 代码块：

```markdown
## 封面生成提示词

请将以下提示词复制到 ChatGPT 4o/5 Image Generation、Gemini、即梦 等工具中生成图片：

```text
[完整的英文 prompt，包含布局、配色、元素等详细描述]
```

**参数建议**:
- 比例: 2.35:1（或你指定的比例）
- 风格: digital / flat-vector 等

**文件已保存**: `prompts/01-cover-topic-slug.md`
```

你只需复制 `text` 块里的内容，粘贴到任意网页版生图工具即可。

---

### 三、Skill 2：baoyu-article-illustrator（文章插图生成器）

#### 3.1 它能做什么

- **分析文章结构**：判断内容类型（技术/教程/方法论/叙事），提取 2-5 个核心论点
- **定位插图位置**：识别哪些段落需要视觉辅助，哪些不需要
- **规划插图密度**：从"极简（1-2张）"到"丰富（6张以上）"可选
- **统一风格**：确保所有插图在 Type × Style × Palette 三个维度保持一致
- **批量生成提示词**：一次性为整篇文章输出多张插图的 prompt

#### 3.2 三维度速查

| 维度 | 可选值 | 说明 |
|------|--------|------|
| **Type（信息结构）** | infographic（信息图）/ scene（场景叙事）/ flowchart（流程图）/ comparison（对比）/ framework（框架模型）/ timeline（时间线）/ mixed（混合） | 控制"这张图以什么结构呈现信息" |
| **Style（渲染风格）** | hand-drawn（手绘草图风）/ minimal-flat（极简扁平）/ sci-fi（科技蓝图）/ editorial（编辑数据）/ scene（温暖水彩场景）/ poster（海报丝网印） | 控制"用什么画笔风格画" |
| **Palette（配色方案）** | macaron（马卡龙柔和）/ warm（暖土色）/ neon（霓虹暗底） | 可选，覆盖 style 的默认配色 |

> **推荐组合**：不确定时直接选 `hand-drawn-edu` 预设 = infographic + sketch-notes + macaron，适合绝大多数知识类文章。

#### 3.3 上手方式

**方式 A：给文章路径**
```
给这篇文章配几张图：./posts/tutorial.md
```

**方式 B：粘贴文章内容**
直接粘贴长文，skill 会自动保存、分析、规划插图。

**方式 C：指定密度**
```
给这篇文章配图，要 rich（丰富）的，每张都要信息图风格
```

#### 3.4 输出格式

Skill 会输出每张插图的独立提示词：

```markdown
## 插图 1 生成提示词

**位置**: 第一章 / 第二段后
**建议文件名**: `01-infographic-core-concept.png`

请将以下提示词复制到 ChatGPT 4o/5 Image Generation、Gemini、即梦 等工具中生成图片：

```text
[完整的英文 prompt，包含 ZONES / LABELS / COLORS / STYLE / ASPECT 等结构化描述]
```

**参数建议**:
- 比例: 16:9
- 风格: sketch-notes
```

最后还会附上一张汇总表，方便你批量复制生成。

---

### 四、Skill 3：baoyu-diagram（SVG 矢量图生成器）

#### 4.1 它能做什么

- **直接输出 SVG 代码**：不是图片 prompt，而是可以直接嵌入网页的 `.svg` 文件
- **支持 9 种图类型**：架构图、流程图、时序图、结构图、思维导图、时间线、概念图、状态机、数据流图
- **暗色主题 + 语义配色**：内置专业配色系统（前端青、后端绿、数据库紫、云设施琥珀等），自动按组件类型着色
- **零外部依赖**：不需要 API key，不需要复制到外部工具，Claude 直接生成代码

#### 4.2 支持的图类型

| 类型 | 适合场景 | 特点 |
|------|---------|------|
| **Architecture** | 系统组件关系 | 分组框、连接箭头、区域边界 |
| **Flowchart** | 决策逻辑、流程步骤 | 菱形决策、圆角步骤框、方向流 |
| **Sequence** | 多角色时序交互 | 纵向生命线、横向消息、激活条 |
| **Structural** | 类图、ER 图、组织架构 | 分舱式方框、类型化关系线 |
| **Mind Map** | 头脑风暴、主题探索 | 中心节点、放射分支、有机布局 |
| **Timeline** | 时序事件 | 水平/垂直轴线、事件标记、时间段 |
| **Illustrative** | 概念解释、对比 | 自由布局、图标、注释、视觉隐喻 |
| **State Machine** | 状态转换、生命周期 | 圆角状态节点、标记转换、起止标记 |
| **Data Flow** | 数据转换管道 | 处理气泡、数据存储、外部实体 |

#### 4.3 上手方式

**方式 A：描述你要画的图**
```
画一个学习助手的系统架构图，包含前端界面、Kimi API、本地存储三个模块
```

**方式 B：上传内容让 skill 可视化**
```
把这个流程转成流程图 [粘贴流程描述]
```

**方式 C：指定图类型**
```
画一个思维导图，主题是"学习助手的三个功能模块：学习、寓言、知识树"
```

#### 4.4 输出格式

Skill 会直接输出一个独立的 `.svg` 文件，文件内嵌了样式和字体，可以直接：
- 用浏览器打开预览
- 用 `<img src="diagram.svg">` 嵌入网页
- 用 CSS 调整尺寸

> **与 cover-image / article-illustrator 的关键区别**：diagram 输出的是**代码**，不是 prompt。不需要再去外部工具生成，Claude 直接帮你画好。

---

### 五、当前默认配置（已预设置好）

`.claude/baoyu-skills/` 中已经放好了 `EXTEND.md` 配置文件，你**不需要做任何首次设置**：

| Skill | 预置配置 |
|-------|---------|
| `baoyu-cover-image` | 中文、quick_mode、prompt-only、独立输出目录 |
| `baoyu-article-illustrator` | 中文、prompt-only、`imgs/` 子目录 |
| `baoyu-diagram` | 无需 EXTEND.md，直接可用 |

- **语言**: 中文（zh）
- **模式**: prompt-only（只输出提示词，不调用 API）— 仅 cover-image 和 article-illustrator
- **确认流程**: quick_mode 已开启，多数情况下不需要反复确认

---

### 六、建议的使用策略（按项目阶段）

| 阶段 | 你要做什么 | 推荐 Skill | 原因 |
|------|-----------|-----------|------|
| **项目启动** | 生成应用封面 + 定义 Guy Billout 风格品牌规范 | `baoyu-cover-image` + `brand-guidelines` | 封面是门面，品牌规范确保后续风格一致 |
| **开发中期** | 生成知识树/主题树的节点图 | `baoyu-diagram`（Mind Map / Structural） | SVG 可交互、可缩放、文件小，比 PNG 更适合网页 |
| **开发中期** | 画学习流程图（新学习 → 继续 → 复习） | `baoyu-diagram`（Flowchart） | 直接输出 SVG，嵌入网页无压力 |
| **开发中期** | 生成 UI 空状态/引导/成就插画 | `baoyu-article-illustrator` | 一次性规划整套插画，确保风格统一 |
| **运营阶段** | 每次学习后自动生成寓言配图 | **不用 skill** | 复用预生成的 prompt 模板，直接替换变量即可 |
| **迭代阶段** | 学习报告可视化 | `baoyu-article-illustrator`（infographic 类型） | 把报告内容当文章分析，输出信息图 prompt |
| **任意阶段** | 系统架构图、数据流图 | `baoyu-diagram`（Architecture / Data Flow） | 直接出 SVG，不用走生图工具 |

**使用原则**：
1. **装饰性/叙事性图片**（封面、寓言、插画）→ `cover-image` / `article-illustrator` → 复制 prompt 到外部生图工具
2. **结构性/功能性图表**（架构、流程、知识树）→ `baoyu-diagram` → 直接得 SVG
3. **批量/重复性生成**（每次学习后出寓言图）→ 不用 skill，复用模板

---

### 七、未来切换回 API 模式（当你有了 key 之后）

编辑对应 `EXTEND.md` 文件，把 `preferred_image_backend: prompt-only` 改成：

| 值 | 效果 |
|----|------|
| `auto` | 自动检测可用后端 |
| `ask` | 每次手动选择 |
| `codex-imagegen` | 固定使用 Codex 原生生图 |

改完即可让 skill 直接调用 API 出图，无需其他改动。`baoyu-diagram` 无需任何改动，因为它不依赖外部 API。

---

## 下半部分：Agent 篇 —— Skill 改造与安装记录

### 一、改造背景

用户没有图像生成 API key（仅有 Kimi coding plan），但希望利用 baoyu skill 的「分析 + 提示词工程」能力。用户手动将 prompt 复制到 ChatGPT / Gemini / 即梦 等网页版工具生成图片。

同时，学习助手项目需要 SVG 矢量图能力来支撑「知识图谱/主题树」和「学习流程图」等功能，因此额外引入了 `baoyu-diagram`。

**约束条件**：
- 只改本地项目文件，不动仓库
- 保留现有 API 调用逻辑，未来可一键切回
- 跳过阻塞式的首次设置流程

### 二、改造方案概述

**对于 cover-image 和 article-illustrator**：
引入 `preferred_image_backend: prompt-only` 哨兵值。当 skill 的后端解析逻辑识别到此值时，跳过所有 API 调用环节，改为格式化输出提示词文本。

**对于 diagram**：
直接安装，无需改造。该 skill 本身就不依赖外部图像 API，输出的是 SVG 代码。

### 三、具体改造与安装步骤

#### 步骤 1：删除无用 Skill

删除了 `.claude/skills/baoyu-imagine/` 整个目录（共 32 个文件）。该 skill 依赖 Google API 调用，在当前环境下完全无用。

#### 步骤 2：安装 baoyu-diagram

从仓库复制到项目：
```bash
cp -r "C:/Users/86468/Desktop/repository/baoyu/baoyu-diagram" ".claude/skills/"
```

`baoyu-diagram` 无需 EXTEND.md 配置，无需 prompt-only 改造，直接可用。

#### 步骤 3：预创建 EXTEND.md 配置文件

在 `.claude/baoyu-skills/` 下创建了两个 EXTEND.md，让 cover-image 和 article-illustrator 的 Step 0 / Step 1.5 直接命中，跳过阻塞式首次设置：

**`baoyu-cover-image` 配置**（`version: 3`）：
- `quick_mode: true` — 跳过确认流程
- `language: zh` — 中文环境
- `default_output_dir: independent` — 封面图使用独立目录
- `preferred_image_backend: prompt-only` — 核心：只输出提示词

**`baoyu-article-illustrator` 配置**（`version: 1`）：
- `language: zh`
- `default_output_dir: imgs-subdir` — 插图放到文章 `imgs/` 子目录
- `preferred_image_backend: prompt-only`

#### 步骤 4：修改 baoyu-cover-image/SKILL.md（4 处）

| 修改点 | 原内容 | 改造后 |
|--------|--------|--------|
| **Image Generation Tools 第 2 条** | 仅说明 `preferred_image_backend` 优先使用配置值 | 新增说明：`Special value prompt-only: skip all backend selection and output the final prompt for the user to copy-paste into ChatGPT/Gemini/即梦/etc. This is the default for this project.` |
| **Step 4 后端选择** | 直接选择后端并调用 | 新增分支：`If preferred_image_backend: prompt-only: skip to Step 4-Prompt-Only below.` |
| **新增 Step 4-Prompt-Only** | 无 | 新增完整小节：保存 prompt → 读取内容 → 剥离 YAML frontmatter → 按固定 Markdown 格式输出（含提示词文本、参数建议、文件路径）→ STOP，不调用任何后端 |
| **Step 5 完成报告** | 只有标准模式（已生成图片） | 新增 Prompt-only mode：标注 `⚠ cover.png (请使用外部工具生成后手动放入)` |
| **Changing Preferences** | 无 `prompt-only` 说明 | 新增一行：`preferred_image_backend: prompt-only` — output prompt text only; user copies to external image tools. No API keys needed. |

#### 步骤 5：修改 baoyu-article-illustrator/SKILL.md（4 处）

| 修改点 | 原内容 | 改造后 |
|--------|--------|--------|
| **Image Generation Tools 第 2 条** | 同 cover-image | 同模式增加 `prompt-only` 哨兵值说明 |
| **Step 5 后端选择** | 直接选择后端并批量/顺序生成 | 新增分支：`If preferred_image_backend: prompt-only: skip to Step 5-Prompt-Only below.` |
| **新增 Step 5-Prompt-Only** | 无 | 新增完整小节：验证所有 prompt 文件 → 逐个读取并剥离 frontmatter → 按固定格式输出每张插图（含位置、建议文件名、参数建议）→ 输出汇总表格 → STOP |
| **Step 6 收尾** | 标准模式：插入 `![desc](path)` Markdown 图片引用 | 新增 Prompt-only mode：不插入图片引用（文件尚不存在），改为提供可复制的 Markdown 模板，完成报告标注 `Mode: prompt-only (未调用 API)` |
| **Changing Preferences** | 无 `prompt-only` | 同 cover-image 模式增加说明 |

#### 步骤 6：修改两个 preferences-schema.md（各 2 处）

**`baoyu-cover-image` 和 `baoyu-article-illustrator` 的 schema 文件**：

| 修改点 | 原内容 | 改造后 |
|--------|--------|--------|
| **schema 注释** | `preferred_image_backend: auto  # auto|ask|<backend-id>` | 增加 `prompt-only`：`auto|ask|prompt-only|<backend-id>` |
| **字段说明表** | `ask` 和 `<backend-id>` 的描述 | 插入 `prompt-only` 的完整描述：output final prompt text for user to copy into external tools (ChatGPT, Gemini, 即梦, etc.); skips all backend calls |

#### 步骤 7：修改 baoyu-article-illustrator 工作流文档（2 处）

**`references/workflow.md`**：

| 修改点 | 内容 |
|--------|------|
| **Step 5 开头模式表** | 在 `### 5.1` 前插入：Standard 模式（调用后端生成图） vs Prompt-only 模式（保存 prompt → 输出文本 → STOP）的对照表 |
| **新增 5.6 Prompt-Only Output** | 在 `### 5.5 Generate` 后插入完整小节：读取 prompt 文件 → 剥离 frontmatter → 按固定格式逐个输出 → 汇总信息表 → STOP |

### 四、改造验证

通过以下命令逐项验证：

```bash
# 1. baoyu-imagine 已删除，baoyu-diagram 已安装
ls .claude/skills/ | grep -E "baoyu-(imagine|diagram)"
# 期望输出：baoyu-diagram（无 baoyu-imagine）

# 2. EXTEND.md 包含 prompt-only
grep "preferred_image_backend: prompt-only" .claude/baoyu-skills/*/EXTEND.md

# 3. SKILL.md 包含 Prompt-Only 小节
grep -c "Step 4-Prompt-Only" .claude/skills/baoyu-cover-image/SKILL.md
grep -c "Step 5-Prompt-Only" .claude/skills/baoyu-article-illustrator/SKILL.md

# 4. schema 包含 prompt-only
grep "prompt-only" .claude/skills/*/references/config/preferences-schema.md

# 5. workflow 包含 5.6
grep "5.6 Prompt-Only Output" .claude/skills/baoyu-article-illustrator/references/workflow.md
```

全部验证通过。

### 五、改造设计决策

1. **为什么用 `prompt-only` 哨兵值而不是直接删代码？**
   - 保留原有 API 调用逻辑完整无损，未来用户获得 key 后只需改一行配置即可切回，无需重新安装或修改 skill 文件。

2. **为什么预创建 EXTEND.md 而不是让首次设置走一遍？**
   - 首次设置会问 8 个问题，用户已明确需求（中文、只出提示词、跳过确认），预配置可直接命中，提升体验。

3. **为什么 prompt-only 输出要剥离 YAML frontmatter？**
   - 外部生图工具（ChatGPT、即梦等）只接收纯文本 prompt，frontmatter 对它们无意义，剥离后用户可直接复制粘贴。

4. **为什么 Step 6（Prompt-only 模式）不插入图片 Markdown？**
   - 图片文件尚未生成，插入 `![desc](path)` 会导致 Markdown 渲染出 broken image。改为提供模板，等用户手动生成图片后自行粘贴。

5. **为什么引入 baoyu-diagram 而不是继续用 article-illustrator 画知识树？**
   - 知识树需要可交互、可缩放、文件体积小。SVG 代码比 PNG 图片更适合网页场景，且 diagram 直接输出代码，无需再走「复制 prompt → 外部生图 → 下载图片」的流程。

---

*文档版本：v1.1*
*更新时间：2026/05/03*
