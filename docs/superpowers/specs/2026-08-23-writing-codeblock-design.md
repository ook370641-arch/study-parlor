# 写作编辑器代码块功能设计

**日期**: 2026-08-23
**状态**: 已批准(用户确认方案 A,授权自主推进)
**方案**: 轻量 NodeView + refractor 装饰高亮

## 背景与目标

写作编辑器(Milkdown v7)的 `code_block` 节点由 preset-commonmark 自带(含 ` ``` ` 输入规则、`language` attr、`Mod-Enter` 退出),但目前:无样式(裸奔)、无语言 UI、无高亮、行首加号栏无代码块入口。

目标:做出参考 MarkText / 飞书知识库体验的代码块——加号栏可插入、可编辑、可折叠/展开、飞书式语法高亮,并对学术/报纸两套版式各出一套 UI。

## 已确认的交互决策

- 折叠态:只露前 3 行 + 渐变淡出 + 底部「⌄ 展开」提示条;**同时**头部行有常驻折叠箭头(▸/▾),两条路径都可用
- 工具区从简:**不做**语言选择器/复制按钮/行号;语言标签只读;代码区必须可编辑
- 高亮:参考飞书知识库实现(token 着色,克制的色板)

## 架构(方案 A)

新增唯一依赖:`refractor`(Prism 语法库,纯 JS,Electron 打包零风险)。

### 1. 入口

- **加号栏**:`src/lib/milkdown-gutter-insert.ts` 的 `ITEMS` 数组加一项「代码块」,执行 preset-commonmark 自带的 `createCodeBlockCommand`;失败走现有 `writing-gutter-hint` 提示链路。菜单项自动获得 `writing-gutter-item[data-type="codeblock"]` testid。
- **输入规则**:` ``` ` / ` ```js ` 已由 preset 内置,不做开发,E2E 回归验证。

### 2. NodeView 外壳 —— `src/lib/milkdown-codeblock-view.ts`(新建)

模式照抄 `src/lib/milkdown-orbit-hr.ts`($`prose` + `props.nodeViews`):

```
┌─ ▸  js ───────────────┐   ← 头部行:折叠箭头 + 语言只读标签
│  const x = 1          │   ← contentDOM(pre>code),PM 照常渲染、可编辑
└───────────────────────┘
```

- **箭头**:常驻头部行(非悬停时低透明度弱化),点击切换 `node.attrs.collapsed`(`getPos()` + `tr.setNodeMarkup`)
- **折叠态**:CSS `max-height`(3 行)+ `overflow: hidden`;底部叠加渐变淡出层 + 「⌄ 展开」提示条,点击同样展开
- **语言标签**:只读,显示 `node.attrs.language`,空显示「文本」
- `stopEvent` 只拦头部行与提示条的 mousedown,不拦 contentDOM 编辑事件
- 与既有逻辑正交:`milkdown-codeblock-enter.ts`(末行 Enter 退出)、Tab 缩进、gutter 在代码块内隐藏 + 均按节点类型工作

### 3. 高亮 —— `src/lib/milkdown-codeblock-highlight.ts`(新建)

`$prose` decoration 插件:遍历 doc 中 `code_block`,有 `language` 且 refractor 支持时,refractor 解析 → inline decorations(`span.token-keyword` 等);不支持/无语言 → 零装饰零报错。refractor 注册常用语言子集(js/ts/python/bash/json/yaml/css/html/markdown 等),不要全量注册。

### 4. 双主题

- **主题钩子**:`WritingEditor` 接收 `theme` prop(从 `WritingBoard` 的 `briefingTheme` 传入),`writing-editor-root` 加 `data-theme="academic|newspaper"`
- **学术版式**:深墨面板(`bg-ink/80`)、米色等宽代码、keyword=ember 琥珀点睛、描边 `border-parchment/10`
- **报纸版式**:浅灰纸面板(`bg-[#f5f2ed]`)、黑字等宽、低饱和印刷色 token(深红 keyword/墨绿 string)、描边 `border-[#1a1a1a]/10`
- token 色板 ≤6 色,两套主题共用 class 名只换色值;样式全部挂在 `writing-editor.css` 的 `.writing-editor-root[data-theme=...]` 选择器下

### 5. 序列化与兼容

- `collapsed` 是视图态:**不写入 markdown**(序列化忽略该 attr),重新打开文件默认展开
- `language` 走 preset 既有 attr,` ```lang ` 围栏正常往返
- 旧文件已有 ` ``` ` 代码块打开即获新 UI,无迁移
- 删除链路为 PM 内建行为,测试中验证(块内全选删、块首 Backspace 合并)

## 验收 checklist(用户链路全覆盖)

E2E `e2e/specs/writing-codeblock.spec.ts`(登记 `e2e/source-map.json`):

| # | 链路 | 断言 |
|---|---|---|
| 1 | 加号栏插入 | 菜单出现「代码块」,点击插入带外壳的代码块,光标进代码区 |
| 2 | ` ``` ` 输入规则 | 打 ``` 生成代码块;` ```js ` 语言标签显示 js |
| 3 | 编辑 | 块内输入/删除字符,markdown 回传正确 |
| 4 | Enter 跳过 | 末行空行 Enter → 退出代码块,新段落无缩进 |
| 5 | 折叠/展开 | 箭头折叠 → 前 3 行 + 淡出条;淡出条/箭头均可展开;折叠后可点击进入编辑 |
| 6 | 删除 | 块内全选 Backspace 删空;块首 Backspace 与上文合并正确 |
| 7 | 高亮 | js 块出现 `.token-keyword`;无语言块无装饰不报错 |
| 8 | 双主题 | 切主题后代码块面板色值变化(深↔浅) |
| 9 | 序列化往返 | 保存→重开,代码与语言围栏保留,`.md` 中无 `collapsed` |
| 10 | 嵌套守卫 | 代码块内 gutter 不显示 +(既有回归) |

单元测试(vitest):collapsed 序列化忽略;refractor 装饰映射(含不支持语言/空代码边界)。

## 不做的事(YAGNI)

- 语言下拉选择器、复制按钮、行号、自动缩进/括号匹配(CodeMirror 嵌入)
- 折叠状态持久化
- mermaid/数学公式等特殊代码块渲染
