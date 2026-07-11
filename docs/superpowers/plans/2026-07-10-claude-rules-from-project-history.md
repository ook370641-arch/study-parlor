# Claude Code 项目规则沉淀实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 从 Study Parlor 过去 534 次 git 提交、`docs/superpowers/specs/` 中的 40 份 spec、CLAUDE.md 及代码注释中，提炼 AI 反复犯错模式，沉淀为 `.claude/rules/` 长期规则目录，减少未来 AI 犯错。

**Architecture:** 采用“扫描量化 → 样例深挖 → 抽象偏差 → 专项规则 → 通用规则 → README 进度追踪”的流水线。大量使用 subagent 并行读取提交、spec 和代码；规则文件按“抽象偏差 → 本项目表现 → 来源”三段式组织，通用规则承载跨领域 Agent 行为偏差，专项规则承载技术域具体约束。

**Tech Stack:** Git + Markdown + Claude Code subagent (general-purpose / Explore)

---

## 文件结构

| 文件 | 职责 |
|---|---|
| `.claude/rules/README.md` | 规则目录总览、使用说明、覆盖进度、Changelog、更新触发条件 |
| `.claude/rules/general.md` | 跨领域通用 Agent 行为偏差规则（验证缺口、完整性盲区、过度工程等） |
| `.claude/rules/feature-development.md` | 功能开发全流程规则：需求理解、spec 对齐、边界场景、交付验证 |
| `.claude/rules/e2e.md` | E2E 测试规则：真实链路、fixture 隔离、进程清理、选择器约定 |
| `.claude/rules/ipc-state.md` | Electron IPC、主/渲染进程隔离、Zustand 状态持久化规则 |
| `.claude/rules/llm.md` | LLM 调用规则：Kimi API 约束、prompt 装配、SSE 解析、流式会话 |
| `.claude/rules/ui-styling.md` | React + Tailwind 组件规则：主题色、测试 ID、动画/布局竞争 |
| `.claude/rules/build-dev.md` | 构建、开发环境、Electron 缓存/进程清理规则 |

> 注：Task 5 扩展扫描后，可能新增或合并专项文件。最终文件清单以 Task 7 去重结果为准。

---

### Task 1: 创建 `.claude/rules/` 目录骨架与 README.md

**Files:**
- Create: `.claude/rules/README.md`

- [ ] **Step 1: 创建规则目录**

Run:
```bash
mkdir -p .claude/rules
```

Expected: 目录存在。

- [ ] **Step 2: 写入 README.md 骨架**

创建 `.claude/rules/README.md`：

```markdown
# Claude Code 项目规则

本目录保存从 Study Parlor 开发历史中提炼的长期规则，供 Claude Code 自动读取，减少重复犯错。

## 规则文件

| 文件 | 覆盖领域 | 状态 |
|---|---|---|
| `general.md` | 跨领域 Agent 行为偏差 | 🔲 待生成 |
| `feature-development.md` | 功能开发全流程 | 🔲 待生成 |
| `e2e.md` | E2E 测试与真实链路验证 | 🔲 待生成 |
| `ipc-state.md` | Electron IPC 与状态管理 | 🔲 待生成 |
| `llm.md` | LLM 调用与 prompt | 🔲 待生成 |
| `ui-styling.md` | UI 组件与样式 | 🔲 待生成 |
| `build-dev.md` | 构建与开发环境 | 🔲 待生成 |

## 规则条目格式

每条规则采用以下结构：

```markdown
### 规则标题

- **抽象偏差**：这是什么类型的 Agent 常见问题（如“验证缺口”“完整性盲区”）。
- **本项目表现**：在 Study Parlor 里具体如何体现。
- **必须这样做**：正确的行为或检查清单。
- **常见错误**：AI 以前在这里怎么错的。
- **来源**：`commit:<hash>` / `spec:<path>` / `CLAUDE.md`。
```

## 当前进度

- 已扫描提交：0 / ~534
- 已扫描 specs：0 / 40
- 已覆盖模块：无
- 待覆盖模块：夜航简报、E2E 全链路、IPC/状态、LLM、UI、构建开发环境……

## 更新触发条件

1. 用户明确纠正 AI 的某个错误，且该错误具有复现模式。
2. 连续两次同类任务出现相同偏差。
3. 项目架构/技术栈发生重大变化，导致旧规则失效。
4. 每季度末回顾一次规则覆盖率与过期规则。

## Changelog

- `2026-07-10` 创建规则目录与 README。
```

