# 写作编辑器：粘贴清洗 + 悬浮格式栏 + 排版格调化设计

日期：2026-08-11
状态：已批准（brainstorming 逐节确认 + visual companion 视觉对齐）
范围：写作编辑器（粘贴管线、悬浮格式工具栏、顶部工具栏、文档渲染 CSS、分隔线行为、智能 Enter）

## 背景与目标

写作编辑器（Milkdown v7）的粘贴体验有三个问题，顶部工具栏还需重组，文档排版要做一次符合「夜色底 + 米色 + 暖橙」格调的视觉提升：

1. 外部粘贴偶尔带 `<span style="color:...">` 颜色字段
2. 粘贴 markdown 源码时 `**加粗**` 不渲染成加粗，重开文章后积累多余 `**`
3. 粘贴的行内代码 / 代码块渲染成代码字体，句子前后字体不统一
4. 加粗 / 斜体 / 删除线 / 文字颜色要移出顶部栏，改为「选中文字时浮现」的悬浮格式栏
5. 引用 / 分隔线 / 无序列表 / 有序列表 / 分级标题的文档渲染做格调化设计（visual 已对齐）

**目标：粘贴进来字体统一、重开文章不出现奇怪字符、格式化操作不脱离选区。**

## A. 粘贴管线（自定义 handlePaste）

**新文件 `src/lib/milkdown-clipboard.ts`**，替换 `WritingEditor.tsx` 里 `.use(clipboard)`（Milkdown clipboard 插件）为自定义插件。

**复制方向保留**：`clipboardTextSerializer` 复用 Milkdown 现有逻辑（`isPureText` + `serializerCtx`），编辑器内复制仍产出 markdown 文本。

**handlePaste 策略（按优先级）：**

| 情况 | 处理 |
|---|---|
| 不可编辑 / 无 clipboardData / 光标在代码块内 | `return false`，交还默认 |
| Shift+粘贴 | `return false`，默认纯文本插入 |
| 剪贴板含 `data-pm-slice`（应用内部复制） | **去块结构后闭合插入**：列表/标题/引用拍平为段落，行内样式（加粗/颜色/行内代码）保留（2026-08-26 修订：原「`return false` 交默认」会让开口 slice 把标题包进列表——粘贴劫持） |
| 含 `vscode-editor-data`（从 VS Code 粘贴） | 统一走外部清洗，代码转纯文字（决策点，见 §明确不做） |
| 外部，HTML 含真实格式标签（`<strong>/<b>/<em>/<i>/<a>/<ul>/<ol>/<table>/<blockquote>/<h1-h6>/<img>/<pre>`） | 用清洗后 HTML（沿用 `sanitizeExternalHTML` 去 style/class，h1-h6 降级为 p） |
| 外部，HTML 无实质格式（或纯文本） | 用纯文本按 markdown 解析（`**bold**` → 加粗，表格/列表/标题正常成型） |

**统一清洗（对外部两条路径产出的 slice 走一遍，切片级）：**
- 行内代码 `code` mark → 去掉 mark，保留文字
- 代码块 `code_block` → 转成 `paragraph`，换行转软换行（`<br>`），保留文字内容
- `textColor` 颜色 mark → 去掉，保留文字

**效果对账：** 颜色不进来、`**bold**` 渲染成真加粗、字面 `**` 不进文档（重开不积累）、代码统一转普通文字（前后字体统一）。

> 实现要点：Milkdown clipboard 的纯文本路径（`html.length === 0` → 自行 `parser(text)`）绕过 ProseMirror 的 `transformPasted` 链，所以必须整体接管 handlePaste，切片清洗才能覆盖两条路径。

## B. 悬浮格式工具栏

**新文件 `src/lib/milkdown-selection-bubble.ts`**，`$prose` 插件 + `view`，复用 `milkdown-table-handles.ts` 的 DOM 挂载 / 定位 / 滚动跟随模式。

- **触发**：非空选区 + 可编辑 + 不在代码块内
- **定位**：选区上方居中，视口放不下时翻到选区下方；滚动/resize（capture 阶段）跟随
- **四个控件**（沿用现有命令，`mousedown.preventDefault()` 保住选区不塌陷）：

