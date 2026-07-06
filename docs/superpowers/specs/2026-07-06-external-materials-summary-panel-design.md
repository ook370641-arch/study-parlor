# 外部资料摘要面板设计文档

**日期**：2026-07-06  
**主题**：Study Parlor 学习页右侧「外部资料摘要」看板  
**状态**：待实现

---

## 1. 背景与问题

当前启用联网资料后，`ExternalMaterialsCard` 仅展示来源链接列表，而 LLM 生成的「导师备课笔记」摘要虽然已存在并注入系统 prompt，却对用户不可见。用户希望在学习过程中能随时查看这份经过整理、带来源标注的摘要，且不希望它干扰对话区域。

## 2. 目标与成功标准

### 2.1 目标

- 在学习页右侧增加一个可展开/收起的摘要看板。
- 看板默认收起，点击后展开为 380px 宽覆盖层抽屉。
- 摘要内容完整展示，字数上限从 3000 字放宽到 5000 字。
- 每个关键观点后标注来源编号，底部列出完整来源链接。
- 面板展开时不挤占、不遮挡对话窗口的可用区域。
- 编写 E2E 测试覆盖真实使用流程。

### 2.2 成功标准

- 用户能在学习页通过可见入口打开摘要看板。
- 看板展示与当前 session 关联的 `externalMaterials.summary`。
- 看板内的来源编号可点击跳转到底部对应来源。
- 聊天消息列表在面板展开时仍保持可读与可交互（左部区域）。
- E2E 测试通过：开启联网资料 → 进入学习页 → 打开摘要面板 → 验证摘要文本与来源 → 关闭面板。

## 3. 当前状态

### 3.1 已有数据流

1. `PreStudyModal` 中用户勾选「引入联网资料」。
2. `session-runtime.ts` 的 `kickoffSession` 调用 `prepareExternalMaterials(topic)`。
3. `store.prepareExternalMaterials` 调用 `ipc.searchPrepare({ topic })`。
4. 主进程 `electron/ipc/search.ts`：
   - `generateSearchQueries` 生成 3 个搜索查询词。
   - `searchWeb` 调用 Tavily API（每个查询最多 5 条结果，basic depth，15s 超时，1 次重试）。
   - `generateTutorBrief` 调用 LLM 生成导师备课笔记。
5. 结果保存在 `store.externalMaterials`：
   - `summary: string`
   - `sources: SearchSource[]`
6. `externalMaterialsSummary` 被传入 `llm:start`，注入系统 prompt。
7. 归档时 `ipc.writeExternalMaterials` 把摘要和来源写入 `<sessionDir>/外部资料.md`。
8. 复习模式通过 `ipc.readExternalMaterials` 复用历史摘要。

### 3.2 当前提示词

#### 查询生成 prompt (`generateSearchQueries`)

```text
用户将要学习主题为："{topic}"

请生成 3 个搜索查询词，用于帮助一位苏格拉底式导师准备该主题的背景资料。

要求：
- 查询词应覆盖主题的核心概念、常见误解、实际应用
- 每个查询词简短，适合交给搜索引擎
- 只输出 JSON 数组，不要解释

输出格式：
["查询1", "查询2", "查询3"]
```

#### 摘要生成 prompt (`generateTutorBrief`)

```text
你是一位苏格拉底式导师的备课助手。以下是从网络搜索得到的关于 "{topic}" 的原始资料。

请整理成一份"导师备课笔记"，用于后续辅导时作为背景知识。

要求：
1. 控制在 3000 中文字以内
2. 包含：核心概念（2-4 个）、关键区分点、常见误解（2-3 个）、应用场景（1-2 个）、前置知识
3. 每个关键观点后附上原始来源编号 [1] [2] ...
4. 不要写成"教学大纲"，而要写成"导师知道但不直接告诉学生"的背景笔记

原始资料：
{sourcesText}
```

> 本次实现需将第 1 条要求从「3000 中文字以内」调整为「5000 中文字以内」。

## 4. 设计方案

### 4.1 布局：A 方案（可折叠右侧抽屉，覆盖层）

- **默认状态**：进入 `Study` 页面时面板**关闭**。
- **入口**：右侧屏幕边缘显示一条窄边标签，包含：
  - 竖排文字「摘要」
  - 来源数量 badge
- **展开**：点击标签后，右侧滑出 380px 宽抽屉。
- **收起**：点击抽屉右上角 ✕、点击抽屉外区域、或按 Esc。
- **动画**：300ms ease-out 滑入/滑出。

### 4.2 「不遮挡对话窗口」的语义

由于面板是覆盖层，物理上会覆盖右侧 380px 区域。为保证「不遮挡对话窗口」，采用以下策略：

1. **聊天区内容不被压在面板下**：当面板展开时，消息列表容器右侧增加 380px 的 `padding-right`（或等效约束），使气泡和文字停留在面板左侧可见区域内。
2. **聊天区仍保持全宽背景**：仅内容区域收缩，视觉上聊天窗口未被「挤窄」，而是内容主动避开覆盖层。
3. **点击外部关闭**：在面板左侧放置一层透明点击捕获层（z-index 介于面板与聊天区之间），点击该层任意位置关闭面板；该层不附带视觉遮罩，保持左部聊天区可见与可交互。
4. **快速关闭**：点击透明捕获层、抽屉右上角 ✕ 或按 Esc 立即关闭，用户可瞬间恢复全屏对话。

### 4.3 摘要内容展示

面板内部采用独立滚动区域，结构如下：

1. **标题栏**：🌐 外部资料摘要 + 关闭按钮。
2. **摘要正文**：按已有 prompt 结构分节渲染：
   - 核心概念
   - 关键区分点
   - 常见误解
   - 应用场景
   - 前置知识
