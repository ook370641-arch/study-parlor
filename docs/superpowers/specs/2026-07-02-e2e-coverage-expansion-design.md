# E2E 覆盖率扩张设计（V2 A 类 + V1.0.2 功能性缺口）

- **日期**: 2026-07-02
- **状态**: 设计稿，待实现计划
- **关联文档**:
  - `docs/6.27 V2 OKR.md`
  - `docs/6.27 V2 OKR Implementation.md`
  - `docs/superpowers/plans/2026-06-27-e2e-full-coverage-plan.md`
  - `docs/superpowers/specs/` 下所有已设计的功能 spec

## 1. 目标与范围

### 1.1 目标

把 Study Parlor 的 Playwright E2E 测试从"核心主链路"扩展到**所有已设计的功能性能力**，使日常 `npm run test:e2e:core` 能稳定守护回归，同时用 `@unstable` 标记依赖外部网络的真实调用用例。

### 1.2 范围边界

- **纳入**：所有 `docs/superpowers/specs/` 中明确描述、且具备可断言行为的特性。
- **不纳入**：
  - 未在 spec 中设计的"预期外"功能（例如多用户切换、消息编辑删除）。
  - 纯视觉/动画时序的细节（例如 600ms crossfade、star particle 轨迹）。这些只做"元素存在"级别的 smoke 断言。
  - 已被 spec 显式 deferred 的交互（`2026-05-11-interaction-deferred.md`）。

## 2. 设计原则

1. **对着 spec 写用例**：每新增一条测试都能在一份 spec 里找到来源。
2. **外部依赖分层**：
   - 日常 `@p1` 用例优先走 mock / seed / 已知确定性数据。
   - 需要真实外部 API（Tavily、Kimi、RSS feeds）的用例标记 `@unstable`，本地/CI 可选跑。
3. **Page Object 优先**：所有 UI 交互封装到 `e2e/pages/`，selector 集中在 `e2e/helpers/selectors.ts`。
4. **Fixture 保持隔离**：每个测试仍然拥有独立的 config dir 和 library path。
5. **标签语义清晰**：
   - `@smoke`：启动/主链路，3-5 分钟跑完。
   - `@p1`：核心功能，每次提交必跑。
   - `@p2`：边界/慢速/错误路径。
   - `@unstable`：依赖真实外部网络。
   - `@slow`：单条用例 > 30s。

## 3. V2 OKR A 类功能补全

### 3.1 A0 夜航简报

来源 spec：
- `2026-06-21-night-briefing-design.md`
- `2026-06-27-briefing-entry-and-loading-design.md`
- `2026-06-27-briefing-ui-upgrade-design.md`

| 场景 | 优先级 | 实现策略 | 标签 |
|---|---|---|---|
| Cover 简报按钮在输入名前禁用、输入后启用 | @p0 | 已有 `cover.spec.ts` 覆盖 | — |
| 从 Cover 进入简报页面 | @p1 | 已有 `cover.spec.ts` | — |
| 缓存命中时直接展示学术布局 | @p1 | 已有 `briefing.spec.ts` | — |
| 缓存命中时切换 academic / newspaper 主题并持久化 | @p1 | 已有 `briefing.spec.ts` | — |
| 缓存生成时间显示 | @p1 | 已有 `briefing.spec.ts` | — |
| 历史抽屉展示过去日期 | @p1 | 已有 `briefing.spec.ts` | — |
| FEED_EMPTY / NETWORK / LLM 错误展示 | @p1 | 已有 `briefing.spec.ts` | — |
| **首次进入无缓存时自动生成简报** | @p1 | seed 空库 + mock `briefing:generate` 返回固定结果 | `@p1` |
| **生成阶段垂直 stepper 展示** | @p1 | 断言 5 个阶段文本依次出现 | `@p1` |
| **缓存文件写入 `夜航简报/夜航简报-YYYY-MM-DD.md`** | @p1 | 文件系统断言 | `@p1` |
| **双语内容渲染** | @p2 | 断言中英文段落均存在 | `@p2` |
| **空 feed 时展示"今日海面平静"** | @p2 | mock feeds 返回空 | `@p2` |
| **feed fetch 失败 → 重试按钮** | @p2 | mock fetch 失败 | `@p2` |