| 控件 | testid | 命令 |
|---|---|---|
| 加粗 | `writing-bubble-bold` | `toggleStrongCommand` |
| 斜体 | `writing-bubble-italic` | `toggleEmphasisCommand` |
| 删除线 | `writing-bubble-strikethrough` | `toggleStrikethroughCommand` |
| 颜色 | `writing-bubble-color` + 6 色块 `writing-bubble-color-option` | `textColorCommand` |

- **点击后保持**：点击任一按钮后悬浮栏不消失、选区不塌陷，可连续操作（如同一选区先改颜色再加粗）
- **隐藏**：点击空白处 / Esc / 选区消失 / 失焦
- 光标无选区时不出现（键盘 Ctrl+B/I 仍可用）
- 容器 `data-testid="writing-format-bubble"`

### 色板（6 色，替换现有 TEXT_COLOR_PALETTE）

| 名称 | 值 |
|---|---|
| 默认 | 无色（移除颜色，跟随主题） |
| 红 | `#e5533b` |
| 蓝 | `#5b8cff` |
| 黄 | `#e8c84a` |
| 绿 | `#4caf7d` |
| 橙 | `#d97757`（应用 ember，保持设计语言） |

## C. 顶部工具栏（`WritingToolbar.tsx`）

- **移除**：加粗 / 斜体 / 删除线 / 文字颜色按钮及颜色下拉
- **保留**：引用、分割线、标题（H▾）、失败提示 `hint`
- **图标更换**（对应已拍板方向）：
  - 引用按钮 = 蜡烛 SVG 图标（`data-testid="writing-toolbar-blockquote"` 保留）
  - 分割线按钮 = 轨道 SVG 图标（`data-testid="writing-toolbar-hr"` 保留）
  - 标题 H▾ 不变

## D. 文档渲染格调（`writing-editor.css`，visual 已对齐）

> 通用：装饰元素的「墨/烛身」色用 `currentColor`（学术主题=米色 `#e8d5b7`，报纸主题=黑 `#1a1a1a`），点缀用固定 ember `#d97757`。报纸主题 = 同一套造型，颜色体系随 `--writing-tone-color` 自动切换，无需两套 CSS。

| 元素 | 造型 |
|---|---|
| `blockquote` 引用 | 左边一条**竖直蜡烛**：`::before` 放 data-URI SVG（烛身 `currentColor`、烛焰 ember、一道融蜡），随引用高度拉伸；文字 `padding-left` 让开 |
| `hr` 分隔线 | **轨道系统**：固定椭圆 + 中心行星（ember）+ 卫星（`currentColor`）绕中心**公转**（`@keyframes` 旋转 + `scale` 压扁成椭圆路径，约 14s 一圈）；`prefers-reduced-motion: reduce` 下动画停止，卫星停在起点 |
| `ul` 无序列表 | 烛光点：`list-style:none` + `li::before` 发光 ember 圆点（`box-shadow` 光晕） |
| `ol` 有序列表 | 暖橙序号：`::marker { color: #d97757; font-weight: 600 }` |
| `h1`-`h3` 标题 | **烛首**：`::before` 放 ember 烛焰装饰，随字号缩放；标题字重 600/700、字号阶梯维持现有 |

**不做特殊渲染**（用户否决，维持默认）：加粗（纯加粗）、下划线（不新增功能）、删除线（素 line-through）、文字颜色（纯色，无光晕）。

## E. 分隔线行为

- **插入后光标落下一行**：`insertHrCommand` 包装——插入后光标定位到分隔线下方新起一行（无内容则补空段），用户可立即继续输入
- **可删除**：验证行首退格 / 行尾删除能否删掉分隔线；若不可删，补 keymap / 命令路径使其可删

## F. Enter 行为（智能 Enter）

**背景**：普通段落里按 Enter，ProseMirror 基础 keymap 执行 `splitBlock`，把「ABCD」在 BC 间拆成两个相邻段落；保存为 `AB\n\nCD`（段落间空一行），重开渲染成两段带间距 → 看起来隔了两行。Shift+Enter 才是单行硬换行（`<br>`）。