3. **来源引注**：每段关键观点后显示 `[n]` 链接，点击后滚动到底部对应来源。
4. **来源列表**：底部固定或随文展示，包含编号、标题、URL 摘要。

### 4.4 摘要 prompt 调整

将 `generateTutorBrief` 中的字数限制从 3000 改为 5000：

```diff
- 1. 控制在 3000 中文字以内
+ 1. 控制在 5000 中文字以内
```

其余要求不变。来源编号 `[n]` 已存在，无需改动。

## 5. 数据流与状态

### 5.1 新增/变更状态

在 `src/store/index.ts` 的 `AppStore` 类型根层级增加：

```ts
isExternalSummaryOpen: boolean
```

默认值 `false`。该状态不属于 `Session`，因此不会被保存到未归档会话中。

操作：

- `openExternalSummary: () => void`
- `closeExternalSummary: () => void`
- `toggleExternalSummary: () => void`

### 5.2 组件交互

```
Study.tsx
├── ExternalMaterialsCard
│   └── 点击「摘要 →」调用 openExternalSummary()
└── ExternalSummaryPanel
    ├── 从 store 读取 isExternalSummaryOpen / externalMaterials
    ├── 渲染抽屉动画与内容
    └── 关闭时调用 closeExternalSummary()
```

### 5.3 复习模式

复习模式从历史 `外部资料.md` 读取的摘要同样通过 `externalMaterials` 状态提供，因此面板行为与 progress 模式一致。若历史 session 无外部资料，则面板入口不显示。

## 6. 组件改动

### 6.1 新增组件

- `src/components/ExternalSummaryPanel.tsx`
  - Props：无（全部从 store 读取）。
  - 负责抽屉动画、关闭手势、内容渲染。
  - 内部可拆分子组件：`SummarySection`、`SourceList`、`SourceTag`。

### 6.2 修改组件

- `src/components/ExternalMaterialsCard.tsx`
  - 新增点击区域：点击「摘要 →」打开面板。
  - 保持现有来源列表功能不变。
- `src/pages/Study.tsx`
  - 引入 `ExternalSummaryPanel`。
  - 根据 `isExternalSummaryOpen` 给消息列表动态添加/移除右侧 padding。
  - 监听 Esc 全局关闭面板。
- `src/store/index.ts`
  - 增加 `isExternalSummaryOpen` 状态与操作方法。

### 6.3 主进程改动

- `electron/lib/search.ts`
  - 修改 `generateTutorBrief` prompt 字数限制为 5000。

## 7. E2E 测试

### 7.1 新增测试文件

`e2e/specs/external-materials-summary-panel.spec.ts`

### 7.2 测试用例

#### TC-1：默认关闭

- 进入学习页。
- 断言摘要面板不可见，右侧摘要标签可见。

#### TC-2：打开与关闭面板

- 点击右侧「摘要」标签。
- 断言面板展开，标题为「外部资料摘要」。
- 断言面板内包含摘要文本（非空）。
- 断言面板内来源数量与 `ExternalMaterialsCard` 一致。
- 点击关闭按钮，断言面板不可见。
- 再次打开，按 Esc，断言面板不可见。

#### TC-3：来源引注可点击

- 打开面板。
- 点击摘要正文中的 `[1]` 来源编号。
- 断言底部来源列表中的第 1 条来源处于可见区域。

#### TC-4：展开时不遮挡对话内容

- 打开面板。
- 断言最新消息气泡的右边界不超过面板左边界（即气泡未被面板覆盖）。

#### TC-5：复习模式复用历史摘要

- 进入某已有外部资料的复习模式。
- 打开摘要面板。
- 断言面板内容包含历史摘要文本。

### 7.3 POM 更新

- `e2e/pages/StudyPage.ts`
  - 新增 locators：
    - `externalSummaryToggle`
    - `externalSummaryPanel`
    - `externalSummaryClose`
    - `externalSummarySourceTag(n)`
  - 新增方法：
    - `openExternalSummary()`
    - `closeExternalSummary()`
    - `isExternalSummaryVisible()`
- `e2e/helpers/selectors.ts`
  - 新增对应 data-testid 常量。

## 8. 错误处理

- **摘要缺失**：若 `externalMaterials.summary` 为空，摘要标签仍显示，但点击后面板内展示「暂无摘要」占位文案，来源列表仍可查看。
- **搜索失败**：保持现有行为，`ExternalMaterialsCard` 显示错误/降级信息，摘要标签不显示。
- **来源编号与 sources 数组不匹配**：若 LLM 生成了 `[5]` 但 sources 只有 3 条，渲染时该编号显示为普通文本，不渲染为链接。

## 9. 非目标

- 不新增 Markdown 编辑器功能。
- 不将摘要面板做成可拖拽（保持 A 方案固定右边缘）。
- 不做响应式断点自动切换宽度（固定 380px）。
- 不在面板内再次调用 LLM 重新生成摘要。

## 10. 实现风险与注意事项

1. **LLM 输出长度**：放宽到 5000 字后，需观察 Tavily 原始资料是否足够支撑；若资料不足，摘要仍可能较短。
2. **面板覆盖与聊天 padding 的同步**：需要确保 `padding-right` 的切换与抽屉动画同步，避免闪烁。
3. **焦点管理**：面板打开后焦点应进入面板，关闭后返回聊天输入框或页面主体。
4. **z-index**：面板层级需高于 `ExternalMaterialsCard` 和聊天消息，但低于归档弹窗等模态层。

## 11. 后续可扩展

- 支持在新窗口中打开 `外部资料.md` 完整文件。
- 支持用户手动调节面板宽度（拖拽边缘）。
- 支持在摘要正文中高亮当前对话相关的段落。
