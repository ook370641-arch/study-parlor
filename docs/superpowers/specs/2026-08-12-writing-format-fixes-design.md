# 写作编辑器：加粗可见性 + 分隔线删除/全宽/插入设计

日期：2026-08-12
状态：已批准（brainstorming 逐项确认）
范围：写作编辑器（加粗渲染 CSS、分隔线 Backspace keymap、分隔线全宽 CSS、分隔线插入逻辑）

## 背景与目标

写作编辑器（Milkdown v7）四项使用反馈，均已定位根因：

1. **点悬浮栏 B 文字没变粗**——`<strong>` 与计算样式（400→700）都正确，但本机 CJK 衬线兜底字体（宋体）无真实粗体面、Chromium 不合成 faux-bold，实测同一段文字 400/700 渲染宽度 0.00% 差异 → 肉眼看不出变化。
2. **分隔线下方行首按退格，第一次按只在分隔线上跳出选中框**——ProseMirror 默认 Backspace 对块级前驱节点先选中（selectNodeBackward），第二次才删除。
3. **分隔线没铺满横轴**——orbit-hr SVG `viewBox="0 0 200 40"` + CSS `width:100%` 但缺 `preserveAspectRatio="none"`，默认居中缩放，横线只占中间 200px。
4. **插入分隔线会额外多出一行**——Milkdown `insertHrCommand` = `replaceSelectionWith(hr).insert(from, 空段落)`，在光标处多塞一个空段，结果 `文字 → 空行 → 分隔线 → 空行(光标)`。

**目标：加粗在任意字体下可见；分隔线单键删除；分隔线横线铺满正文横轴；插入分隔线不产生多余空行。**

## 1. 加粗可见性（CSS 描边模拟）

`src/components/writing/writing-editor.css`，`.ProseMirror strong` 增强：

```css
.writing-editor-root .ProseMirror strong {
  font-weight: 700;
  -webkit-text-stroke: 0.02em currentColor;  /* 宋体等无粗体面时的视觉补偿,~0.4px@19px */
}
```

- 作用域仅写作编辑器；保存的 `.md` 仍是纯 `**粗体**` 标记，数据不受影响。
- 不耦合未来字体方案：若日后内置真实粗体字体，移除该行即可。

## 2. 行首退格一步删除分隔线

**新文件 `src/lib/milkdown-hr-backspace.ts`**，`$useKeymap`（priority 高于基础 prose keymap），仿 `milkdown-smart-enter.ts` 模式：

- 触发条件（全满足才接管）：
  - 选区塌缩（`selection.empty`）
  - 光标所在块是 textblock 且 `$from.parentOffset === 0`（行首）
  - `doc.nodeAt($from.before() - 1)` 存在且 `type.name === 'hr'`
- 处理：`tr.delete(prevPos, posBefore)`，光标 `Selection.near(resolve(prevPos))` 落到分隔线后的块行首（或文档边界）。
- 其余情况 `return false`，交还默认（列表/表格/普通退格不受影响）。
- 保护：`prevPos < 0`（hr 在文档第一行）→ `return false`。

## 3. 分隔线横线铺满正文横轴

`writing-editor.css`，`.writing-orbit-hr` 增强（轨道 SVG 保持原样居中，不拉伸）：

```css
.writing-editor-root .writing-orbit-hr {
  position: relative;
}
.writing-editor-root .writing-orbit-hr::before {
  content: '';
  position: absolute;
  left: 0; right: 0; top: 50%;
  height: 1px;
  background: currentColor;
  opacity: 0.4;               /* 与 SVG 内横线一致 */
  transform: translateY(-50%);
}
```

- 横线铺满正文内容横轴（编辑器内已有 26px gutter padding，自然避开车道），起真实分隔作用。
- 椭圆轨道保持圆形（不引入 `preserveAspectRatio="none"`，避免拉扁变形）。

## 4. 插入分隔线不多一行

