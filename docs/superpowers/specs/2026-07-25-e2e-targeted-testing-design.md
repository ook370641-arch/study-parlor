# E2E 定向测试基础设施 — 实施记录

**日期**: 2026-07-25 | **状态**: 已完成

---

## 1. 背景

全量 E2E 套件 67 个 spec，每个需要冷启动 Electron（~5-8s），全量运行耗时 20+ 分钟。每次功能迭代后只需验证变更涉及的功能区域。

**方案**：建立源文件 → E2E spec 声明式映射表 + 自动化脚本，一条命令只跑受影响的测试。同时将维护规则写入 `.claude/rules/e2e.md`、`CLAUDE.md`、`e2e/README.md`，确保 Claude Code 在功能迭代后自动执行定向测试。

---

## 2. 产出物总览

```
源文件变更 → e2e/source-map.json → scripts/e2e-changed.js → Playwright 执行
                                  └─ 未匹配 → 仅 startup-health
```

| 文件 | 操作 | 说明 |
|---|---|---|
| `e2e/source-map.json` | 新建 | 11 组映射，覆盖全部 67 spec |
| `scripts/e2e-changed.js` | 新建 | git diff + minimatch + Playwright |
| `.claude/rules/e2e.md` | 修改 | 新增 §10 + 更新 description frontmatter |
| `CLAUDE.md` | 修改 | 新增"E2E 定向测试"章节 |
| `e2e/README.md` | 修改 | 追加"定向测试"章节 |
| `package.json` | 修改 | 新增 `test:e2e:changed` 脚本 |

---

## 3. `e2e/source-map.json` — 声明式映射表

### 设计原则

- `sources`：最小化 glob 集合，不枚举单个组件
- `specs`：优先用 glob pattern 覆盖同前缀族
- 源文件命中多个 group → spec 取并集（自动去重）
- 未命中任何 group → 仅跑 `startup-health.spec.ts`（`always` 列表）
- `src/store/index.ts` 由 `types-state` 覆盖，不在各业务 group 中重复

### 完整结构

```json
{
  "always": ["startup-health.spec.ts"],
  "groups": {
    "briefing-core": {
      "sources": [
        "src/pages/Briefing.tsx",
        "src/components/briefing/**",
        "src/components/Briefing*.tsx",
        "src/lib/parse-briefing-markdown.ts",
        "src/lib/format-briefing-date.ts",
        "src/lib/briefing-font-size.ts",
        "electron/ipc/briefing.ts"
      ],
      "specs": ["briefing.spec.ts", "briefing-*.spec.ts"]
    },
    "job-briefing": {
      "sources": [
        "src/components/job-briefing/**",
        "electron/lib/job-briefing.ts",
        "electron/ipc/job-briefing.ts",
        "electron/prompts/job-briefing/**",
        "src/lib/job-briefing-defaults.ts"
      ],
      "specs": ["job-briefing-*.spec.ts"]
    },
    "settings": {
      "sources": ["src/pages/Settings.tsx"],
      "specs": ["settings.spec.ts"]
    },
    "article-assistant": {
      "sources": [
        "electron/ipc/article-assistant.ts",
        "src/components/article-assistant/**",
        "src/lib/assistant-*.ts"
      ],
      "specs": [
        "article-assistant*.spec.ts",
        "article-annotations.spec.ts",
        "external-materials*.spec.ts",
        "guide-visibility.spec.ts"
      ]
    },
    "writing": {
      "sources": [
        "src/components/writing/**",
        "src/components/writing-assistant/**",
        "electron/lib/writing-*.ts",
        "electron/ipc/writing*.ts",
        "electron/lib/writing-assistant/**"
      ],
      "specs": ["writing-*.spec.ts"]
    },
    "study": {
      "sources": [
        "src/pages/Study.tsx",
        "src/components/PreStudyModal.tsx",
        "electron/ipc/llm.ts",
        "electron/lib/kimi.ts",
        "electron/lib/prompts.ts",
        "src/lib/finalize.ts",
        "src/lib/session-runtime.ts"
      ],
      "specs": [
        "new-topic-progress.spec.ts", "continue-topic.spec.ts",
        "review-topic.spec.ts", "terminology.spec.ts",
        "quote-display.spec.ts", "archive-edge.spec.ts",
        "pre-study.spec.ts", "study.spec.ts",
        "diagram-generation.spec.ts", "fable-generation.spec.ts",
        "group-guide.spec.ts"
      ]
    },
    "anthropic-blog": {
      "sources": [
        "src/components/anthropic/**",
        "electron/ipc/anthropic.ts"
      ],
      "specs": ["anthropic-blog*.spec.ts"]
    },
    "cover-home": {
      "sources": [
        "src/pages/Cover.tsx",
        "src/pages/Home.tsx",
        "src/pages/Profile.tsx"
      ],
      "specs": [
        "cover.spec.ts", "home.spec.ts", "profile.spec.ts",
        "smoke.spec.ts", "onboarding-journey.spec.ts",
        "wild-card.spec.ts", "continue-suggestions.spec.ts",
        "extension-page.spec.ts"
      ]
    },
    "library": {
      "sources": [
        "src/components/library/**",
        "electron/lib/writing-tree.ts",
        "electron/lib/writing-catalog.ts"
      ],
      "specs": ["library-*.spec.ts"]
    },
    "aesthetics": {
      "sources": [
        "src/components/paintings/**",
        "src/components/lighting/**",
        "src/lib/motion-*.ts",
        "electron/lib/painting-*.ts"
      ],
      "specs": [
        "painting-swap.spec.ts", "reading-ritual.spec.ts",
        "lighting.spec.ts", "generation-ceremony.spec.ts"
      ]
    },
    "types-state": {
      "sources": [
        "src/types/index.ts",
        "src/store/index.ts",
        "electron/ipc/state.ts"
      ],
      "specs": ["settings.spec.ts", "startup-health.spec.ts"]
    }
  }
}
```

