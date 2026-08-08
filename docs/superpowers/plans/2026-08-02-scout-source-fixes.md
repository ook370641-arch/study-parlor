# Scout（拾贝）来源修复实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 Scout 来源在审计中发现的运行时失效、功能缺失、E2E 覆盖不足与 UI 审美问题，使其达到可合并状态。

**架构：** 沿用现有三层架构（主进程 `electron/lib/scout/*` → IPC `electron/ipc/scout.ts` → 渲染进程 `src/components/scout/*` / `src/store/index.ts`），对齐学习会话的 `sendOrInterrupt` 中断模式、Anthropic 博客的空状态/图标模式，以及现有 E2E 的 mock/`@real`/持久化测试模式。

**Tech Stack:** Electron 30 + React 18 + TypeScript + Zustand + Tailwind CSS + Playwright + Vitest

---

## 上下文

Scout 来源已实现并提交到 main，但审计发现以下关键问题：

- **P0 运行时失效**：`initScoutRuntime()` 从未被调用，SSE 消息与候选卡片事件无法进入 store，聊天界面不会更新。
- **P1 功能缺失**：streaming 时无法通过发新消息中断旧请求；`precheckCache` 是模块全局 Map；`safeFileName` 未处理 Windows 反斜杠；`saveArticle` 写入了 spec 外的 `description` frontmatter 字段。
- **P2 E2E 覆盖缺口**：缺少对话 CRUD、文章删除、部分候选选择、中断、空/错误态、旁注助手真实交互、`@real` 真实 API 回归、跨重启持久化等覆盖；现有 spec 使用 `waitForTimeout` 和文本断言，存在 flaky 风险。
- **P2 UI 审美缺口**：侧边栏折叠按钮无效、空状态简陋、emoji 图标与 App 风格不符、tab ARIA 错误、聊天加载状态平淡、textarea 不能自动增高等。

本计划不改动 Scout 的核心设计（三级抓取管线、工具协议、存储布局），只修复实现偏差与补齐覆盖。

---

## 文件地图

| 文件 | 职责 | 本次变更 |
|---|---|---|
| `src/App.tsx` | 全局 listener 挂载 | 增加 `initScoutRuntime()` 调用 |
| `src/lib/scout-runtime.ts` | Scout SSE 监听与工具事件路由 | 修复候选消息附加逻辑，可选：增加 stream-end 清理 |
| `src/store/index.ts` | Scout store slice | 实现 `sendOrInterrupt`、错误处理、恢复对话消息 |
| `electron/lib/scout/tools.ts` | 工具执行与候选预检 | `precheckCache` 改为 per-turn |
| `electron/lib/scout/article-store.ts` | 文章落库 | `safeFileName` 转义反斜杠，移除多余 `description` |
| `electron/ipc/scout.ts` | Scout IPC handler | 移除未消费的 `scout:reasoningChunk`，加固 abort 后 `llm:done` 守卫 |
| `src/components/scout/ScoutPanel.tsx` | 主面板 | 修复 sidebar toggle、补齐空状态 chrome、增加加载骨架 |
| `src/components/scout/ScoutListColumn.tsx` | 列表列 | 文本/SVG tab、稳定 article testid |
| `src/components/scout/ScoutChatView.tsx` | 聊天视图 | 中断重发、加载指示、自动增高 textarea、平滑滚动 |
| `src/components/scout/ScoutCandidateCards.tsx` | 候选卡片 | emoji 替换、选择状态重置 |
| `src/components/scout/ScoutConversationList.tsx` | 对话列表 | SVG 删除图标、rename 输入样式 |
| `src/components/article/ArticleRow.tsx` | 通用文章行 | SVG 删除图标 |
| `e2e/helpers/selectors.ts` | E2E 选择器 | 补充稳定选择器 |
| `e2e/specs/scout-source.spec.ts` | 现有 E2E | 去除 `waitForTimeout`、改用稳定选择器 |
| `e2e/specs/scout-*.spec.ts`（新建） | 新增 E2E | 对话 CRUD、删除、部分选择、中断、持久化、`@real` |
| `docs/superpowers/specs/2026-08-02-scout-source-design.md` | 原始设计 spec | 按需要更新预检缓存、frontmatter 字段说明 |

