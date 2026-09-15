# 写作树 html 文件展示优化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 写作树中 html 文件隐藏 `.html` 后缀，并获得专属地球图标，与 md 文件视觉区分。

**Architecture:** 纯渲染层改动：`displayWritingName` 增加 `.html` 剥离（三个消费方自动继承）；`FileIconByPath` 新增 html 分支渲染 globe 图标。重命名链路现有 `normalizeWritingFileRename` 已保留原扩展名，无需改动。

**Tech Stack:** React 18 + TypeScript + Vitest + Playwright E2E

**Spec:** `docs/superpowers/specs/2026-09-16-writing-html-file-display-design.md`

## Global Constraints

- xlsx/pdf/docx 保持现状（带后缀 + 现有图标），本次只改 html。
- 剥离 `.html` 大小写不敏感（扫描侧 `isNonMdExt` 为 lowercase 判断，显示侧对齐）。
- 图标沿用现有体系：SVG stroke（strokeWidth 1.8）、`viewBox="0 0 24 24"`、`shrink-0`、`aria-hidden`，`data-testid="writing-tree-icon-html"`。
- 组件文件只导出组件（ui-styling §10）：`HtmlIcon` 为模块私有函数，不 export。
- 验证只跑受影响测试（general §9）：单元 `npx vitest run tests/writing-tree-utils.test.ts`；E2E `node scripts/e2e-changed.js --run --no-retries`（自动先构建）。
- 注意：`tests/text-color-mark.test.ts`、`src/lib/milkdown-list-enter.ts` 等是工作区已有的无关改动，不要提交、不要触碰。

---

### Task 1: displayWritingName 剥离 .html 后缀

**Files:**
- Modify: `src/lib/writing-tree-utils.ts:75-78`
- Test: `tests/writing-tree-utils.test.ts:65-71`

**Interfaces:**
- Consumes: `WritingTreeNode`（`{ name: string; kind: 'file' | 'dir' }`，来自 `@shared/index`）
- Produces: `displayWritingName(node): string` — 签名不变；行为变化：`.html`/`.HTML` 文件去后缀。消费方 `WritingTree.tsx`（树行/重命名 defaultValue/删除确认）、`WritingListColumn.tsx`（最近文件）、`CompanionBoard.tsx`（对照栏头部）无需改动，自动继承。

- [ ] **Step 1: 写失败测试**

在 `tests/writing-tree-utils.test.ts` 的 `describe('displayWritingName', ...)` 块内（第 70 行 `})` 之前）追加：

```ts
  it('html 文件去 .html 后缀（大小写不敏感）；其他非 md 后缀保留', () => {
    expect(displayWritingName(f('月度报告.html'))).toBe('月度报告')
    expect(displayWritingName(f('归档.HTML'))).toBe('归档')
    expect(displayWritingName(f('报表.xlsx'))).toBe('报表.xlsx')
    expect(displayWritingName(f('论文.pdf'))).toBe('论文.pdf')
  })
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/writing-tree-utils.test.ts`
Expected: FAIL —— `displayWritingName(f('月度报告.html'))` 返回 `'月度报告.html'` 而非 `'月度报告'`。

- [ ] **Step 3: 实现最小改动**

将 `src/lib/writing-tree-utils.ts:75-78` 替换为：

```ts
/** 文件显示名：去掉 .md/.html 后缀（大小写不敏感）；目录名与其他后缀原样返回。 */
export function displayWritingName(node: { name: string; kind: 'file' | 'dir' }): string {
  if (node.kind !== 'file') return node.name
  const lower = node.name.toLowerCase()
  if (lower.endsWith('.md')) return node.name.slice(0, -3)
  if (lower.endsWith('.html')) return node.name.slice(0, -5)
  return node.name
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run tests/writing-tree-utils.test.ts`
Expected: PASS（全部用例，含原有 `.md` 用例）。

- [ ] **Step 5: 提交**

```bash
git add src/lib/writing-tree-utils.ts tests/writing-tree-utils.test.ts
git commit -m "feat(writing): 树内 html 文件显示名隐藏 .html 后缀"
```

---

### Task 2: html 专属地球图标

**Files:**
- Modify: `src/components/writing/WritingTree.tsx:389-396`（`FileIconByPath`），并在其后追加 `HtmlIcon` 组件

**Interfaces:**
- Consumes: `writingPreviewKindOf(path)`（`@/lib/writing-tree-utils`，返回 `'md' | 'xlsx' | 'pdf' | 'docx' | 'html'`）
- Produces: 树中 `.html` 文件行渲染 `data-testid="writing-tree-icon-html"` 的 SVG（供 Task 3 的 E2E 断言定位）；`HtmlIcon` 为模块私有，不改变文件导出。