### 覆盖统计

| 分组 | spec 数 | 触发条件示例 |
|---|---|---|
| `briefing-core` | 9 | 简报 UI/布局/生成/美学变更 |
| `job-briefing` | 3 | 求职简报搜索/生成/面板变更 |
| `settings` | 1 | 设置页面变更 |
| `article-assistant` | 11 | 文章旁注/搜索/标注/引导变更 |
| `writing` | 13 | 写作/写作助手变更 |
| `study` | 11 | 学习会话/LLM 调用变更 |
| `anthropic-blog` | 3 | 博客阅读器变更 |
| `cover-home` | 8 | 封面/首页/档案页变更 |
| `library` | 3 | 学习库管理变更 |
| `aesthetics` | 4 | 画作/光照/动效变更 |
| `types-state` | 2 | 类型/状态 schema 变更 |
| `always` | 1 | 始终运行（启动健康检查） |

> `settings.spec.ts` 和 `startup-health.spec.ts` 在多个 group 中出现，运行时自动去重。

---

## 4. `scripts/e2e-changed.js` — 自动化脚本

### 用法

```bash
node scripts/e2e-changed.js              # 列出受影响 spec（不执行）
node scripts/e2e-changed.js --run        # 执行受影响 spec
node scripts/e2e-changed.js --base main  # 指定比较基线（默认 main）
npm run test:e2e:changed                 # npm script 快捷方式
```

### 核心逻辑

1. 读取 `e2e/source-map.json`
2. 获取变更文件（三层回退）：
   - 优先：`git diff --name-only <base>...HEAD`（分支差异）
   - 回退：`git diff --name-only --cached`（staged）+ `git diff --name-only`（unstaged）
   - 补充：`git ls-files --others --exclude-standard`（untracked 新文件）
3. 对每个 group，用 `minimatch` 检查 source pattern 是否匹配任一变更文件
4. 收集命中 group 的 specs + `always` 列表
5. 解析 spec glob pattern 为实际文件（`fs.readdirSync` + `minimatch`）
6. 去重排序后输出；`--run` 模式调用 `npx playwright test`

### 依赖与兼容

- **`minimatch`**：项目已有传递依赖，无需额外安装
- **路径解析**：Playwright 的 `testDir` 已设为 `e2e/specs/`，脚本传入 spec 文件名（不含路径前缀）即可正确匹配
- **超时**：Playwright 执行超时 600s（10 分钟），覆盖最慢的真实 API 测试