---

## Task 1: 挂载 Scout 运行时（P0）

**Files:**
- Modify: `src/App.tsx`
- Test: `tests/scout-entry.test.tsx`（已有）+ `e2e/specs/scout-source.spec.ts`

- [ ] **Step 1: 在 App.tsx 导入并调用 `initScoutRuntime`**

在现有的两个 `useEffect` 旁增加第三个：

```tsx
import { initScoutRuntime } from '@/lib/scout-runtime'

// 在 attachWritingAssistantListeners 的 useEffect 旁边：
useEffect(() => { initScoutRuntime() }, [])
```

- [ ] **Step 2: 验证 tsc 与现有测试**

Run:
```bash
npx tsc --noEmit
npx vitest run tests/scout-entry.test.tsx tests/scout-runtime.test.tsx tests/scout-panel.test.tsx
```
Expected: PASS

- [ ] **Step 3: 提交**

```bash
git add src/App.tsx
git commit -m "fix(scout): mount initScoutRuntime in App root"
```

---

## Task 2: 实现 Scout sendOrInterrupt（P1）

**Files:**
- Modify: `src/store/index.ts`（`sendScoutMessage` 动作）
- Modify: `src/components/scout/ScoutChatView.tsx`
- Modify: `src/lib/scout-runtime.ts`（可选：中断后 finalized 标记）
- Test: `tests/scout-store.test.ts` + 新增中断测试

- [ ] **Step 1: 改写 `sendScoutMessage` 为中断-重发模式**

当前实现：
```ts
if (!id || get().scoutStreaming) return
```

改为：
```ts
sendScoutMessage: async (content) => {
  const id = get().scoutActiveConversationId
  if (!id) return
  if (get().scoutStreaming) {
    await ipc.scoutAbort({ conversationId: id })
  }
  const messages: ScoutMessage[] = [...get().scoutMessages, { role: 'user', content }]
  set({ scoutMessages: messages, scoutStreaming: true })
  try {
    await ipc.scoutSendMessage({ conversationId: id, messages })
  } catch (err) {
    set(state => ({
      scoutMessages: [...state.scoutMessages, { role: 'assistant', content: `请求失败：${(err as Error).message}` }]
    }))
  } finally {
    set({ scoutStreaming: false })
  }
}
```

- [ ] **Step 2: 更新 ScoutChatView 提交逻辑**

移除 `if (!v || streaming) return` 中的 `|| streaming`，允许 streaming 时提交；按钮保持“发送/停止”或合并为单按钮（推荐保留停止按钮作为纯中断入口，同时允许输入框在 streaming 时输入并回车发送）。

- [ ] **Step 3: 增加 store 测试覆盖中断重发**

在 `tests/scout-store.test.ts` 增加：
- `sendScoutMessage while streaming aborts previous and sends new`
- `sendScoutMessage surfaces error as assistant message`

- [ ] **Step 4: 运行测试并提交**

Run:
```bash
npx vitest run tests/scout-store.test.ts
npx playwright test e2e/specs/scout-source.spec.ts
```

```bash
git add src/store/index.ts src/components/scout/ScoutChatView.tsx tests/scout-store.test.ts
git commit -m "feat(scout): sendOrInterrupt during streaming"
```

---

## Task 3: 隔离预检缓存作用域（P1）

**Files:**
- Modify: `electron/lib/scout/tools.ts`
- Modify: `electron/lib/scout/loop.ts`
- Test: `tests/scout-tools.test.ts`

- [ ] **Step 1: 将 `precheckCache` 从模块全局改为 per-turn**

在 `executeScoutTool` 签名中接收 `precheckCache: Map<string, FetchedArticle>`，并在 `runScoutTurn` 每次调用时创建新的 `new Map()`。

当前：
```ts
const precheckCache = new Map<string, FetchedArticle>()
```

改为：
```ts
export type ScoutToolContext = {
  precheckCache: Map<string, FetchedArticle>
}

export async function executeScoutTool(
  tool: ToolCall,
  deps: ScoutToolDeps,
  ctx: ScoutToolContext
): Promise<...> { ... }
```