### 3.2 A1 外部资料（Web Search）

来源 spec：`2026-06-21-web-search-design.md`

这是 A 类中缺口最大的一项，当前零覆盖。

**B 方案（先 B 后 C）**：
- 第一批先用真实 Tavily key 把 happy path 跑通。
- 第二批再本地 mock Tavily server 覆盖错误路径。

| 场景 | 优先级 | 实现策略 | 标签 |
|---|---|---|---|
| PreStudy 中"联网资料"toggle 可见并可切换 | @p1 | 断言 checkbox 状态 | `@p1` |
| 未配置 Tavily key 时 toggle 给出 toast | @p1 | custom fixture 不复制 `.env` 中的 `TAVILY_API_KEY` | `@p1` |
| Settings 中可保存 Tavily API Key | @p1 | 填写 input → save → 断言 `.env` 内容 | `@p1` |
| 开启联网资料后，Study 出现 `ExternalMaterialsCard`（mock 路径） | @p1 | `NODE_ENV=test` mock `searchPrepare` | `@p1` |
| 搜索结果摘要进入 system prompt，首条 assistant 消息引用外部资料（mock 路径） | @p1 | 断言消息文本含 mock 来源关键词 | `@p1` |
| 归档后生成 `外部资料.md`（mock 路径） | @p1 | 文件系统断言 | `@p1` |
| 真实 Tavily 搜索 happy path（真实路径） | @p1 | 真实 Tavily + DeepSeek | `@unstable` |
| Review 模式复用历史 `外部资料.md` | @p2 | seed 一个带外部资料的 session | `@p2` |
| 网络失败 → 重试 + toast | @p2 | mock Tavily server 返回 500 | `@p2` |
| Tavily 返回空结果 → 空状态提示 | @p2 | mock Tavily server 返回空结果 | `@p2` |

Fixture 改动：
- 透传 `TAVILY_API_KEY` 到 Electron env（从根目录 `.env` 读取，类似 `KIMI_API_KEY`），供 `@unstable` 用例使用。
- 新增 `E2E_SKIP_TAVILY_PROBE=1`（如果 Tavily 有探活逻辑）以跳过探活。
- 对"未配置 Tavily key"用例，使用 custom fixture 覆盖 `testConfigDir`，复制 `.env` 但删除 `TAVILY_API_KEY` 行。

### 3.3 A2 DIY 术语

来源 spec：`2026-06-22-diy-terminology-design.md`

当前零覆盖。

| 场景 | 优先级 | 实现策略 | 标签 |
|---|---|---|---|
| Extension 页面"我的语言"面板可见 | @p1 | 进入 Extension 页，断言面板 | `@p1` |
| 修改一个 ritual 动词（例如 Cover "点亮灯火"按钮文案）后，UI 实时显示新标签 | @p1 | 修改 input → 断言预览卡和 Cover 按钮同步更新 | `@p1` |
| 修改术语后 `state.json.terminology` 持久化 | @p1 | 文件读取断言 | `@p1` |
| 修改术语后 Home/Study/Profile 中对应文案同步 | @p1 | 修改一个常见按钮标签，回到 Home 断言按钮文本 | `@p1` |
| 单字段重置为默认值 | @p2 | 修改后点击 reset | `@p2` |
| 全部重置为默认值 | @p2 | 点击"恢复默认" | `@p2` |
| 空值时回退到 `DEFAULT_TERMINOLOGY` | @p2 | 手动清空 state.json 字段后启动 | `@p2` |