### Edge case 处理

| 场景 | 行为 |
|---|---|
| 无变更文件 | 输出提示并退出 |
| 变更不匹配任何 group | 仅输出 `startup-health.spec.ts` |
| `main...HEAD` 失败（同分支/初始提交） | 回退到工作区变更 |
| spec glob 无匹配文件 | 输出 warning 并跳过 |
| group 缺少 `sources`/`specs` 字段 | 输出 warning 并跳过 |

---

## 5. 文档更新

### `.claude/rules/e2e.md` — 新增 §10

```markdown
## 10. 功能迭代后跑定向 E2E，新建 spec 同步维护 source-map

**Why:** 全量 E2E 67 个 spec 耗时 20+ 分钟；source-map 过期会导致新增 spec 永远不会被定向执行。

- 代码变更完成后，运行 `node scripts/e2e-changed.js --run` 执行受影响的 spec。
- **新建 E2E spec 或新增页面/组件/IPC 模块时，必须同步更新 `e2e/source-map.json`**。
- `startup-health.spec.ts` 始终包含在每次运行中。
- 变更不匹配任何 group → 仅跑 startup-health；若此结果不合理，说明 source-map 需要更新。
- CI/合并前仍需全量 `npm run test:e2e`。
- Source: 2026-07-25 E2E targeting infra
```

同时更新了文件顶部的 `description` frontmatter，追加 `"or the e2e/source-map.json mapping"`。

### `CLAUDE.md` — 新增"E2E 定向测试"章节

在"常用命令"之后插入，含 bash 命令 + **source-map 维护**说明。篇幅 9 行，与相邻章节一致。

### `e2e/README.md` — 追加"定向测试"章节

在"标记"章节之后追加，含用法示例 + 映射表维护规则。

### `package.json` — 新增脚本

```json
"test:e2e:changed": "node scripts/e2e-changed.js --run"
```

---

## 6. 规则合并分析

审查 `e2e.md` 现有 9 条规则：

- **§1 / §1b / §1c**：均为 mock vs. real API 策略，可合并为一条。属独立改动，本次不做。
- **§10（新）**：独立关注点（开发工作流），不与其他规则重叠。
- 跨文件检查：其他规则文件无 E2E 相关条目，无需跨文件合并。

---

## 7. 验证结果

- [x] `node scripts/e2e-changed.js` 正确列出受影响 spec（6 个配置变更 → 仅 startup-health）
- [x] `node scripts/e2e-changed.js --run` 成功执行 startup-health.spec.ts（23.9s 通过）
- [x] 模拟 `src/components/job-briefing/*` 变更 → 命中 `job-briefing` group（4 spec）
- [x] 模拟 `src/store/index.ts` 变更 → 命中 `types-state` group（2 spec）
- [x] 模拟 `src/pages/Settings.tsx` 变更 → 命中 `settings` + `types-state` groups（2 spec 去重）
- [x] 模拟 `src/components/writing/*` 变更 → 命中 `writing` group（14 spec）
- [x] 未匹配任何 group 的变更 → 仅输出 `startup-health.spec.ts`
- [x] Untracked 新文件（`source-map.json`、`e2e-changed.js`）被正确收集
- [x] 跨组匹配去重正常（`settings.spec.ts` 同时出现于 `settings` 和 `types-state`）

---

## 8. 使用示例

```
# 修改了 src/components/job-briefing/JobProfilePanel.tsx
$ node scripts/e2e-changed.js
[e2e-changed] Changed files (1):
  src/components/job-briefing/JobProfilePanel.tsx
[e2e-changed] Affected groups: job-briefing
[e2e-changed] Specs to run (4):
  e2e/specs/job-briefing-error.spec.ts
  e2e/specs/job-briefing-generation.spec.ts
  e2e/specs/job-briefing-profile-panel.spec.ts
  e2e/specs/startup-health.spec.ts

$ node scripts/e2e-changed.js --run
# → 执行 4 个 spec (~2min vs 全量 20min)
```