- [ ] **Step 2: 更新 `runScoutTurn` 传递新 Map**

```ts
const ctx = { precheckCache: new Map<string, FetchedArticle>() }
// 每次调用 executeScoutTool(tool, deps, ctx)
```

- [ ] **Step 3: 更新测试**

在 `tests/scout-tools.test.ts` 增加断言：两次独立 `runScoutTurn`（或两次 `executeScoutTool` 调用）的缓存互不污染。

- [ ] **Step 4: 提交**

```bash
git add electron/lib/scout/tools.ts electron/lib/scout/loop.ts tests/scout-tools.test.ts
git commit -m "fix(scout): scope precheckCache per turn"
```

---

## Task 4: 修复文件名安全与 frontmatter 字段（P1）

**Files:**
- Modify: `electron/lib/scout/article-store.ts`
- Modify: `docs/superpowers/specs/2026-08-02-scout-source-design.md`（如 spec 有 `description` 则删除）
- Test: `tests/scout-article-store.test.ts`、`tests/frontmatter.test.ts`

- [ ] **Step 1: 修复 `safeFileName` 转义反斜杠**

当前：
```ts
return title.replace(/[\/*?"<>|]/g, '_').replace(/\s+/g, ' ').trim().slice(0, 120)
```

改为（与 `electron/lib/anthropic-scraper.ts` 一致）：
```ts
return title.replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim().slice(0, 120)
```

- [ ] **Step 2: 移除 `saveArticle` 中的 `description` 字段**

删除 `description: fetched.summary || undefined,` 这一行，保留 `summary`。

- [ ] **Step 3: 增加单元测试**

在 `tests/scout-article-store.test.ts`：
- `safeFileName escapes backslash and Windows unsafe chars`
- `saveArticle does not write description frontmatter`

- [ ] **Step 4: 运行测试并提交**

Run:
```bash
npx vitest run tests/scout-article-store.test.ts tests/frontmatter.test.ts
```

```bash
git add electron/lib/scout/article-store.ts tests/scout-article-store.test.ts
git commit -m "fix(scout): safeFileName escape backslash and remove extra description field"
```

---

## Task 5: 清理未消费的 `scout:reasoningChunk` 事件（P2）

**Files:**
- Modify: `electron/ipc/scout.ts`
- Test: `tests/scout-ipc.test.ts`（验证无 reasoningChunk 发送）

- [ ] **Step 1: 移除 `scout:reasoningChunk` 发送逻辑**

在 `electron/ipc/scout.ts` 中删除 `webContents.send('scout:reasoningChunk', ...)` 的代码。

- [ ] **Step 2: 可选：如未来需要推理展示，在 spec 中记录为 TODO**

在 `docs/superpowers/specs/2026-08-02-scout-source-design.md` 增加注释：当前版本不展示 Agent 推理过程，事件已移除。

- [ ] **Step 3: 提交**

```bash
git add electron/ipc/scout.ts
git commit -m "chore(scout): remove unused scout:reasoningChunk event"
```

---

## Task 6: 补齐 E2E 稳定选择器并重构现有 spec（P2）

**Files:**
- Modify: `e2e/helpers/selectors.ts`
- Modify: `src/components/scout/ScoutListColumn.tsx`
- Modify: `src/components/article/ArticleRow.tsx`
- Modify: `src/components/scout/ScoutConversationList.tsx`
- Modify: `e2e/specs/scout-source.spec.ts`

- [ ] **Step 1: 给列表行增加稳定 identity**

`ScoutListColumn.tsx` 中给 `ArticleRow` 传递基于安全文件名的 testid：
```tsx
const rowId = a.filePath ? path.basename(a.filePath, '.md').replace(/\s+/g, '-') : a.url
<ArticleRow testId={`scout-article-row-${rowId}`} ... />
```

`ArticleRow.tsx` 给标题增加 `data-testid="article-row-title"`，删除按钮已有 `article-row-delete`。

- [ ] **Step 2: 补充 selectors.ts**