`src/components/writing/WritingToolbar.tsx`，重写 `insertHrBelow`：

- 不再调用 Milkdown `insertHrCommand`（其 `.insert(from, 空段)` 是多余空行的来源）。
- 自建插入流程：
  1. 折叠非空选区到 `head`（沿用 `runCollapsedBlockCommand` 的折叠语义）；代码块内返回 `false`。
  2. `state.tr.replaceSelectionWith(hr)`——ProseMirror 自动把当前块分成「前段 / hr / 后段」，无多余空段。
  3. 定位新 hr（`pos >= from` 的第一个 hr）。
  4. 光标定位：
     - hr 后已有内容块 → `Selection.near` 放其行首；
     - hr 后无内容 → `replaceWith` 补一个空段落，光标放其行首（这就是"光标自动去下一行"）。
  5. 若 hr 前是空段落（插入点在文档开头）→ 一并删除，避免前导空行。

**结果：`文字 → hr → 下一行(光标)`；若下一行本有文字 → `文字 → hr → 文字(光标行首)`。**

## 5. 行首退格解除引用（追加 2026-08-12 反馈）

`百度-简历/简历.md` 开头引用删不掉：Backspace 在引用行首无任何反应（`joinTextblockBackward`/`selectNodeBackward` 都失效），工具栏 引用 按钮是 `wrapIn` 只包裹不解开。

**新文件 `src/lib/milkdown-blockquote-unwrap.ts`**（`$useKeymap`，priority 60 > 基础 50）：
- 触发条件（全满足）：选区塌缩、`$from.parentOffset === 0`、父节点（depth-1）是 `blockquote`、`$from.index() === 0`（引用内第一段）。
- 处理：`tr.replace(bqStart, bqEnd, new Slice(bq.content, 0, 0))` —— 把 blockquote 整体替换为其内容，**只删引用标识、不缩进**；光标 `TextSelection.near` 落到原第一段行首。
- 引用内后续段落退格交还默认 `join`（不整体解除）。

**工具栏蜡烛图标黑色**：`writing-toolbar-icons.tsx` 烛身原 `fill="currentColor" opacity="0.75"`，而按钮色是 60% 透明米色，再叠 75% 透明度 → 深色背景下暗成"黑蜡烛"。改为实心 `#e8d5b7`（米色，与设计语言一致）。

## 边界清单

| 场景 | 行为 |
|---|---|
| 插入在文档/段落开头 | 删除 hr 前空段，光标落 hr 后首块行首 |
| 插入在代码块内 | 返回 false，工具栏显示现有「当前位置不支持该操作」提示 |
| 插入在列表/表格内 | `replaceSelectionWith` 正常分块；光标定位用 `Selection.near` 兜底 |
| hr 在文档第一行按退格 | `prevPos < 0` 保护，交还默认 |
| 列表/表格内行首退格 | 前一节点非 hr，交还默认 |
| 加粗应用后重开文章 | `.md` 仍存 `**粗体**`，渲染不变（数据无影响） |
| 未来内置真实粗体字体 | 移除 `-webkit-text-stroke` 一行即可，无其他耦合 |

## 测试

- **E2E（`writing-paste-format.spec.ts` 更新 + 新增）**：
  - 插入分隔线后结构断言：orbit-hr 的直接前驱是文字段（非空），中间无空段；hr 后恰有一段空行放光标。
  - 行首退格**一次**即删除分隔线（替换现有"两次"断言）。
  - 加粗断言：`.ProseMirror strong` 的 `-webkit-text-stroke` 计算样式非 `0px`。
  - 保留既有断言：Ctrl+A 选中 → 悬浮栏出现、点 B 生成 `<strong>`、外点消失。
- **单测**：无新增纯函数；既有 `writing-selection-bubble` 等不动。
- **定向**：改动文件映射 writing group → `node scripts/e2e-changed.js --run --no-retries`。