Expected: 文件 `.claude/rules/README.md` 存在且内容完整。

---

### Task 2: 扫描 git 提交与 specs，生成功能迭代密度报告

**Files:**
- Create: `.claude/rules/.tmp/iteration-density-report.md`（临时工作文件，Task 7 后可删除或归档）

- [ ] **Step 1: 派发 subagent 扫描提交历史**

使用 `Agent` 调用 general-purpose subagent，提示词：

```
你是代码历史分析专家。请分析 Study Parlor 项目的 git 提交历史（约 534 次提交），目标是从中识别“哪些功能模块经历了最多的迭代、补丁、重做或修复”。

工作方法：
1. 运行 `git log --oneline --all --reverse` 获取完整提交列表。
2. 按功能域对提交分组。优先关注以下领域：夜航简报(briefing)、E2E 测试、IPC/状态管理、LLM/prompt、UI/组件、构建/开发环境、归档/学习库。
3. 对每组，识别：
   - 该功能初次出现的 commit。
   - 后续明显的“补丁/修复/重做/优化”提交（不是新增功能，而是修正已有功能）。
   - 是否有 revert 提交。
   - 是否有对应的 spec 文件及 spec 是否也多次迭代。
4. 输出一份 Markdown 报告，按“迭代密度”从高到低排序，包含：功能名、相关 commits（hash + message）、相关 specs、主要问题摘要。

要求：
- 不要阅读每个 diff 的每个字，通过 commit message 语义判断。
- 对反复出现的模式，向上抽象为 Agent 行为偏差（如“验证不深入”“边界遗漏”“过度工程”）。
- 报告保存到 `.claude/rules/.tmp/iteration-density-report.md`。
```

Expected: `.claude/rules/.tmp/iteration-density-report.md` 存在，包含按密度排序的功能模块列表。

- [ ] **Step 2: 人工快速确认高密度模块**

读取 `.claude/rules/.tmp/iteration-density-report.md` 的前 5-8 个模块，确认夜航简报和 E2E 全链路是否在前两名。

Expected: 报告合理，无明显遗漏。

---

### Task 3: 深挖夜航简报模块 → 输出专项规则候选

**Files:**
- Create: `.claude/rules/.tmp/briefing-rules-draft.md`

- [ ] **Step 1: 派发 subagent 读 spec 链与提交链**

使用 `Agent` 调用 general-purpose subagent，提示词：

```
你是规则提炼专家。请针对 Study Parlor 的“夜航简报(briefing)”功能，完成一次端到端的规则挖掘。

输入：
1. 所有与 briefing 相关的 spec：`docs/superpowers/specs/2026-06-21-night-briefing-design.md`、`docs/superpowers/specs/2026-06-27-briefing-entry-and-loading-design.md`、`docs/superpowers/specs/2026-06-27-briefing-ui-upgrade-design.md`、`docs/superpowers/specs/2026-07-06-night-briefing-optimization-design.md`、`docs/superpowers/specs/2026-07-10-anthropic-blog-briefing-design.md` 等。
2. 所有与 briefing 相关的 git 提交（从 `git log --oneline --all --grep=briefing` 及按文件路径 `src/pages/Briefing.tsx`、`src/components/briefing/`、`electron/ipc/briefing.ts` 等筛选）。
3. 当前 briefing 相关代码：`src/pages/Briefing.tsx`、`src/components/briefing/`、`electron/ipc/briefing.ts`、`src/store/index.ts` 中的 briefing 相关 state 与 actions。

任务：
1. 梳理 briefing 功能从初版到最新版的演进线。
2. 识别每个“补丁/修复/优化”提交背后的问题：是设计遗漏？边界未考虑？验证不足？还是实现过度复杂？
3. 把每个问题向上抽象为 Agent 行为偏差。
4. 按以下格式输出规则候选：

```markdown
### [规则标题]
- **抽象偏差**：[如“完整性盲区”]
- **本项目表现**：[ briefing 里的具体表现 ]
- **必须这样做**：[ 正确的行为/检查清单 ]
- **常见错误**：[ AI 以前怎么错的 ]
- **来源**：[ commit:<hash> / spec:<path> ]
```

输出保存到 `.claude/rules/.tmp/briefing-rules-draft.md`。
```

