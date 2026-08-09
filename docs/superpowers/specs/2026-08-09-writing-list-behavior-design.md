# 写作列表行为:渲染修复 + 入口收口 + Enter/Tab 续接 — 设计

日期:2026-08-09
状态:已实现(b69b435 / 6b411e6),本文件为事后的决策登记(用户反馈"列表无法插入",排查确认非插入链路故障)

## 背景

写作编辑器(Milkdown v7,preset-commonmark `listItemKeymap` 原生支持列表 Enter 续接/Tab 嵌套/Shift-Tab 解除)插入列表链路本身没有 bug——`runCollapsedBlockCommand` → `wrapInList` 一直生效。

**真实根因**:Tailwind preflight(`src/styles/globals.css` 的 `@tailwind base`)把 `ol, ul` 重置为 `list-style: none; margin: 0; padding: 0`。`writing-editor.css` 补回了 h1-h3/strong 等语义,但漏了 ul/ol/li——导致插入列表后 markdown 已变(`- 正文`),**视觉零反馈**(无标记、无缩进),用户自然认为"没插进去"。连锁后果:既然看不出来是列表,Enter 续接、Shift-Tab 解除这些原生行为也无法被发现。

## 用户决策记录

1. **不保留双入口**:工具栏 `•`(`writing-toolbar-bullet-list`)与 `1.`(`writing-toolbar-ordered-list`)按钮移除,列表插入唯一入口 = 光标所在块左侧 gutter「+」菜单(与表格入口收口决策一致,延伸自 `2026-08-09-writing-table-ui-design.md` 用户决策 #2/#4)。
2. **列表必须有可见标记与缩进**:补回 preflight 重置,确保"插入即所见"。
3. **Enter 续接下一行列表项**(飞书/Typora 惯例):进入列表后按 Enter 生成下一项,列表标记延续。
4. **Tab 嵌套、Shift-Tab 逐级解除;顶层 Shift-Tab 删除列表标记变回普通段落**("点击缩进可以删除列表标记")。

## 范围

In:
- `writing-editor.css` 补 ul/ol/li 渲染样式(disc/decimal、嵌套降档、缩进、li 内段落外边距归零)
- 工具栏移除 `•`/`1.` 按钮与死 import,列表入口收口 gutter
- 新 E2E `writing-list.spec.ts` 固化以上行为

Out(YAGNI):
- 不改列表 schema / 不改 milkdown 插件(原生 `listItemKeymap` 行为已满足)
- 不做工具栏列表按钮的保留路径(无双入口)
- 不动 ordered list start 属性等扩展语义

## 数据流

无新数据链路:插入/续接/嵌套/解除全部走 preset-commonmark 原生命令 → ProseMirror doc 变更 → 既有 `markdownUpdated` → 保存链。CSS 纯样式,不改 DOM。

## 边界与降级

| 场景 | 行为 |
|---|---|
| 嵌套层级标记 | ul→disc、ul ul→circle、ul ul ul→square;ol 保持 decimal |
| li 内 paragraph | 外边距归零(`li > p`),避免列表项间距松散 |
| 工具栏按钮残留 | E2E 断言 `toHaveCount(0)` 防回潮 |
| preflight 再重置 | E2E 计算样式断言(disc/decimal + padding-left>0)防回潮 |
| Enter 续接 / Tab / Shift-Tab | 依赖 preset-commonmark `listItemKeymap` 原生绑定(priority 50 高于 tabKeymap 的 priority 10,先匹配) |

## 测试

`e2e/specs/writing-list.spec.ts`(@p2,mock 链路,setup 结构复刻 `writing-codeblock-wrap.spec.ts`):

1. **列表渲染有标记与缩进**:`ul` `list-style-type: disc`、`ol` `decimal`、padding-left>0(计算样式,防 preflight 回潮)
2. **gutter「+」插入无序/有序**:段落变 `ul li` / `ol li`
3. **列表内 Enter 续接下一项**:`ul li` 数 1→2,新项可输入
4. **Tab 嵌套 / Shift-Tab 逐级解除,顶层解除删除列表标记**:Tab 生成 `ul ul li`;第一次 Shift-Tab 回顶层(标记仍在);第二次 Shift-Tab 变回普通段落
5. **工具栏不再提供 •/1. 按钮**:`toHaveCount(0)`

## 影响文件

- `src/components/writing/writing-editor.css`(列表样式)
- `src/components/writing/WritingToolbar.tsx`(删 •/1. 按钮)
- `e2e/helpers/selectors.ts`(删 toolbarBulletList/toolbarOrderedList)
- `e2e/specs/writing-editor.spec.ts`(删两个按钮可见性测试 + All-buttons 数组)
- `e2e/specs/writing-list.spec.ts`(新)

## 不做的事(明确排除)

- 不改列表 schema/插件;不做有序列表 start 序号、任务列表 checkbox
- 不恢复工具栏列表按钮的任何形式(单入口原则)
