# E2E 定向测试基础设施 — 设计文档

**日期**: 2026-07-25 | **状态**: 待审核

---

## 1. 背景

全量 E2E 套件有 65 个 spec 文件，每个都需要冷启动 Electron（~5-8s），全量运行耗时 20+ 分钟。当前每次功能迭代后要么跑全量（太慢），要么手动挑 spec（容易漏），缺乏自动化的定向测试机制。

**目标**：建立源文件 → E2E spec 映射系统，跑一次命令即可只执行受影响的测试。同时将这一流程写入规则和文档，让 Claude Code 在功能迭代后自动执行。

---

## 2. 方案设计

三个产出物构成完整闭环：

```
源文件变更 → source-map.json 匹配 → scripts/e2e-changed.js → Playwright 执行
                                                              ↓
                              CLAUDE.md / e2e.md §10 规则 → AI 自动调用
```

### 2.1 `e2e/source-map.json` — 声明式映射表

JSON 文件，定义源文件 glob → E2E spec glob 的映射关系。结构：

```json
{
  "always": ["e2e/specs/startup-health.spec.ts"],
  "groups": {
    "<group-name>": {
      "sources": ["glob/pattern/**"],
      "specs": ["spec-name-*.spec.ts"]
    }
  }
}
```

- `always`：始终运行的 spec（启动健康检查）
- `groups`：按功能域分组的映射
- `sources`：匹配源文件的 glob pattern
- `specs`：匹配 E2E spec 文件的 glob pattern（相对于 `e2e/specs/`）

**分组设计**（基于现有 65 个 spec 的功能域分析）：

| 分组 | 源文件范围 | Spec 数量 | 触发条件示例 |
|---|---|---|---|
| `briefing-core` | `src/pages/Briefing.tsx`, `src/components/briefing/**`, `src/components/BriefingDateColumn.tsx` 等 | ~10 | 简报UI/布局/主题变更 |
| `job-briefing` | `src/components/job-briefing/**`, `electron/lib/job-briefing.ts`, `electron/ipc/job-briefing.ts`, `electron/prompts/job-briefing/**`, `src/lib/job-briefing-defaults.ts` | 3 | 求职简报搜索/生成/面板变更 |
| `settings` | `src/pages/Settings.tsx`, `electron/ipc/state.ts` | 1 | 设置页面变更 |
| `article-assistant` | `electron/ipc/article-assistant.ts`, `src/components/article-assistant/**`, `src/lib/assistant-*.ts` | 5 | 文章旁注/搜索/标注变更 |
| `writing` | `src/components/writing/**`, `src/components/writing-assistant/**`, `electron/lib/writing-*.ts`, `electron/ipc/writing*.ts`, `electron/lib/writing-assistant/**` | 13 | 写作/写作助手变更 |
| `study-session` | `src/pages/Study.tsx`, `src/components/PreStudyModal.tsx`, `electron/ipc/llm.ts`, `electron/lib/kimi.ts`, `electron/lib/prompts.ts`, `src/lib/finalize.ts` | 8 | 学习会话/LLM 调用变更 |
| `anthropic-blog` | `src/components/anthropic/**`, `electron/ipc/anthropic.ts` | 3 | 博客阅读器变更 |
| `cover-home` | `src/pages/Cover.tsx`, `src/pages/Home.tsx`, `src/pages/Profile.tsx` | 5 | 封面/首页/档案页变更 |
| `library` | `src/components/library/**`, `electron/lib/writing-tree.ts`, `electron/lib/writing-catalog.ts` | 5 | 学习库管理变更 |
| `types-state` | `src/types/index.ts`, `src/store/index.ts` | 3 | 类型/状态 schema 变更（影响范围最广） |

**匹配逻辑**：一个源文件可以命中多个 group。如 `src/store/index.ts` 同时命中 `job-briefing`、`types-state`。所有命中 group 的 spec 取并集后执行。

### 2.2 `scripts/e2e-changed.js` — 自动化脚本

```javascript
/**
 * 基于 git diff 运行受影响的 E2E 测试
 *
 * 用法：
 *   node scripts/e2e-changed.js              # 列出受影响的 spec（不执行）
 *   node scripts/e2e-changed.js --run        # 执行受影响的 spec
 *   node scripts/e2e-changed.js --base main  # 指定比较基线（默认 main）
 */
```

**核心逻辑**：
1. 读取 `e2e/source-map.json`
2. 运行 `git diff --name-only <base>...HEAD` 获取变更文件列表
3. 对每个 group，用 `minimatch` 检查是否有 source pattern 匹配任一变更文件
4. 命中则加入该 group 的全部 specs + `always` 列表
5. 去重后：无 `--run` 则打印列表；有 `--run` 则调用 Playwright 执行

**依赖**：`minimatch`（项目已有依赖，见 `node_modules/minimatch`）