```ts
articleRowById: (id: string) => `[data-testid="scout-article-row-${id}"]`,
articleTitle: '[data-testid="article-row-title"]',
articleDelete: '[data-testid="article-row-delete"]',
conversation: (id: string) => `[data-testid="scout-conversation-${id}"]`,
conversationDelete: (id: string) => `[data-testid="scout-conversation-delete-${id}"]`,
conversationRenameInput: '[data-testid="scout-conversation-rename-input"]',
```

- [ ] **Step 3: 重构 scout-source.spec.ts**

- 将 `window.waitForTimeout(500)` 替换为等待文章行出现的条件：
  ```ts
  await expect(window.locator(SELECTORS.scout.articleRowById('ReAct-原文'))).toBeVisible()
  ```
- 将 `getByText('ReAct 原文')` 替换为 `SELECTORS.scout.articleRowById(...)`。
- 将 `.first().click()` 替换为按 id 定位。

- [ ] **Step 4: 运行 E2E 并提交**

Run:
```bash
npx playwright test e2e/specs/scout-source.spec.ts
```

```bash
git add e2e/helpers/selectors.ts src/components/scout/ScoutListColumn.tsx src/components/article/ArticleRow.tsx e2e/specs/scout-source.spec.ts
git commit -m "test(scout): stable selectors and refactor existing e2e spec"
```

---

## Task 7: 新增 Scout E2E 覆盖——对话 CRUD 与文章删除（P2）

**Files:**
- Create: `e2e/specs/scout-conversation-crud.spec.ts`
- Create: `e2e/specs/scout-article-delete.spec.ts`
- Modify: `e2e/source-map.json`（如需要确认覆盖）

- [ ] **Step 1: 对话 CRUD 测试**

覆盖：
- 新建对话 → 列表出现新项
- 双击重命名 → Enter 确认 → 列表更新
- 删除第二个对话 → ConfirmDialog 确认 → 列表只剩一个

- [ ] **Step 2: 文章删除测试**

通过 mock 流程生成两篇文章，切换到文章 tab，hover 第一行 → 点击删除 → ConfirmDialog 确认 → 断言该行消失、reader 关闭、磁盘文件被删除。

- [ ] **Step 3: 运行并提交**

Run:
```bash
npx playwright test e2e/specs/scout-conversation-crud.spec.ts e2e/specs/scout-article-delete.spec.ts
```

```bash
git add e2e/specs/scout-conversation-crud.spec.ts e2e/specs/scout-article-delete.spec.ts
git commit -m "test(scout): e2e coverage for conversation CRUD and article delete"
```

---

## Task 8: 新增 Scout E2E 覆盖——候选选择、中断、持久化（P2）

**Files:**
- Create: `e2e/specs/scout-candidate-select.spec.ts`
- Create: `e2e/specs/scout-persistence.spec.ts`
- Modify: `electron/ipc/scout.ts`（如需要 mock 错误分支，增加 `E2E_SCOUT_ERROR` env 读取）

- [ ] **Step 1: 部分选择候选测试**

- 触发候选卡片后只勾选第一个 → 点击 `confirmCandidates` → 断言只有一篇文章入库。

- [ ] **Step 2: 中断 streaming 测试**

- 发送消息后迅速点击 `chatAbort` → 断言 `chatSend` 重新出现、列表无新增文章或只有部分输出。

- [ ] **Step 3: 跨重启持久化测试**

- 走一遍 mock 流程生成对话和文章。
- `await window.reload()` 并重新导航到 Scout。
- 断言对话列表保留、文章列表保留、磁盘文件存在。

- [ ] **Step 4: 运行并提交**

Run:
```bash
npx playwright test e2e/specs/scout-candidate-select.spec.ts e2e/specs/scout-persistence.spec.ts
```

```bash
git add e2e/specs/scout-candidate-select.spec.ts e2e/specs/scout-persistence.spec.ts
git commit -m "test(scout): e2e coverage for partial candidates and persistence"
```

---

## Task 9: 新增 Scout `@real` 真实 API 回归 E2E（P2）