**修复**：新增 `src/lib/milkdown-smart-enter.ts`（`$prose` + keymap，注册进 `WritingEditor.tsx`）——**只在普通段落里接管 Enter**：

| 光标位置 | 行为 |
|---|---|
| 段中（前后都有非空白文字，如 `AB|CD`） | 插入 `hardbreak`（硬换行）→ **单行**，markdown 序列化为 `AB\\\nCD`，重开仍单行 |
| 段首 / 段尾 / 空段 | `return false` 交还默认 → `splitBlock` 正常新建段落 |
| 非空选区 / 列表 / 标题 / 代码块 / 表格 | `return false` 交还默认（列表=新条目、代码=新行、其余不变） |

**不做**：把 Enter 一律改成硬换行（会丧失新建段落能力，破坏 markdown 结构）。

## UI 出口声明（feature-development §12）

| 功能 | 入口 | 收起态 | testid |
|---|---|---|---|
| 选中文字格式化 | 悬浮格式栏 | 无（仅选区出现） | `writing-format-bubble` + 四个按钮 |
| 文字颜色 | 悬浮栏色板 6 色 | 色块按钮 | `writing-bubble-color` / `-option` |
| 引用（蜡烛） | 顶部栏按钮 + 文档渲染 | 一个图标 | `writing-toolbar-blockquote` |
| 分隔线（轨道） | 顶部栏按钮 + 文档渲染 | 一个图标 | `writing-toolbar-hr` |
| 烛首标题 | 文档渲染 | — | heading 元素 |
| 烛光列表 | 文档渲染 | — | ul/ol 元素 |

每个入口至少一个 E2E 断言证明运行时渲染。

## 向后兼容

- 已有 `textColor` mark 旧色值（暖橙/赤红/墨灰/黑）在文档中照常显示，色板只影响选择器 UI，无需迁移
- `state.json` 无新增/变更字段
- 学习库 `.md` 文件格式与内容不动（除用户主动操作）
- 内部复制粘贴（`data-pm-slice`）行为不变（2026-08-26 修订：改为去块结构插入——列表/标题/引用拍平为段落、行内样式保留；光标在标题内时一律纯文本插入）

## 测试计划（定向，不跑全量）

**单元（`tests/`）：**
- `milkdown-clipboard`：切片清洗纯函数——code_block→paragraph（含多行软换行）、code mark 去除、textColor 去除；`**bold**` 保 strong
- `sanitizeExternalHTML` 既有用例保留
- `textColor` 色板与命令既有用例更新（色值变更）
- `milkdown-smart-enter`：段中 Enter → hardbreak、段首/段尾 → 默认、非段落交还默认

**E2E 定向（`node scripts/e2e-changed.js --run`），writing 域：**
- 粘贴 markdown 源码（`**bold**` + 表格 + 反引号 + `<span style="color">`）→ 断言加粗生效、无代码字体、无颜色；保存 → 重开 → 无多余 `**`
- 内部复制粘贴颜色/代码 → 完整保留
- 悬浮栏：拖选出现 → 点加粗不消失 → 再点颜色（连续操作）→ 外点消失
- 顶部工具栏无 B/I/S/颜色按钮
- 分隔线：插入后光标在下一行；退格可删除
- 渲染格调：引用蜡烛/分隔线轨道/烛首标题/烛光列表元素存在且样式生效
- 报纸版式：切主题后装饰颜色跟随 `--writing-tone-color`
- 迁移 `writing-editor.spec.ts` 中引用顶部四按钮的旧用例；同步更新 `e2e/helpers/selectors.ts`；新增/改动 spec 登记 `e2e/source-map.json`
- **智能 Enter**：段中 `AB|CD` 按 Enter → 单行（无空行、无两行间距）；段尾按 Enter → 新段落；重开后仍是单行硬换行

## 明确不做 / 后续探索

- 下划线功能：不新增
- 加粗 / 删除线 / 文字颜色的特殊渲染（火捻色 / 波浪删除线 / 烛光辉光）：不做
- 从 VS Code 粘贴的代码块：统一转纯文字（与「代码块转纯文字」一致；若要保留代码块需单独决策）
- 不支持 H4-H6
