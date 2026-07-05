# Study Parlor 全量 E2E 测试设计

**日期**: 2026-06-27  
**范围**: 2026-06-20 及之前已启用功能（夜航简报除外）  
**策略**: 全部真实 LLM 调用，使用现有隔离设施

---

## 1. 目标

补充 Study Parlor 应用在 2026-06-20 及之前启用功能的端到端测试，覆盖除夜航简报外的所有用户可见功能、按钮和状态流转。本次设计不修改业务代码，只扩展 E2E 测试、Page Object、Helpers 与文档。

---

## 2. 核心约束

### 2.1 LLM 调用策略：全部真实调用

- 所有涉及 `llm:start`、`llm:finalizeProgress`、`llm:finalizeReview`、`llm:probe` 的 E2E 测试都走真实 Kimi API。
- 不引入 HTTP mock、MSW 或 SSE stub。
- 该决策写入 `e2e/README.md`，作为项目长期规范：后续新增 API 相关功能也应遵循此策略。

### 2.2 范围边界：严格早于 2026-06-21

纳入范围的功能以设计文档日期为准，**仅包含 2026-06-20 及之前的计划**：

- 包含：Setup Wizard、Settings、Profile、Study Library 分组管理、PreStudy 模态、Study 会话生命周期、归档、寓言、图表、Continue Suggestions、Group Inspiration、画作切换、语录基础展示等。
- 排除：
  - 夜航简报（用户明确要求除外）
  - Writer Quotes（2026-06-21）
  - Web Search / 外部资料搜索（2026-06-21）
  - Wild-card Recommendation（2026-06-21）
  - DIY Terminology（2026-06-23，仅后端实现，无 UI 入口）
  - Quote Display Refinement（2026-06-25，属于 quote 展示增强）

> 对于 Settings 页面中的搜索 API Key 输入框（Settings 页面本身属于 2026-06-14），仅验证输入与保存 UI，不验证真实搜索行为。

### 2.3 隔离要求

- 继续使用现有 `E2E_CONFIG_DIR` 与 `E2E_STUDY_LIBRARY_PATH` 临时目录机制。
- 每个测试独立创建临时配置目录与学习库目录，测试结束后清理；失败时保留现场。
- 不得影响开发模式 (`npm run dev`) 与打包版运行。

---

## 3. 组织方案

采用**页面模块式为主 + 少量用户旅程补充 + 风险标签分级**的混合方案。

### 3.1 目录结构

```
e2e/
  fixtures/
    electron.ts              # 现有，可扩展可选 helper
  helpers/
    test-library.ts          # 扩展种子数据工厂
    selectors.ts             # 补齐全部 data-testid
  pages/
    CoverPage.ts             # 扩展
    HomePage.ts              # 扩展
    PreStudyPage.ts          # 扩展真实选择逻辑
    StudyPage.ts             # 扩展错误/归档断言
    ProfilePage.ts           # 新增
    SettingsPage.ts          # 新增
    LibraryPage.ts           # 新增
    SetupWizardPage.ts       # 新增
    ArchiveReportPage.ts     # 新增
  specs/
    smoke.spec.ts            # 现有
    quote-display.spec.ts    # 现有，仅覆盖基础 quote
    new-topic-progress.spec.ts # 现有
    continue-topic.spec.ts   # 现有
    review-topic.spec.ts     # 现有
    cover.spec.ts            # 新增
    home.spec.ts             # 新增
    pre-study.spec.ts        # 新增
    study.spec.ts            # 新增
    library-management.spec.ts # 新增
    profile.spec.ts          # 新增
    settings.spec.ts         # 新增
    onboarding-journey.spec.ts # 新增
    archive-edge.spec.ts     # 新增
```

### 3.2 Page Object 职责

| Page Object | 职责 | 关键方法 |
|-------------|------|----------|
| `SetupWizardPage` | 首次配置向导 4 步 | `completeWizard(apiKey, libraryPath, name)` |
| `SettingsPage` | 设置页 | `navigateTo()`, `updateApiKey()`, `verifyConnection()`, `saveConfig()` |
| `ProfilePage` | 侧写页读写双视图 | `navigateTo()`, `enterEditMode()`, `setName()`, `setProfileText()`, `save()` |
| `LibraryPage` | 学习库管理 | `createGroup()`, `renameGroup()`, `deleteGroup()`, `dragTopicToGroup()`, `expandTopic()`, `deleteSession()`, `openSessionViewer()` |
| `ArchiveReportPage` | 归档报告弹窗 | `assertVisible()`, `getTitle()`, `getBody()`, `close()` |
| `CoverPage` | 扩展 | `enterNameAndSubmit(name)` |
| `HomePage` | 扩展 | `assertUnsavedSessionVisible()`, `continueUnsavedSession()`, `burnUnsavedSession()`, `switchInspirationStrategy()` |
| `PreStudyPage` | 扩展 | `selectMode(mode)`, `selectExistingTopic()`, `selectContinueSuggestion()`, `setDifficulty()`, `setTemperature()` |
| `StudyPage` | 扩展 | `waitForStreamError()`, `retryStream()`, `dismissStreamError()`, `dismissArchive()`, `archiveInProgressReturnHome()` |

