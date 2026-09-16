# 来源边栏拖拽排序 + 博客阅读排版优化 — 设计文档

日期：2026-09-16
状态：已确认（用户拍板：列宽保持现状宽列；排版只做渲染层）

## 背景与目标

两个独立的小功能，同一迭代交付：

1. **来源边栏拖拽排序**：简报页左侧「来源」边栏（`BriefingSourceSidebar.tsx`）的五项导航（写作/前沿/博客/求职/拾贝）顺序硬编码，用户希望拖拽调整并记住。
2. **博客阅读排版对标官网**：以《Demystifying evals for AI agents》为例，用户体感官网排版优于应用内渲染。已用无头浏览器实测官网 computed style 作为对标依据（见下）。

**前提约束（用户定）**：只优化「文章原内容（本地 .md）里存在材料」的项。官网有但本地 md 里没有的不做：顶部导语（lede 段）、被导入管线压平成纯文本的对比表格。

**用户已拍板**：正文列宽保持现状（`w-[95%] max-w-[1600px]` 宽列），收窄方案否决。

## 官网实测基准（1440px 视口，Playwright computed style）

| 元素 | 官网值 |
|---|---|
| 正文 | anthropicSerif 17px / 26.35px（≈1.55），列宽 640px，色 #141413，底 #faf9f5 |
| H2 | 无衬线 25px / 600，下间距 8px |
| H3 | 无衬线 19px / 600，上间距 32px |
| 列表项 | li margin-bottom 12px |
| 链接 | weight 700 + 下划线，近正文色 |
| 图注 | 14px，#5e5d59，letter-spacing 0.15px，距图 8px |
| 代码块 | 圆角卡片底，等宽 16px，底栏 Copy / Expand 按钮 |

## 功能 A：来源边栏拖拽排序

### 数据与持久化

- `src/types/index.ts`：抽命名类型 `BriefingSourceId = 'writing' | 'digest' | 'anthropic' | 'job-briefing' | 'scout'`，替换 `briefingSource` 字段现有的三处内联联合（types:631、store:152、store:160）。
- `StateJson` 新增 `briefingSourceOrder?: BriefingSourceId[]`（可选字段，老 state.json 无此字段）。
- store 初始化时归一化（general §8 向后兼容）：
  - 缺省/非数组 → 用默认顺序 `['writing','digest','anthropic','job-briefing','scout']`；
  - 过滤未知 id；追加已存在但顺序表遗漏的 id（未来新增来源时旧状态自动兼容）。
- 新 action `setBriefingSourceOrder(order)`：set store + `ipc.patchState({ briefingSourceOrder: order })`（复用现有 patchState 通道，不新增 IPC）。

### 交互（`BriefingSourceSidebar.tsx`）

- 仅**展开态**可拖拽（折叠态 56px 宽只有图标，插入反馈不可读，禁用）。
- HTML5 原生拖拽：条目 `draggable`，`onDragStart` 记 index；`onDragOver` 按鼠标在行内上/下半计算插入位，显示琥珀色插入横线（视觉语言与 `WritingTree.tsx` 排序一致）；`onDrop` 重排 → `setBriefingSourceOrder`。
- 可发现性（ui-styling / feature-development §12，拖拽不能是唯一路径）：条目 hover 时左侧浮现 `⠿` 握把，`title="拖拽排序"`，`cursor: grab`。
- 拖拽过程中点击导航行为抑制（drop 后才允许 click，避免误触发切换）。

### 测试

- 单元：顺序归一化函数（未知 id 过滤 / 缺 id 追加 / 空数组回退默认 / 已排好序原样返回）。
- E2E（并入既有 briefing 侧栏相关 spec，不新建文件）：拖拽「博客」到首位 → 断言 DOM 顺序 + 重启后顺序保持。若无覆盖侧栏的既有 spec，新建 `e2e/specs/briefing-source-order.spec.ts` 并登记 `e2e/source-map.json`。

## 功能 B：博客阅读排版（渲染层）

全部改动限定在共享渲染链路：`ArticleBodyChunks → MarkdownRenderer(briefingStyle) → briefingComponents + markdown.css` 的 `.briefing-body-*` 作用域内。学习报告/对话/寓言的渲染（`.md-body` 无 briefing 前缀的选择器）一律不动。学术/报纸双主题同步适配。博客与拾贝两个阅读器共用此链路，同时受益。

### B1. 标题层级拉开（对齐官网 H2 25px / H3 19px 的对比度）

保留等宽字体设计语言不动，只调字号与间距（`.briefing-body-* .md-body` 作用域）：

- h2：16px → 22px，weight 600，margin 24px→36px 上 / 12px 下；学术主题 `◆` 菱标保留。
- h3：14px → 17px，margin-top 18px→32px（对齐官网实测）。
- h4：13px → 15px。

