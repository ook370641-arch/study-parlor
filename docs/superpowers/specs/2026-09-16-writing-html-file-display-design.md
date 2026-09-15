# 写作树 html 文件展示优化设计

日期：2026-09-16
状态：待评审

## 背景与目标

写作树中非 md 文件（xlsx/pdf/docx/html）目前完整显示带后缀的文件名，且 html 文件的图标落在默认 DocIcon（与 md 无区分）。目标：

1. html 文件显示名去掉 `.html` 后缀（与 `.md` 的处理一致）。
2. html 文件获得专属图标（地球 globe 隐喻），与 md 的文档图标、xlsx/pdf/docx 的专属图标区分。
3. **范围限定**：xlsx/pdf/docx 保持现状（带后缀 + 现有图标），不统一处理。

## 设计

### 1. 显示名去后缀（`src/lib/writing-tree-utils.ts`）

`displayWritingName` 增加 `.html` 剥离，大小写不敏感（扫描侧 `isNonMdExt` 是 lowercase 判断，显示侧对齐）：

```ts
export function displayWritingName(node: { name: string; kind: 'file' | 'dir' }): string {
  if (node.kind !== 'file') return node.name
  const lower = node.name.toLowerCase()
  if (lower.endsWith('.md')) return node.name.slice(0, -3)
  if (lower.endsWith('.html')) return node.name.slice(0, -5)
  return node.name
}
```

消费方无需改动，自动继承：`WritingTree`（树行 + 重命名输入框 defaultValue + 删除确认文案）、`WritingListColumn`（折叠列最近文件）、`CompanionBoard`（对照栏头部）。

### 2. 专属图标（`src/components/writing/WritingTree.tsx`）

`FileIconByPath` 增加 html 分支，新增 `HtmlIcon` 组件：

- 隐喻：**地球 globe**（圆 + 经纬线，Lucide globe 风格），读作「网页/网络文章」，与推荐文章转正的语义贴合。
- 风格沿用现有图标体系：SVG stroke（strokeWidth 1.8）、`viewBox="0 0 24 24"`、shrink-0、`aria-hidden`。
- `data-testid="writing-tree-icon-html"`（与 `writing-tree-icon-xlsx` 命名一致）。

```tsx
function FileIconByPath({ path }: { path: string }) {
  const kind = writingPreviewKindOf(path)
  if (kind === 'xlsx') return <XlsxIcon />
  if (kind === 'pdf') return <PdfIcon />
  if (kind === 'docx') return <DocxIcon />
  if (kind === 'html') return <HtmlIcon />
  return <DocIcon />
}
```

### 3. 不动的部分

- **重命名链路**：`normalizeRenameForNode` 对非 md 文件已通过 `normalizeWritingFileRename` 保留原扩展名；重命名输入框 defaultValue 变为无后缀显示名后，提交时自动补回 `.html`，无回归风险。
- **新建文件**：只创建 `.md`，html 仅经导入/报告同步进入，无新建路径。
- **主进程 / IPC / 类型**：纯渲染层展示改动，零跨层契约变更。

## 边界情况

| 场景 | 行为 |
|---|---|
| 文件名 `x.HTML`（大写后缀） | 显示 `x`（大小写不敏感剥离，与扫描侧一致） |
| 重命名 html 文件不带后缀 | 提交时补回 `.html`（现有 `normalizeWritingFileRename`） |
| 重命名时用户显式输入其他后缀 | 保留用户输入（现有行为，与 xlsx 等一致） |
| 折叠列/对照栏头部 | 显示无后缀名（继承 `displayWritingName`），无图标（现状如此） |

## 测试

- **单元**（`tests/writing-tree-utils.test.ts`）：`displayWritingName` 补 html 用例——`报告.html → 报告`、`x.HTML → x`、目录名不变、xlsx 后缀保留（防误伤）。
- **E2E**：不新增 spec；在现有 writing 相关 spec 中对 html 文件行加一条 `writing-tree-icon-html` 可见断言（如有现成 html fixture；无 fixture 则不做，避免为此新建 fixture 基础设施）。
- 定向验证：`npx vitest run tests/writing-tree-utils.test.ts`；E2E 按需 `node scripts/e2e-changed.js --run`。