Expected: `.claude/rules/.tmp/briefing-rules-draft.md` 存在，包含 5-15 条规则候选。

---

### Task 4: 深挖 E2E 全链路模块 → 输出专项规则候选

**Files:**
- Create: `.claude/rules/.tmp/e2e-rules-draft.md`

- [ ] **Step 1: 派发 subagent 读 E2E spec 链与提交链**

使用 `Agent` 调用 general-purpose subagent，提示词：

```
你是规则提炼专家。请针对 Study Parlor 的 E2E 测试体系，完成一次端到端的规则挖掘。

输入：
1. E2E 相关 spec：`docs/superpowers/specs/2026-06-24-e2e-automation-design.md`、`docs/superpowers/specs/2026-06-27-e2e-full-coverage-design.md`、`docs/superpowers/specs/2026-07-02-e2e-coverage-expansion-design.md`。
2. E2E 相关提交：从 `git log --oneline --all --grep=e2e` 及按路径 `e2e/`、`tests/`、`scripts/lib/process-cleanup.js`、`electron/main.ts` 中 E2E 相关修改筛选。
3. 当前 E2E 代码：`e2e/fixtures/`、`e2e/helpers/`、`e2e/specs/`、`e2e/playwright.config.ts`。

任务：
1. 梳理 E2E 体系从初版到最新版的演进，特别关注：
   - 是否曾经只测试了失败/模拟路径，没有跑通真实 API/真实链路？
   - 进程清理、fixture 隔离、测试目录管理出现过哪些问题？
   - 选择器、POM、测试库设计迭代过几次？
2. 把问题向上抽象为 Agent 行为偏差（如“验证缺口”“对真实环境理解不足”“ cleanup 遗漏”）。
3. 按标准格式输出规则候选到 `.claude/rules/.tmp/e2e-rules-draft.md`。
```

Expected: `.claude/rules/.tmp/e2e-rules-draft.md` 存在，包含 5-15 条规则候选。

---

### Task 5: 扩展扫描其余高风险模块

**Files:**
- Create: `.claude/rules/.tmp/{module}-rules-draft.md`（每个模块一个草稿）

- [ ] **Step 1: 根据 Task 2 报告，选择 3-5 个次高风险模块**

从 `.claude/rules/.tmp/iteration-density-report.md` 中选取除 briefing 和 E2E 外的最高密度模块，例如：
- IPC / 状态管理
- LLM / prompt / 会话归档
- UI / 样式 / 动画
- 构建 / 开发环境 / 进程清理
- 学习库 / 归档 / frontmatter

- [ ] **Step 2: 为每个模块派发独立 subagent 并行分析**

对每个模块使用 `Agent` 调用 general-purpose subagent，提示词模板：

```
你是规则提炼专家。请针对 Study Parlor 的 [MODULE_NAME] 模块完成规则挖掘。

输入：
1. 相关 spec 文件（从 docs/superpowers/specs/ 中按主题筛选）。
2. 相关 git 提交（从 git log 中按文件路径和 commit message 语义筛选）。
3. 当前相关代码。

任务：
1. 梳理该模块的演进线和反复出现的问题。
2. 向上抽象为 Agent 行为偏差。
3. 按标准格式输出规则候选到 `.claude/rules/.tmp/[module]-rules-draft.md`。
```