- [ ] **Step 1: FileIconByPath 增加 html 分支**

将 `src/components/writing/WritingTree.tsx:390-396` 替换为：

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

- [ ] **Step 2: 新增 HtmlIcon 组件**

在 `FileIconByPath` 之后（紧挨 `XlsxIcon` 之前，与现有图标组件的组织方式一致）插入：

```tsx
// html：地球（网页/网络文章）
function HtmlIcon() {
  return (
    <svg data-testid="writing-tree-icon-html" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  )
}
```

- [ ] **Step 3: 类型检查 + 构建验证**

Run: `npx electron-vite build`
Expected: 构建成功，无 TS 错误（tsc 阶段通过）。

- [ ] **Step 4: 提交**

```bash
git add src/components/writing/WritingTree.tsx
git commit -m "feat(writing): html 文件树行专属地球图标（writing-tree-icon-html）"
```

---

### Task 3: E2E 同步——writing-non-md.spec.ts 定位器与图标断言

**Files:**
- Modify: `e2e/specs/writing-non-md.spec.ts:87`、`:116`、`:179`

**Interfaces:**
- Consumes: Task 1 的显示名行为（树行文本 `报告.html` → `报告`）、Task 2 的 `writing-tree-icon-html` testid。
- Produces: 无新接口；修复既有 spec 与新行为对齐。

**背景：** Task 1 落地后，树行显示名从 `报告.html` 变为 `报告`，spec 中 3 处 `filter({ hasText: '报告.html' })` 会定位不到节点（hasText 是子串匹配，`报告.html` 不是显示文本 `报告` 的子串）。seed 文件名不变（磁盘上仍是 `报告.html`），仅 UI 定位器需更新。

- [ ] **Step 1: 更新 3 处定位器**

将 `e2e/specs/writing-non-md.spec.ts` 中全部 3 处：

```ts
const node = window.locator('[data-testid="writing-tree-node"]').filter({ hasText: '报告.html' })
```

改为：

```ts
const node = window.locator('[data-testid="writing-tree-node"]').filter({ hasText: '报告' })
```

（第 87、116、179 行，三处文本完全相同，可用 replace_all。）

- [ ] **Step 2: 在 HTML 原生渲染用例中补图标断言**

在 `e2e/specs/writing-non-md.spec.ts` 的 `test('HTML 文件原生渲染：iframe 沙箱显示，与浏览器一致', ...)` 用例中，`await expect(node).toBeVisible({ timeout: 5000 })`（原第 88 行）之后插入：

```ts
    // 专属地球图标（区别于 md 的文档图标）
    await expect(node.getByTestId('writing-tree-icon-html')).toBeVisible()
```

- [ ] **Step 3: 运行受影响 E2E**

Run: `node scripts/e2e-changed.js --run --no-retries`
Expected: `writing-non-md.spec.ts` 全绿（自动先执行 `npx electron-vite build`）。若 e2e-changed 输出的受影响列表不含 `writing-non-md`，改为手动：`npx electron-vite build && npx playwright test --config e2e/playwright.config.ts writing-non-md --retries=0`。

- [ ] **Step 4: 提交**

```bash
git add e2e/specs/writing-non-md.spec.ts
git commit -m "test(writing): E2E 适配 html 隐藏后缀显示名 + 地球图标断言"
```

---

## Self-Review 记录

- **Spec 覆盖**：spec §1（去后缀）→ Task 1；spec §2（图标）→ Task 2；spec §边界情况（重命名补回 `.html`）→ 无需任务，现有 `normalizeWritingFileRename` 已覆盖（spec 已声明不动）；spec §测试 → Task 1 Step 1（单元）+ Task 3（E2E，存在现成 html fixture `报告.html`，符合 spec「有 fixture 则做」分支）。
- **placeholder 扫描**：无 TBD/TODO；所有代码步骤含完整代码。
- **类型一致**：`writingPreviewKindOf` 返回 `'html'` 字面量（`NON_MD_EXTENSIONS` 含 `'html'`），Task 2 分支匹配；testid `writing-tree-icon-html` 在 Task 2/3 间一致。
- **已知遗留**：spec 中「`x.MD` 大写后缀」场景——Task 1 实现顺带让 `.MD` 也被剥离（大小写不敏感统一处理），与扫描侧行为对齐，无额外测试要求。