Page Object 新增：
- `ExtensionPage`
- `TerminologyPanel`

### 3.4 A5 意外之径（Wild Card Recommendation）

来源 spec：`2026-06-21-wild-card-recommendation-design.md`

当前零覆盖。

| 场景 | 优先级 | 实现策略 | 标签 |
|---|---|---|---|
| Home 存在 violet 色的"意外之径"卡片 | @p1 | seed `wildCardInspiration` | `@p1` |
| 卡片展示标题与 hook | @p1 | 断言文本非空 | `@p1` |
| 点击卡片进入 PreStudy 并填充主题 | @p1 | 断言 modal 中 topic input | `@p1` |
| 刷新按钮生成新推荐 | @p1 | 真实 LLM | `@unstable` |
| 推荐结果持久化到 `state.json.wildCardInspiration` | @p1 | 文件读取断言 | `@p1` |
| 推荐池为空/生成失败时展示空状态 | @p2 | mock LLM 失败 | `@p2` |

## 4. V1.0.2 功能性缺口补全

### 4.1 寓言生成与风格对话框

来源 spec：
- `2026-05-31-fable-generation-design.md`
- `2026-05-31-fable-style-dialog-design.md`

当前零覆盖。

| 场景 | 优先级 | 实现策略 | 标签 |
|---|---|---|---|
| 已有报告无寓言时显示"✨ 唤醒寓言"按钮 | @p1 | seed 有报告无寓言的 topic | `@p1` |
| 点击按钮弹出 `FableStyleDialog` | @p1 | 已有 selector | `@p1` |
| 选择风格 tag（科幻/童话/历史/日常/悬疑/散文诗） | @p1 | 多选断言 | `@p1` |
| 添加自定义 tag | @p2 | 输入 + 确认 | `@p2` |
| 填写补充描述 | @p2 | textarea input | `@p2` |
| 点击"开始书写"后进入 generating 状态 | @p1 | 真实 LLM | `@unstable` |
| 生成成功后按钮变为"查看寓言" | @p1 | 文件系统 + UI 断言 | `@unstable` |
| 生成过程中可取消 | @p2 | mock 慢 LLM 或真实 | `@unstable` |
| 生成失败 toast | @p2 | 第二批 mock | `@p2` |
| 取消后 tag 不保存 | @p2 | 断言 state.json | `@p2` |
| 成功后 `lastFableTags` 持久化 | @p2 | 断言 state.json | `@p2` |

### 4.2 学习库分页与拖拽分组

来源 spec：`2026-05-30-study-library-pagination-design.md`

当前零覆盖。

| 场景 | 优先级 | 实现策略 | 标签 |
|---|---|---|---|
| 超过 10 个 topic 时展示分页控件 | @p1 | seed 12 个 topic | `@p1` |
| 点击下一页/上一页切换 topic | @p1 | 断言页面 topic 标题变化 | `@p1` |
| 切换 group filter 后页码重置到 1 | @p2 | 切 filter 后断言 dot active | `@p2` |
| session 列表超出 max-height 时可滚动 | @p2 | 断言滚动容器 | `@p2` |
| 拖拽 topic 到另一 group 后 `.study-groups.json` 更新 | @p2 | seed 多 group + dragAndDrop | `@p2` |
| 多个 accordion 可独立展开 | @p2 | 点击多个展开按钮 | `@p2` |

### 4.3 GroupRecCard 与删除确认

来源 spec：`2026-05-11-recommend-cards-and-delete-confirm-design.md`

| 场景 | 优先级 | 实现策略 | 标签 |
|---|---|---|---|
| GroupRecCard 显示并点击进入 PreStudy | @p1 | 已有 `home.spec.ts` | — |
| **刷新按钮 30s cooldown** | @p2 | 点击刷新后断言 cooldown 文案/禁用 | `@p2` |
| **删除 group → 确认对话框 → topic 移到 default group** | @p2 | seed group + topic，点击删除，断言 `.study-groups.json` | `@p2` |
| **删除 archived session → 确认对话框 → `s{N}` 文件夹被删除** | @p2 | seed 多 session topic，删除 s2，断言文件系统 | `@p2` |