并行派发多个 subagent，分别处理不同模块。

Expected: 每个模块生成一个草稿文件，合计新增 10-30 条规则候选。

---

### Task 6: 提炼 `general.md` 通用规则

**Files:**
- Create: `.claude/rules/general.md`

- [ ] **Step 1: 派发 subagent 从所有草稿中抽象通用偏差**

使用 `Agent` 调用 general-purpose subagent，提示词：

```
你是规则架构师。请阅读以下文件中的规则候选：
- `.claude/rules/.tmp/briefing-rules-draft.md`
- `.claude/rules/.tmp/e2e-rules-draft.md`
- `.claude/rules/.tmp/*-rules-draft.md`
- `CLAUDE.md`（项目根目录，已存在的通用纪律）

任务：
1. 归纳跨模块反复出现的 Agent 行为偏差，形成 5-10 条高阶通用规则。
2. 每条规则必须：
   - 抽象到“Agent 常见问题”层面，不绑定具体技术域。
   - 给出定义、典型表现、必须遵守的原则。
   - 附上 2-3 个本项目中的具体例子（可来自不同模块）。
3. 输出到 `.claude/rules/general.md`，格式：

```markdown
# 通用规则

## 1. [偏差名称]

**定义**：...

**典型表现**：...

**必须遵守**：...

**本项目例子**：
- 夜航简报：...
- E2E：...

## 2. ...
```

注意：规则要精炼，general.md 是每次对话都会注入的上下文，不宜过长。
```

Expected: `.claude/rules/general.md` 存在，包含 5-10 条高阶通用规则。

---

### Task 7: 整合去重，生成所有专项规则文件

**Files:**
- Create: `.claude/rules/feature-development.md`
- Create: `.claude/rules/e2e.md`
- Create: `.claude/rules/ipc-state.md`
- Create: `.claude/rules/llm.md`
- Create: `.claude/rules/ui-styling.md`
- Create: `.claude/rules/build-dev.md`
- Modify: `.claude/rules/.tmp/*`（草稿文件，最终可删除）

- [ ] **Step 1: 派发 subagent 按技术域归类并去重**

使用 `Agent` 调用 general-purpose subagent，提示词：

```
你是规则整理专家。请阅读 `.claude/rules/.tmp/` 下的所有规则草稿和 `.claude/rules/general.md`。

任务：
1. 将草稿中的规则按技术域归类到以下文件：
   - `feature-development.md`：功能需求理解、spec 对齐、边界场景、交付验证。
   - `e2e.md`：E2E 测试、真实链路、fixture、进程清理。
   - `ipc-state.md`：Electron IPC、主/渲染进程、Zustand 状态。
   - `llm.md`：LLM 调用、prompt、SSE、归档。
   - `ui-styling.md`：React 组件、Tailwind、测试 ID、动画。
   - `build-dev.md`：构建、开发环境、缓存、进程清理脚本。
2. 删除重复规则：如果一条规则在 general.md 和专项文件中都出现，保留在 general.md 中的抽象版本，在专项文件中保留具体化版本，并互相引用。
3. 每条专项规则格式：

```markdown
### [规则标题]

- **抽象偏差**：[引用 general.md 中的偏差名]
- **本项目表现**：...
- **必须这样做**：...
- **常见错误**：...
- **来源**：...
```

4. 如果一个规则不适合现有文件，创建新的专项文件并更新 README。
```

Expected: 所有专项规则文件生成，规则按标准格式组织，无重复。

---

### Task 8: 更新 README.md 进度与文件索引

**Files:**
- Modify: `.claude/rules/README.md`

- [ ] **Step 1: 更新文件索引表状态**

把 README.md 中的状态列从 `🔲 待生成` 改为 `✅ 已生成`，并补齐每条规则的覆盖领域摘要。

- [ ] **Step 2: 更新进度统计**

填入实际数字：
- 已扫描提交：~534
- 已扫描 specs：40
- 已覆盖模块：[列出]
- 待覆盖模块：[列出，如果有]

- [ ] **Step 3: 添加 Changelog 条目**

```markdown
- `2026-07-10` 完成首轮规则沉淀：覆盖 briefing、E2E、IPC/状态、LLM、UI、构建等模块，共生成 X 条规则。
```

Expected: README.md 反映最新进度。

---

### Task 9: 规则质量检查

**Files:**
- Read: `.claude/rules/general.md`
- Read: `.claude/rules/*.md`

- [ ] **Step 1: 运行自动化检查脚本**

在 Bash 中运行：

```bash
# 检查每个规则文件是否包含来源标注
grep -L "来源" .claude/rules/*.md || echo "所有文件都包含来源"

# 统计规则数量
echo "general 规则数:"
grep -c "^## " .claude/rules/general.md

echo "专项规则总数:"
grep -c "^### " .claude/rules/feature-development.md .claude/rules/e2e.md .claude/rules/ipc-state.md .claude/rules/llm.md .claude/rules/ui-styling.md .claude/rules/build-dev.md
```

Expected:
- 所有 `.claude/rules/*.md` 都包含“来源”字段。
- general.md 有 5-10 条规则。
- 每个专项文件有 3-10 条规则。

- [ ] **Step 2: 人工抽检 3-5 条规则**

随机挑选规则，检查：
- 是否确实有来源（commit/spec）。
- 抽象偏差是否准确。
- “必须这样做”是否可执行。

Expected: 无明显质量问题。

---

### Task 10: 清理临时文件并提交

**Files:**
- Delete: `.claude/rules/.tmp/`（可选，如果不需要保留草稿）

- [ ] **Step 1: 决定是否保留草稿**

如果草稿有价值，保留在 `.claude/rules/.tmp/` 并 gitignore 掉；否则删除。

推荐：删除 `.claude/rules/.tmp/`，因为最终规则文件已经包含所有有效信息。

- [ ] **Step 2: 提交规则目录**

Run:
```bash
git add .claude/rules/
git commit -m "docs(rules):沉淀项目历史中的 AI 反复犯错模式

- 从 534 次提交和 40 份 specs 中提炼规则
- 覆盖 briefing、E2E、IPC/状态、LLM、UI、构建等模块
- general.md 承载跨领域 Agent 行为偏差
- 每条规则标注来源并持续更新 README 进度"
```

Expected: 提交成功，`.claude/rules/` 进入版本控制。

---

## 自检

### 1. Spec 覆盖度

| 来源 | 处理方式 |
|---|---|
| git 提交历史（~534 次） | Task 2 扫描密度；Task 3-5 分模块深挖 |
| `docs/superpowers/specs/`（40 份） | Task 3-5 按模块读取对应 spec |
| `CLAUDE.md` | Task 6 继承并抽象为 general.md 基础 |
| 代码 TODO/FIXME/HACK 注释 | Task 5 扩展扫描时作为辅助验证 |

### 2. Placeholder 扫描

- 无 "TBD"、"TODO"。
- 所有 subagent 提示词给出完整指令。
- 规则文件路径和命名已明确。

### 3. 一致性

- 所有规则条目统一使用“抽象偏差 → 本项目表现 → 必须这样做 → 常见错误 → 来源”格式。
- general.md 与专项文件通过“抽象偏差”字段交叉引用。
- README.md 文件索引、进度统计、Changelog 同步更新。

---

## 执行选项

**计划已完成并保存到 `docs/superpowers/plans/2026-07-10-claude-rules-from-project-history.md`。**

两个执行方式：

**1. Subagent-Driven（推荐）**
- 每个 Task 派发一个或多个独立 subagent，按依赖顺序串行或并行实现。
- 适合大量文件读取和规则提炼场景。

**2. Inline Execution**
- 在当前会话里按 Task 顺序直接推进，使用 executing-plans 批量执行。
- 适合快速推进、减少上下文切换。

**请选择一种方式继续。**