---

## 4. 标签与运行策略

### 4.1 标签定义

每个 `test()` 必须带一个优先级标签：

| 标签 | 含义 | 运行场景 |
|------|------|----------|
| `@p0` | 核心冒烟路径 | 每次本地提交前 / CI 快速门控 |
| `@p1` | 重要功能 | PR 合并前 / nightly |
| `@p2` | 边界/慢路径 | 发布前全量 / 按需 |

### 4.2 脚本扩展

```json
{
  "test:e2e": "playwright test --config e2e/playwright.config.ts",
  "test:e2e:smoke": "playwright test --config e2e/playwright.config.ts --grep @p0",
  "test:e2e:core": "playwright test --config e2e/playwright.config.ts --grep '@p0|@p1'",
  "test:e2e:p1": "playwright test --config e2e/playwright.config.ts --grep @p1",
  "test:e2e:p2": "playwright test --config e2e/playwright.config.ts --grep @p2",
  "test:e2e:debug": "playwright test --config e2e/playwright.config.ts --headed --trace on"
}
```

### 4.3 默认运行策略

- CI 快速门控：`npm run test:e2e:smoke`
- PR 合并前：`npm run test:e2e:core`
- 发布前全量：`npm run test:e2e`

### 4.4 超时与并发

- 保持 `fullyParallel: false`、`workers: 1`（Electron 单实例）。
- 全局超时 120s，`@p2` / 归档相关测试内 `test.setTimeout(300000)`。
- 失败重试 `retries: 1`。

---

## 5. Spec 详细设计

### 5.1 `cover.spec.ts`

- `@p0` 首次进入：输入名字 → 写 `state.json` → 进入 `home`
- `@p1` 已有 profile：显示"点亮灯火" → 进入 `home`
- `@p1` 点击"夜航简报" → 进入 `briefing`（仅验证导航，不测简报生成）
- `@p1` 封面 quote 显示与刷新
- `@p1` 背景画作切换按钮存在并可点击

### 5.2 `home.spec.ts`

- `@p0` 问候语与"新的小径"入口可见
- `@p1` 未保存会话提示：预置 unsaved session → 首页显示 → 点击"继续" → 进入 `study`
- `@p1` 未保存会话"焚毁"
- `@p1` "全部"分组筛选
- `@p1` 分组按钮筛选
- `@p1` StrategyToggle v1/v2/v3 切换并持久化
- `@p1` GroupRecCard 显示、刷新、点击进入 `preStudy`
- `@p2` 空库状态显示

### 5.3 `pre-study.spec.ts`

- `@p1` progress / review 模式切换
- `@p1` "已有主题"模式：选择已有主题 + 细分方向输入
- `@p1` 续谈方向建议卡片显示与选择
- `@p1` 难度选择（强/中/弱）
- `@p1` 温度选择（严谨/平衡/发散）
- `@p1` 附加要求输入（最多 200 字）
- `@p1` 外部资料开关 UI（不验证搜索行为）
- `@p2` Escape 关闭模态框
- `@p2` "撤回"按钮关闭模态框

### 5.4 `study.spec.ts`

- `@p0` 发送消息并等待 AI 回复
- `@p1` archive pending banner 出现 → 点击"封存" → 归档成功
- `@p1` 点击"暂不封存" → 继续对话
- `@p1` 空对话点击返回 → 不写 unsaved session
- `@p1` 有对话点击返回 → 写入 unsaved session
- `@p1` Shift+Enter 换行 vs Enter 发送
- `@p2` 流错误 banner → "重递" / "合上"
- `@p2` 归档进行中点击返回按钮（不中断后台归档）
- `@p2` 用户上翻消息时暂停自动滚动

### 5.5 `library-management.spec.ts`

