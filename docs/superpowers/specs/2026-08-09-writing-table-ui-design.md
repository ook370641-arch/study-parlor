# 写作表格 UI + 块级 gutter 插入菜单 — 设计

日期：2026-08-09
状态：已与用户确认(范围/交互形态/入口位置/列宽决策)

## 背景

写作编辑器(Milkdown v7,preset-gfm 7.21.3)已启用表格 schema 和 `insertTableCommand`(顶部栏 ▦ 按钮),但从未加载官方 `tables.css`,表格渲染为"有表格结构、无边框网格"(用户在学习库 `writing/我的问题与诊断/8.8 行动计划.md` 中实际遇到)。官方 `tables.css` 是亮色主题,覆盖成本高于自写。

夜航简报正文渲染侧与编辑器是**两个不同的样式表面**,本次只改编辑器,简报渲染侧不动(用户已确认知悉)。

## 用户决策记录

1. 功能范围:边框网格样式 + 行列增删 + 列对齐;**不做列宽拖拽 UX**(GFM markdown 存不下,不留假 affordance)。
2. 新增入口(表格/有序无序列表/分级标题)放**光标所在块左侧 gutter「+」菜单**,不去顶部栏。
3. 表格行列增删用 Typora 式手柄:**跟随光标**(不做每行 hover 定位);删除表格与列对齐放**表格左上角「⋯」菜单**。
4. 顶部栏现有 ▦ 按钮**移除**,单入口。
5. gutter「+」**常驻跟随光标**显示(发现性,符合 feature-development §12 UI 出口规则)。

## 范围

In:
- ① 表格网格样式(纯 CSS,暗色主题)
- ② 表格行列手柄 + 左上角 ⋯ 菜单(新 ProseMirror 插件)
- ③ 块级 gutter「+」插入菜单(新 ProseMirror 插件)
- ④ 顶部栏移除 ▦ 按钮

Out(YAGNI):
- 列宽拖拽(显式隐藏内置手柄)、列宽持久化
- 嵌套表格、单元格合并、行/列移动(moveRow/moveCol 命令存在但不做 UI)
- 夜航简报渲染侧表格样式

## 架构与组件

### ① 表格网格样式 — 改 `src/components/writing/writing-editor.css`

- `.ProseMirror table`: `border-collapse: collapse`
- `.ProseMirror td, .ProseMirror th`: 边框 `1px solid` 米色 20% 透明度(与现有 `border-parchment/10` 同族),内边距 `0.3em 0.6em`
- `.ProseMirror th`: 底色米色 5% 透明度,`font-weight: 600`
- `.ProseMirror .column-resize-handle { display: none !important }` — 禁用 preset-gfm 内置 columnResizing 插件的拖拽手柄(不删插件本身,只藏 UI)
- `.ProseMirror .selectedCell:after` 或等效:单元格多选(prosemirror-tables cell selection)可见选中态,米色 10% 底色
- 保留现有 `.tableWrapper { overflow-x: auto }` 宽表横向滚动防御

### ② 表格手柄 + ⋯ 菜单 — 新建 `src/lib/milkdown-table-handles.ts`

沿用 `milkdown-paste-plain.ts` 的 `$prose` + `PluginKey` 模式。`$prose((ctx) => ...)` 工厂闭包持有 ctx,按钮回调经 `ctx.get(commandsCtx).call(...)` 直接调命令,**不走** toolbar 的 `writingEditorAction` 代理。

Plugin view:
- 创建一个 absolute 定位的 DOM 容器,挂在 `.writing-editor-root`(需要该容器 `position: relative`,若无则在 CSS 中补)
- 监听 selection 变化(`update()`):光标在表格内(`$from` 祖先含 `table`)→ 计算并显示手柄;离开 → 全部隐藏
- 定位:prosemirror-tables `TableMap` 查光标单元格 row/col → `view.coordsAtPos` 算几何 → 容器内手柄 absolute 定位
- 重定位触发:`.tableWrapper` 横向滚动、编辑器容器纵向滚动、window resize、doc 变更
- 手柄集(全部 `data-testid`):
  - 光标所在**行左侧**:「+」(`addRowAfterCommand`,`writing-table-row-add`)、「−」(`selectRowCommand` → `deleteSelectedCellsCommand`,`writing-table-row-del`)
  - 光标所在**列顶部**:「+」(`addColAfterCommand`,`writing-table-col-add`)、「−」(`selectColCommand` → `deleteSelectedCellsCommand`,`writing-table-col-del`)
  - 表格**左上角「⋯」**(`writing-table-menu`):菜单项 = 列对齐 左/中/右(`setAlignCommand('left'|'center'|'right')`,`writing-table-align` + `data-align`)、删除表格(`deleteTableCommand`,`writing-table-delete`)
- ⋯ 菜单外点击关闭(document click 模式,与 WritingToolbar 一致)
- 几何计算失败(表格滚出视口等)→ 手柄隐藏,不抛错