### 4.4 继续学习推荐

来源 spec：
- `2026-06-03-continue-topic-suggestions-design.md`
- `2026-06-05-continue-topic-recommendations-unification.md`

| 场景 | 优先级 | 实现策略 | 标签 |
|---|---|---|---|
| 继续已有主题时展示 2-3 张推荐卡片 | @p1 | seed 有 history 的 topic | `@p1` |
| 卡片含 🔍 ➡ 🎯 标签 | @p2 | 断言图标/文本结构 | `@p2` |
| 可填写"附加要求"并进入 Study | @p2 | 输入后断言 study header 含附加要求 | `@p2` |
| 归档后缓存重新生成 | @p2 | 真实 LLM | `@unstable` |
| session count 不匹配时缓存失效并重新生成 | @p2 | seed 过期 cache | `@p2` |
| 新主题/复习模式无推荐 | @p2 | 断言空状态 | `@p2` |
| 推荐失败/加载 skeleton | @p2 | mock 或真实失败 | `@p2` |

### 4.5 学习图表自动生成与补生成

来源 spec：`2026-06-03-learning-report-diagram-design.md`

| 场景 | 优先级 | 实现策略 | 标签 |
|---|---|---|---|
| progress 归档后自动生成 `.mmd` | @p1 | 真实 LLM + 文件系统断言 | `@unstable` |
| SessionViewer 可查看图表 | @p1 | 已有 `library-management.spec.ts` | — |
| 已有报告无图表时显示"补生成"按钮 | @p1 | seed 无 diagram topic | `@p1` |
| 点击"补生成"后生成 `.mmd` 并更新 SessionMeta | @p1 | 真实 LLM | `@unstable` |

### 4.6 Extension 页面内容

来源 spec：`2026-06-05-extension-page-design.md`

| 场景 | 优先级 | 实现策略 | 标签 |
|---|---|---|---|
| 三个卡片（library directory / local agent / custom pictures）可见 | @p1 | 断言卡片标题/内容 | `@p1` |
| 图书馆目录路径显示正确 | @p1 | 断言路径文本 | `@p1` |
| local agent skill 说明可复制 | @p2 | 断言 copy 按钮 | `@p2` |

### 4.7 分组引导按钮

来源 spec：`2026-06-05-group-guide-button-design.md`

| 场景 | 优先级 | 实现策略 | 标签 |
|---|---|---|---|
| GroupRibbon 上"i"按钮可见 | @p1 | 断言按钮 | `@p1` |
| 点击后弹出三步骤说明面板 | @p1 | 断言面板内容 | `@p1` |
| 点击外部关闭面板 | @p2 | 点击 body 断言消失 | `@p2` |
| Escape 关闭面板 | @p2 | keyboard press | `@p2` |

## 5. 现有覆盖加深（非新增 spec 文件）

### 5.1 Study 归档流程

来源 spec：`2026-05-10-session-archive-redesign-design.md`

- 归档时展示"正在凝结记忆…" loading overlay。
- 归档报告 modal 展示标题、正文、类型 badge。
- `原始对话.md` 完整保存历史消息。

### 5.2 v2 文件结构

来源 spec：`2026-05-09-study-parlor-v2-redesign-design.md`

- `new-topic-progress.spec.ts` 归档后断言存在 `原始对话.md`。
- Home library accordion 展开/折叠。
- 自动寓言：等寓言生成 spec 完成后可联动断言。

### 5.3 Report Frontmatter 显示

来源 spec：`2026-05-27-report-frontmatter-display-design.md`

- SessionViewer 中 ReportHeader 展示类型 badge、tags、summary。
- 旧文件（无 `type`）的 backward compatibility。