### B2. 列表间距（对齐官网 li 12px）

`.briefing-body-* .md-body li { margin: 10px 0 }`（现 4px）。术语表与引用列表立刻透气。

### B3. 图片图注 figure 化

新增 `src/components/md/rehypeFigureCaption.ts`（参照同目录 `rehypeTermHighlight.ts` 的导出模式）：

- 变换规则：遍历顶层兄弟节点，`p` 的唯一非空子节点是 `img`，**且**紧随的兄弟是 `p`、纯文本 ≤140 字符、内部不含 `a`/`img` 元素 → 两者合并为 `figure > img + figcaption`。
- 不满足条件一律不动（图无注、长段落、含链接的段落都保持原样）。
- `MarkdownContent` 新增可选 prop `figureCaptions`；`MarkdownRenderer` 在 `briefingStyle` 存在时启用，其余调用方不变。
- 样式：figure 居中、间距收紧；figcaption 0.875em、muted、居中、letter-spacing 0.02em（学术 `text-parchment/50`，报纸 `#777`），图注与图间距 8px（对齐官网）。

### B4. 代码块卡片化 + 复制按钮（对齐官网 Copy 底栏）

`src/components/md/components.tsx` 的 `code` 渲染器（带 `className` 即块级）改为内部组件 `MdCodeBlock`（不导出，遵守 ui-styling §10）：

- 结构：`div.md-codeblock` > 顶栏（语言标签，从 `language-xxx` 解析；无语言则不显示标签）+ `pre > code`；复制按钮放顶栏右侧，点击 `navigator.clipboard.writeText`，按钮文案短暂变「已复制 ✓」（1.5s 后还原）。
- 样式（双主题）：圆角 8px、边框、padding 14px 16px；学术底 `#15100d`（沿用现 pre 底色），报纸底 `#f5f5f5`；顶栏文字 11px muted。
- 行内 code 样式不动。

### B5. 链接加粗（对齐官网 weight 700 + 下划线）

`.briefing-body-* .md-body a`：`font-weight: 600`、`text-underline-offset: 3px`。颜色维持琥珀（设计语言登记的点睛色），不改成官网的正文色。

### B6. 术语 strong 点睛

`.briefing-body-* .md-body li > strong:first-child { color: #d97757 }`（学术/报纸同用琥珀）。术语表（task/trial/grader…）的词条名一眼可辨。

### 明确不做

- 收窄列宽（用户否决）。
- 恢复被导入管线压平的表格（md 无材料；导入管线不改）。
- 官网导语 lede（md 无材料）。
- 标题换无衬线字体（破坏已登记的等宽体设计语言）。

### 测试

- 单元 `tests/figure-caption.test.ts`：合并（图+短文本）、不合并（>140 字符 / 含链接 / 图后无段落 / 纯图）、多图连排各自成 figure。
- 单元（或组件）测试代码块复制：渲染 `MdCodeBlock` 路径 → 点击复制按钮 → clipboard mock 断言收到代码文本。若现有测试基建不含 jsdom 组件测试，则改为 E2E 断言。
- E2E 定向（并入既有 anthropic reader / writing 相关 spec）：打开含图注与代码块的 fixture 文章 → 断言 `figcaption` 存在且文本正确、代码块复制按钮存在；双主题各断一次。
- 手动目检：真实《Demystifying evals for AI agents》在学术主题下的整体效果。

## 影响面与风险

- `markdown.css` 的改动全部限定 `.briefing-body-*` 作用域，不影响学习报告/对话/寓言/精选集卡片（`.md-report`/`.md-dialogue`/`.md-fable`/`.collection-entry-body`）。
- `rehypeFigureCaption` 仅在 `briefingStyle` 下启用；精选集条目卡片（`collection-entry-body` 也走 MarkdownRenderer）——plan 阶段确认其调用是否带 briefingStyle，若带则需确认图注化在卡片内也可接受（卡片同样源自文章正文，预期可接受）。
- 旁注（ArticleAnnotations）按段落 `getBoundingClientRect` 定位，样式变化后自动重算，无需改动。
- 状态字段为可选新增，老 `state.json` 零迁移成本。

## 验收清单

1. 边栏拖拽：展开态可拖、折叠态不可拖；插入横线出现；drop 后顺序立即生效；重启应用顺序保持；旧 state.json（无该字段）启动正常。
2. 排版：以真实 evals 文章目检——标题层级清晰、术语表透气且词条琥珀色、图片带图注、代码块有顶栏+复制按钮且复制内容正确、链接加粗。
3. 报纸主题下上述各项不破版。
4. 学习报告/对话页渲染无回归（跑对应定向测试）。
5. 双主题切换后样式各自正确。