**Edge cases**：
- 无变更文件 → 输出 "No changes detected" 并退出
- 变更文件不匹配任何 group → 仅输出 `always` 列表（startup-health）
- 删除的源文件 → `git diff` 仍会列出，正常匹配

### 2.3 规则与文档更新

#### `.claude/rules/e2e.md` — 新增 §10

```markdown
## 10. 功能迭代后必须跑变更相关的 E2E 测试

**Why:** 全量 E2E 65 个 spec 耗时 20+ 分钟，每次功能迭代只需验证变更涉及的功能区域。

- 代码变更完成后，运行 `node scripts/e2e-changed.js --run` 执行受影响的 E2E spec。
- 若 `e2e/source-map.json` 未覆盖新增文件，先更新映射再跑测试。
- `startup-health.spec.ts` 始终包含在每次运行中（`always` 列表）。
- 若变更涉及 `src/types/index.ts` 或 `src/store/index.ts`，额外确认 `types-state` group 已覆盖相关 spec。
- CI / 合并前仍需要全量 `npm run test:e2e`，此规则仅适用于本地开发迭代。
- Source: 2026-07-25 E2E targeting infra
```

#### `CLAUDE.md` — 新增 "E2E 定向测试" 章节

在 "常用命令" 之后插入：

```markdown
## E2E 定向测试

功能迭代后不要跑全量 E2E。使用定向测试只跑变更相关的 spec：

```bash
# 列出受影响的 spec（不执行，先确认范围）
node scripts/e2e-changed.js

# 执行受影响的 spec
node scripts/e2e-changed.js --run

# 全量 E2E（仅合并前）
npm run test:e2e
```

**映射表**：`e2e/source-map.json`。新增功能模块时同步更新映射。
```

#### `e2e/README.md` — 追加定向测试章节

在 "标记" 章节之后追加：

```markdown
## 定向测试

日常开发迭代使用定向测试，只跑变更相关的 spec：

```bash
node scripts/e2e-changed.js --run
```

**工作原理**：读取 `git diff --name-only main...HEAD`，在 `e2e/source-map.json` 中匹配受影响的源文件，只执行对应分组的 E2E spec。`startup-health.spec.ts` 始终执行。

**手动指定 spec**（source map 未覆盖时）：
```bash
npx playwright test --config e2e/playwright.config.ts \
  e2e/specs/job-briefing-*.spec.ts \
  e2e/specs/settings.spec.ts
```
```

#### `package.json` — 新增脚本

```json
"test:e2e:changed": "node scripts/e2e-changed.js --run"
```

---

## 3. 文件变更清单

| 文件 | 操作 | 说明 |
|---|---|---|
| `e2e/source-map.json` | 新建 | 源文件 → E2E spec 映射表 |
| `scripts/e2e-changed.js` | 新建 | Git diff + 映射 + Playwright 执行 |
| `.claude/rules/e2e.md` | 修改 | 新增 §10 规则 |
| `CLAUDE.md` | 修改 | 新增 E2E 定向测试章节 |
| `e2e/README.md` | 修改 | 追加定向测试文档 |
| `package.json` | 修改 | 新增 `test:e2e:changed` 脚本 |

---

## 4. 使用示例

```
# 修改了 src/components/job-briefing/JobProfilePanel.tsx
$ git diff --name-only main...HEAD
src/components/job-briefing/JobProfilePanel.tsx

$ node scripts/e2e-changed.js
Affected groups: job-briefing
Always: startup-health.spec.ts
Specs to run:
  e2e/specs/startup-health.spec.ts
  e2e/specs/job-briefing-error.spec.ts
  e2e/specs/job-briefing-generation.spec.ts
  e2e/specs/job-briefing-profile-panel.spec.ts
Total: 4 specs

$ node scripts/e2e-changed.js --run
# → 执行以上 4 个 spec (~2min vs 全量 20min)
```

---

## 5. 向后兼容

- 现有 `npm run test:e2e` / `test:e2e:core` / `test:e2e:smoke` 脚本不受影响
- 现有 E2E 测试代码无需修改
- 新脚本依赖的 `minimatch` 已是项目依赖
- `source-map.json` 未覆盖的变更 → 优雅降级为仅跑 `startup-health`

---

## 6. 验证清单

- [ ] `node scripts/e2e-changed.js` 正确列出受影响的 spec
- [ ] `node scripts/e2e-changed.js --run` 成功执行受影响的 spec
- [ ] 修改 `src/components/job-briefing/*` → 命中 `job-briefing` group
- [ ] 修改 `src/pages/Settings.tsx` → 命中 `settings` + `types-state` groups
- [ ] 修改不匹配任何 group 的文件 → 仅输出 `startup-health.spec.ts`
- [ ] `npm run test:e2e:changed` 正常工作
- [ ] CLAUDE.md E2E 章节在 AI 上下文中可见