### 5.4 Markdown Renderer

来源 spec：`2026-05-27-md-renderer-design.md`

- 对话时间线格式渲染。
- 代码块 syntax highlighting（至少断言高亮后的 DOM class 存在）。
- GFM table 渲染。

### 5.5 Settings 页面

来源 spec：`2026-06-14-settings-design.md`

- API Key 显隐切换。
- 取消按钮恢复初始值。
- 保存后 toast"配置已保存，重启后生效"。

## 6. 视觉/动画类 Smoke 策略

以下功能只做最低限度的存在性断言，不测时序和样式细节：

- **艺术背景**：断言 Cover/Home/Study 存在背景图片元素或 `SurfaceBackground` 容器。
- **交互动画**：断言 modal/dialog 打开后目标元素可见，不测 star particle。
- **Loading screen**：断言启动时出现 progress 条/阶段文本，不测 ink bloom 动画帧。

## 7. 技术方案

### 7.1 Fixture 扩展

文件：`e2e/fixtures/electron.ts`

1. 透传 `TAVILY_API_KEY`（从根目录 `.env` 读取）到 Electron env，供 A1 外部资料测试使用。
2. 保留 `E2E_SKIP_PROBE=1` 给模型探活；新增 `E2E_SKIP_TAVILY_PROBE=1`（如 Tavily 也有探活）。
3. `testConfigDir` 默认仍复制 `.env`；A1 缺失 key 的用例通过 fixture 覆盖或独立 custom fixture 实现。

### 7.2 Seed Helpers 扩展

文件：`e2e/helpers/test-library.ts`

新增：
- `seedTopicWithExternalMaterials(libPath, slug, title, materialsContent)`：创建带 `外部资料.md` 的 session。
- `seedTopicWithoutFable(libPath, slug, title)`：有报告无寓言。
- `seedTopicWithoutDiagram(libPath, slug, title)`：有报告无图表。
- `seedBriefingEmptyFeeds(libPath)`：辅助空 feed 测试。
- `seedWildCardInspiration(configDir, payload)`：写入 `state.json.wildCardInspiration`。
- `seedTerminology(configDir, terminology)`：写入 `state.json.terminology`。
- `seedContinueSuggestions(configDir, topic, suggestions, staleCount?)`：写入过期/未过期推荐缓存。

### 7.3 Page Objects 扩展

新增：
- `e2e/pages/BriefingPage.ts`：生成流程、主题切换、历史抽屉、错误展示。
- `e2e/pages/ExtensionPage.ts`：Extension 页面入口 + "我的语言"面板。
- `e2e/pages/TerminologyPanel.ts`：术语编辑、重置、预览。
- `e2e/pages/LibraryPage.ts`（扩展）：分页、拖拽、分组删除、session 删除。
- `e2e/pages/FableStyleDialog.ts`（已有 selectors，补封装）。
- `e2e/pages/ConfirmDialog.ts`（已有 selectors，补封装）。

### 7.4 外部依赖策略

#### Kimi API
- 已有 `NODE_ENV=test` 时 `llm:finalizeProgress` 和 `llm:generateFable` 返回 mock。
- 需要新增：
  - `llm:generateContinueSuggestions`
  - `llm:generateGroupInspiration`
  - `llm:wildCardInspiration`
  - `briefing:generate`
  - `searchPrepare`
  的 `NODE_ENV=test`  mock 分支，让 `@p1` 用例不依赖真实网络。

#### Tavily API
- 第一批：用真实 `TAVILY_API_KEY` 跑 `@unstable` happy path。
- 第二批：在 `electron/ipc/tavily.ts` 中支持可配置的 base URL（env `TAVILY_BASE_URL`），E2E 启动本地 HTTP server 作为 mock server，覆盖错误路径。

#### RSS Feeds（简报）
- `NODE_ENV=test` 时，`briefing:generate` 使用本地固定 feed fixture，避免外网依赖。