**Files:**
- Modify: `electron/ipc/scout.ts`（增加 `E2E_SCOUT_DISABLE_MOCK` gate）
- Create: `e2e/specs/scout-real-api.spec.ts`
- Modify: `e2e/helpers/test-library.ts`（可选：增加 `seedScoutArticle` helper）

- [ ] **Step 1: 在 Scout IPC 增加 mock 禁用门控**

修改 `isE2EMock()`：
```ts
function isE2EMock(): boolean {
  return process.env.NODE_ENV === 'test' && !!process.env.E2E_CONFIG_DIR && process.env.E2E_SCOUT_DISABLE_MOCK !== '1'
}
```

- [ ] **Step 2: 编写 `@real` 测试**

两种方式任选其一（推荐 local-server 方案，避免外部依赖）：

**方案 A：local-server 真实链路（推荐）**
- 使用 `e2e/helpers/mock-server.ts` 启动本地 server，stub Tavily `/search` 和 Kimi `/v1/chat/completions`。
- `test.use({ extraEnv: { E2E_SCOUT_DISABLE_MOCK: '1', KIMI_BASE_URL: server.url, TAVILY_API_URL: server.url } })`。
- 断言：发送消息 → 候选出现 → 确认 → 文章保存到磁盘。

**方案 B：真实外部 API**
- `test.use({ extraEnv: { E2E_SCOUT_DISABLE_MOCK: '1' } })`。
- 长超时，断言至少能完成搜索并返回候选。

- [ ] **Step 3: 运行并提交**

Run（方案 A）：
```bash
npx playwright test e2e/specs/scout-real-api.spec.ts --grep @real
```

```bash
git add electron/ipc/scout.ts e2e/specs/scout-real-api.spec.ts
git commit -m "test(scout): add @real e2e regression for agent fetch pipeline"
```

---

## Task 10: Scout UI 审美统一打磨（P2）

**Files:**
- Modify: `src/components/scout/ScoutPanel.tsx`
- Modify: `src/components/scout/ScoutListColumn.tsx`
- Modify: `src/components/scout/ScoutChatView.tsx`
- Modify: `src/components/scout/ScoutCandidateCards.tsx`
- Modify: `src/components/scout/ScoutConversationList.tsx`
- Modify: `src/components/article/ArticleRow.tsx`
- Test: `tests/scout-panel.test.tsx`、`tests/scout-entry.test.tsx`、相关 E2E

- [ ] **Step 1: ScoutPanel 修复**

- 给 `BriefingListColumn` 增加 `collapsed` / `onToggle` 状态（参考 `AnthropicBlogPanel.tsx`）。
- 将当前 `themeClasses` 中未使用的成员（`emptyIcon`、`skeleton`、`button`）用于空状态和骨架。
- 文章 tab 空状态复制 Anthropic 空状态结构：icon + 字号按钮 + `SwapPaintingButton`（仅 academic）。
- `initScout()` 期间显示骨架（3 个 `animate-pulse` 块）。

- [ ] **Step 2: ScoutListColumn 修复**

- tab 标签从 emoji 改为文字 `聊天` / `文章`（参考 `WritingListColumn.tsx`）。
- `aria-pressed` 改为 `aria-selected`。

- [ ] **Step 3: ScoutChatView 修复**

- streaming 指示器改为“拾贝工作中…” + 小型 spinner（`border-t-transparent animate-spin`）。
- textarea 自动增高：通过 `ref` + `scrollHeight` 实现（新组件内最小实现，不引入通用 hook）。
- 平滑滚动：使用 `behavior: 'smooth'`；streaming 期间用 `'auto'`；增加用户向上翻看 80px 内不自动滚动（参考 `src/pages/Study.tsx`）。
- 消息气泡增加 `font-serif` 与角色标签（`我` / `拾贝`）。

- [ ] **Step 4: emoji 替换为 SVG**

- `ScoutCandidateCards.tsx`：将 `⚠` 替换为内联 warning-triangle SVG（参考 `AnthropicBlogPanel.tsx:225`）。
- `ArticleRow.tsx`：将 `🗑` 替换为内联 trash SVG。
- `ScoutConversationList.tsx`：将 `✕` 替换为内联 close SVG。