### ③ 块级 gutter「+」菜单 — 新建 `src/lib/milkdown-gutter-insert.ts`

同样 `$prose` 插件:

- selection 变化取光标所在**顶层块**(depth 1),`coordsAtPos` 定位,absolute 悬挂「+」按钮(`data-testid="writing-gutter-plus"`)于块左侧 gutter,常驻跟随光标;不改正文流
- 光标在代码块内 → 隐藏 gutter(wrap 类命令在代码块无意义)
- 点击展开菜单(`data-testid="writing-gutter-menu"`):
  - 无序列表 → `wrapInBulletListCommand`
  - 有序列表 → `wrapInOrderedListCommand`
  - 表格 → `insertTableCommand`
  - H1 / H2 / H3 → `wrapInHeadingCommand`(payload 1/2/3)
- 命令 when 不满足(返回 false)→ 静默关闭菜单,文档不变(沿用 ProseMirror 命令语义,不做额外提示)
- 菜单外点击关闭;菜单项 `data-testid="writing-gutter-item"` + `data-type`

### ④ 顶部栏收尾 — 改 `src/components/writing/WritingToolbar.tsx`、`e2e/helpers/selectors.ts`

- 移除 ▦ 按钮(`writing-toolbar-table`)与 `insertTableCommand` import(`toggleStrikethroughCommand` 保留)
- `selectors.ts` 删除 `toolbarTable` 条目;新增手柄/gutter 相关选择器条目

### 注册 — 改 `src/components/writing/WritingEditor.tsx`

`.use(tableHandlesPlugins)`、`.use(gutterInsertPlugins)` 追加在现有插件链末尾(codeblockEnterPlugins 之后)。

## 数据流

手柄/gutter 点击 → gfm/commonmark 命令 → ProseMirror doc 变更 → `markdownUpdated` → 现有 `onChange` → store → 保存链。**无新数据链路、无 IPC、无持久化字段**。

- 列对齐序列化为 GFM 对齐行语法(`:---` / `:---:` / `---:`),重开文件保留
- 行列增删、删除表格即时反映在 markdown
- 撤销/重做走 history 插件,天然支持
- prosemirror-tables 的 columnResizing 插件会把 colwidth 写入 table 节点 attrs,但序列化时丢弃 —— 手柄已隐藏,用户无从触发,符合"仅本次会话"决策

## 边界与降级

| 场景 | 行为 |
|---|---|
| 表格滚出视口/几何计算失败 | 手柄隐藏,不抛错 |
| `.tableWrapper` 横向滚动、容器滚动、resize | 手柄重定位 |
| 代码块内 | gutter「+」隐藏 |
| 菜单命令返回 false | 静默关闭,文档不变 |
| 空文档/光标在首行前 | gutter 正常跟随首个顶层块 |
| 单元格多选态(cell selection)删行列 | `deleteSelectedCellsCommand` 原生兼容 |

## 测试

新 E2E `e2e/specs/writing-table-ui.spec.ts`(结构复刻 `writing-codeblock-wrap.spec.ts` 的 setup:seed state.json → 写 fixture 文章 → 导航到写作页):

1. **网格样式**:打开含 GFM 表格的文章 → `td` computed `borderTopWidth` 为 `1px`;`.column-resize-handle` 不存在或 `display: none`
2. **行列增删**:光标进表格 → 四个手柄 + ⋯ 可见;行「+」→ `tr` 数 +1;列「+」→ 首行 `td/th` 数 +1;行「−」→ 行数 −1;列「−」→ 列数 −1
3. **⋯菜单**:选"左对齐" → 编辑器 markdown 含 `:---`;选"删除表格" → 文档中 `table` 消失
4. **gutter 菜单**:光标在普通段落 →「+」可见 → 点"表格"→ 出现 `table`;点"无序列表"→ 段落变 `ul li`;点"H2"→ 段落变 `h2`(三块分别断言)
5. **代码块内 gutter 隐藏**:光标进代码块 →「+」不可见
6. **顶部栏**:`writing-toolbar-table` 不存在

同步维护:
- `e2e/source-map.json` writing group `specs` 添加 `writing-table-ui.spec.ts`
- `e2e/helpers/selectors.ts`:删 `toolbarTable`,新增手柄/gutter/菜单选择器
- fixture:取 8.8 行动计划的表格片段(公开信源列表,无隐私)内联在 spec 里,不新增 fixture 文件

验证命令:
- `node scripts/e2e-changed.js --run`(定向,不跑全量)
- 改动文件对应的已有 spec:`writing-editor.spec.ts`、`writing-edge.spec.ts`(若受影响)

## 不做的事(明确排除)

- 不加载官方 `tables.css`
- 不做列宽拖拽/持久化、行列移动、单元格合并
- 不改夜航简报渲染侧表格样式
- 不新增 IPC、持久化字段、依赖包