### 7.5 标签策略与命令

保留现有 scripts：
- `npm run test:e2e:smoke`
- `npm run test:e2e:core`（`@p0|@p1`）
- `npm run test:e2e:p2`

新增/调整：
- `@unstable`：默认不被任何 `npm run` 命令包含，需显式 `npx playwright test --grep @unstable`。
- 推荐在 CI 中分 job：
  - `core`：跑 `@smoke|@p1`（快速）。
  - `boundary`：跑 `@p2`（中速）。
  - `unstable`： nightly / 手动触发。

## 8. 新增 Spec 文件清单

| Spec 文件 | 覆盖功能 | 优先级 |
|---|---|---|
| `e2e/specs/briefing-generation.spec.ts` | A0 自动生成、loading stepper、缓存写入、空 feed、错误 | @p1/@p2 |
| `e2e/specs/external-materials.spec.ts` | A1 toggle、key 配置、搜索执行、卡片、文件生成、review 复用 | @p1/@p2/@unstable |
| `e2e/specs/terminology.spec.ts` | A2 术语编辑、实时预览、持久化、重置 | @p1/@p2 |
| `e2e/specs/wild-card.spec.ts` | A5 意外之径卡片、刷新、持久化、空状态 | @p1/@p2/@unstable |
| `e2e/specs/fable-generation.spec.ts` | 寓言生成、风格对话框、取消、失败 | @p1/@p2/@unstable |
| `e2e/specs/library-pagination.spec.ts` | 分页、页码重置、session 滚动、accordion | @p1/@p2 |
| `e2e/specs/library-drag-and-delete.spec.ts` | 拖拽分组、group 删除、session 删除 | @p2 |
| `e2e/specs/continue-suggestions.spec.ts` | 继续推荐卡片、附加要求、缓存失效 | @p1/@p2/@unstable |
| `e2e/specs/diagram-generation.spec.ts` | 图表自动生成、补生成 | @p1/@unstable |
| `e2e/specs/extension-page.spec.ts` | Extension 内容、术语面板入口 | @p1 |
| `e2e/specs/group-guide.spec.ts` | 分组引导按钮 popover | @p1/@p2 |

扩展现有 spec：
- `archive-edge.spec.ts` → 增加原始对话归档断言。
- `new-topic-progress.spec.ts` → 增加 report modal 内容、frontmatter、图表生成断言。
- `settings.spec.ts` → API Key 显隐、取消重置、toast。
- `library-management.spec.ts` → 分页入口（可拆分）。

## 9. 验收标准

- [ ] 新增 spec 全部能通过 `npm run test:e2e`（不含 `@unstable`）。
- [ ] `@unstable` 用例在提供 `TAVILY_API_KEY` 和真实 Kimi key 时也能通过。
- [ ] 所有新增测试的断言都能在对应 spec 中找到来源。
- [ ] `test:e2e:core` 总时长控制在 10 分钟以内（通过 mock 化外部 LLM）。
- [ ] 不存在因视觉/动画时序导致的 flaky 用例。
- [ ] 每个新 page object 都有对应 spec 使用。

## 10. 风险与降级

| 风险 | 影响 | 降级方案 |
|---|---|---|
| Tavily key 不可用 | A1 真实调用用例无法跑 | 第一批只测"未配置 key"路径；第二批 mock server 优先实现 |
| 外部 LLM 调用慢/不稳定 | `@unstable` 用例 flaky | 用 `test.setTimeout(300000)` + 单次重试；核心用例 mock 化 |
| 拖拽分组在 Electron CDP 下不稳定 | library 测试 flaky | 先用文件系统断言验证结果，不强求拖拽动画 |
| 新增用例过多导致 core 超时 | CI 失败 | 把 `@p2` 和 `@unstable` 拆出独立 job |

## 11. 实现顺序

按外部依赖从少到多、风险从低到高安排：