- [ ] **Step 5: 行内 rename 输入框样式**

- 增加 `bg-parchment/10`（academic）/ `bg-[#f5f3ef]`（newspaper）背景与完整边框，聚焦环使用 `focus:border-ember` / `focus:border-[#1a1a1a]`。

- [ ] **Step 6: 运行测试并提交**

Run:
```bash
npx tsc --noEmit
npx vitest run tests/scout-panel.test.tsx tests/article-row.test.tsx
npx playwright test e2e/specs/scout-source.spec.ts
```

```bash
git add src/components/scout/*.tsx src/components/article/ArticleRow.tsx
git commit -m "polish(scout): UI consistency with app design language"
```

---

## Task 11: 最终集成验证

- [ ] **Step 1: 类型检查与构建**

```bash
npx tsc --noEmit
npm run build
```

- [ ] **Step 2: 单元/组件测试**

```bash
npx vitest run tests/scout-*.test.ts tests/scout-*.test.tsx tests/article-row.test.tsx tests/web-article-reader.test.tsx tests/frontmatter.test.ts tests/briefing-sidebar.test.tsx
```

- [ ] **Step 3: E2E 定向测试**

```bash
node scripts/e2e-changed.js --run
```

- [ ] **Step 4: 全量 Scout E2E**

```bash
npx playwright test e2e/specs/scout-*.spec.ts
```

- [ ] **Step 5: 提交验证结果或最终提交**

若全绿：
```bash
git commit --allow-empty -m "verify: scout fix plan all green"
```

---

## 验证清单

- [ ] `initScoutRuntime()` 在 App.tsx 挂载，聊天流可更新。
- [ ] streaming 时发送新消息会中断旧请求并立即发送新消息。
- [ ] `precheckCache` 不会跨会话污染。
- [ ] `safeFileName` 能处理反斜杠与 Windows 非法字符。
- [ ] 保存的 web-article `.md` 不含 `description` 字段。
- [ ] 无未消费的 `scout:reasoningChunk` 事件。
- [ ] E2E 选择器稳定，现有 spec 不再使用 `waitForTimeout` 或文本定位。
- [ ] 新增 E2E 覆盖：对话 CRUD、文章删除、部分候选选择、中断、持久化、`@real`。
- [ ] UI 无 emoji，tab ARIA 正确，空状态与 Anthropic 一致。
- [ ] `tsc --noEmit`、`npm run build`、单元测试、E2E 全部通过。

---

## Spec 覆盖自检

对照原始 spec `docs/superpowers/specs/2026-08-02-scout-source-design.md`：

| Spec 章节 | 对应任务 | 备注 |
|---|---|---|
| 三级抓取管线 | Task 4 | 修复文件名与 frontmatter |
| 候选预检与缓存 | Task 3 | 改为 per-turn |
| 工具协议 / Agent 循环 | Task 2, Task 5 | sendOrInterrupt + 清理 reasoningChunk |
| 存储布局 | Task 4 | 字段对齐 |
| UI 布局 | Task 10 | 审美对齐 |
| E2E 验收 | Task 6-9 | 补齐覆盖 |
| 运行时监听 | Task 1 | 修复未挂载 |

需要更新的 spec 条目：
- 在“候选预检”章节明确 `precheckCache` 为 per-turn。
- 在“web-article frontmatter”章节确认字段不含 `description`。
- 在“中断与并发”章节明确实现为 `sendOrInterrupt`。

---

## 执行顺序依赖

1. **Task 1** 必须先做，否则后续真实运行与 E2E 的 SSE 更新不可见。
2. **Task 2** 与 **Task 3/4/5** 可并行。
3. **Task 6** 依赖 **Task 10** 的 UI 结构（特别是 article testid）。
4. **Task 7-9** 依赖 **Task 6** 的选择器。
5. **Task 10** 可独立进行，但应在 Task 6 前完成以避免选择器冲突。
6. **Task 11** 最后执行。

推荐顺序：**1 → 2,3,4,5 并行 → 10 → 6 → 7,8,9 并行 → 11**。