- `@p1` 创建分组
- `@p1` 重命名分组
- `@p1` 删除空分组
- `@p1` 删除含主题分组（确认行为）
- `@p1` 拖拽主题到分组（GravityField）
- `@p1` 展开/折叠主题卡片
- `@p1` 删除 archived session（ConfirmDialog）
- `@p1` SessionViewer 查看报告
- `@p1` 查看寓言文件
- `@p1` 查看图表 SVG
- `@p2` 分页切换（需 seed 10+ 主题）

### 5.6 `profile.spec.ts`

- `@p1` 进入 Profile 页
- `@p1` 进入编辑模式
- `@p1` 修改名字、侧写文本、领域
- `@p1` 修改默认难度与温度
- `@p1` 保存后 `state.json` 持久化
- `@p2` 取消编辑放弃修改

### 5.7 `settings.spec.ts`

- `@p1` 进入 Settings 页
- `@p1` 修改 API Key / Base URL / Model
- `@p1` 点击"验证连接"（真实调用 `setupProbeKey`）
- `@p1` 搜索 API Key 输入与保存（仅 UI，不验证搜索）
- `@p1` 修改库路径输入
- `@p1` "选择目录"按钮触发系统对话框（使用 Playwright 文件选择器处理）
- `@p1` 保存配置写 `.env`
- `@p2` "作废"按钮重置表单

### 5.8 `onboarding-journey.spec.ts`

- `@p1` 完整 4 步 Setup Wizard：欢迎 → AI 配置 → 库路径 → Profile
- `@p1` 向导结束后进入 Cover → 输入名字 → Home
- `@p1` 从 Home 新建主题 → PreStudy → Study → 发送消息 → 触发归档 → 验证文件生成

### 5.9 `archive-edge.spec.ts`

- `@p1` 复习模式归档生成 `复习报告.md`（可合并/扩展 `review-topic.spec.ts`）
- `@p2` 同一主题多次归档触发重名冲突（`-HHMM` 后缀）
- `@p2` 归档失败后的 UI 反馈（如可复现则覆盖，否则作为观察项）

---

## 6. Helpers 扩展

在 `e2e/helpers/test-library.ts` 新增：

```typescript
seedMultiSessionTopic(libPath, slug, title, sessionCount)
seedTopicWithFable(libPath, slug, title)
seedTopicWithDiagram(libPath, slug, title)
seedGroupState(libPath, groups, mappings)
seedStateJson(configDir, partialState)
```

所有 seed 函数只操作临时目录，测试后清理。

---

## 7. Selectors 规范

- 所有新增交互点必须添加 `data-testid`。
- E2E 断言优先使用 `data-testid`，避免依赖文案内容。
- 既有组件缺失 `data-testid` 的，在本次实施中补齐。

---

## 8. 排除项清单

| 功能 | 排除原因 |
|------|----------|
| 夜航简报 | 用户明确要求除外 |
| Writer Quotes（2026-06-21） | 日期边界外 |
| Web Search / 外部资料搜索（2026-06-21） | 日期边界外；Settings 搜索 key 输入 UI 保留但不验证搜索 |
| Wild-card Recommendation（2026-06-21） | 日期边界外 |
| DIY Terminology（2026-06-23） | 仅后端实现，无 UI 入口 |
| Quote Display Refinement（2026-06-25） | 日期边界外；基础 quote 展示仍覆盖 |

---

## 9. 风险与缓解

| 风险 | 缓解措施 |
|------|----------|
| 真实 LLM 调用慢且不稳定 | `@p2` 单独运行；`retries: 1`；单个测试独立超时 |
| 测试间状态污染 | 每个测试新建临时 `config` / `library` 目录 |
| LLM 输出不可预测 | 只断言文件存在、frontmatter 字段、body 非空，不断言具体内容 |
| 页面缺少 `data-testid` | 实施时优先补 selectors，不硬编码文案 |
| 日期边界误判 | 严格按设计文档日期，2026-06-21 当天三个功能一律不纳入 |

---

## 10. 验收标准

- [ ] 新增/扩展 Page Object 覆盖所有 6.20 前页面与模态框
- [ ] 新增 spec 文件覆盖 5.1–5.9 全部场景
- [ ] 每个新 test 带 `@p0` / `@p1` / `@p2` 标签
- [ ] `npm run test:e2e:smoke` 通过
- [ ] `npm run test:e2e:core` 通过
- [ ] `e2e/README.md` 已补充"LLM 调用策略"章节
- [ ] 不影响开发模式与打包版运行