- **Phase 1**：A2 术语、A5 意外之径、Extension/Group Guide（不依赖外部 API，最快落地）。
- **Phase 2**：A0 简报 mock 化、A1 外部资料基础路径、寓言生成。
- **Phase 3**：学习库分页/拖拽、继续推荐、图表生成。
- **Phase 4**：A1 mock server、边界错误路径、视觉 smoke。

## 12. 调试与迭代流程

### 12.1 核心原则

- **V2 A 类：测试即验收标准**。每个 phase 的结束条件是"该 phase 负责的 A 类功能 E2E 全部通过 + 功能实现停止"。
- **V1.0.2：补测试为主**。优先把测试写对、跑通；遇到 bug 时谨慎修复，只做最小必要改动，不借机会重构未涉及代码。
- **拒绝单步改一行-测十分钟**：采用"批量分析 → 批量修改 → 批量验证"的流水线，用子 agent 并行减少等待时间。

### 12.2 V2 A 类迭代流水线（每个 phase 内循环）

每个 phase 内部按以下步骤执行，直到该 phase 的 E2E 全部通过：

```
1. 写/改 E2E 代码（spec + page object + selector + seed/fixture）
   ↓
2. 跑一次该 phase 涉及的 spec（不是全量 suite）
   ↓
3. 汇总失败列表，按失败模式分类：
   - selector/testid 缺失或变更
   - seed/fixture 数据不对
   - 应用功能未实现或实现与 spec 不符
   - mock 分支未命中导致走了真实网络
   - 时序/超时
   ↓
4. 派多个子 agent 并行处理不同类别：
   - selector/testid 类：直接改代码
   - seed/fixture 类：调整测试数据
   - 功能实现类：先定位源码，再做最小修复
   - mock/时序类：调整 fixture 或应用侧 mock
   ↓
5. 合并子 agent 改动后，再次跑该 phase 的 spec
   ↓
6. 重复 3-5，直到该 phase 0 失败
```

### 12.3 为什么不用"改一行测十分钟"

Electron E2E 单次启动成本高（数秒到十几秒）。如果每改一行都跑一次完整用例，大量时间花在进程启动上。流水线把同类失败攒在一起，由子 agent 批量处理，一次性验证，减少启动次数。

### 12.4 子 agent 使用规则

- **并行维度**：按失败模式或按 spec 文件拆分，不要让多个 agent 同时改同一个文件。
- **工作树隔离**：需要并行的代码改动时，使用 `worktree` 隔离，避免冲突。
- **输出要求**：每个子 agent 返回"改了什么、为什么、涉及哪些文件"，不返回完整文件内容。
- **验证边界**：子 agent 只负责让分配给自己的用例/类别通过；合并后由主流程做 phase 级回归。

### 12.5 V1.0.2 的处理方式

- 写测试时如果发现功能行为与 spec 不符，先记录：是测试写错了，还是应用有 bug。
- 确认是应用 bug 后，评估影响范围。只修该 bug 本身，不修相邻代码风格、不重构未涉及模块。
- 修复后补一条对应的 E2E 断言，确保回归。

### 12.6 停止条件

| 阶段 | 停止条件 |
|---|---|
| 单个子 agent 任务 | 分配的用例/失败类别通过 |
| Phase 内部循环 | 该 phase 所有 E2E spec 通过 |
| Phase 验收 | E2E 通过 + 功能实现冻结 |
| 整个项目 | 所有新增/扩展 spec（不含 `@unstable`）通过 `npm run test:e2e` |

### 12.7 例外处理

- 如果某个 A 类功能在实现过程中发现 spec 本身有问题（不可实现、有矛盾），暂停该 phase，回到设计文档修订，不硬写测试。
- 如果 `@unstable` 用例因外部服务问题失败，不影响 phase 验收；记录到"外部依赖清单"中，待 key/网络恢复后补跑。
