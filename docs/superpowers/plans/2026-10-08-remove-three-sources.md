# 删除求职/前沿/拾贝三来源 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 彻底删除夜航简报的求职/前沿/拾贝三个来源（代码、测试、E2E、学习库数据、state.json 字段），写作与博客保留。

**Architecture:** 按 spec（`docs/superpowers/specs/2026-10-08-remove-three-sources-design.md`）执行：先删学习库数据，再拆五个共享点引线，然后按「消费者→类型→实现」顺序删代码保证每步 tsc 绿，最后清测试/E2E/描述层。单分支 5 个 commit。

**Tech Stack:** Electron 30 + React 18 + TypeScript + Zustand；electron-vite；Vitest；Playwright E2E。

## Global Constraints

- **优先级铁律（用户终审定调）**：不影响当前使用 > 无残留。两者冲突时，先保功能；孤儿死代码必须 grep 确认零引用后才删，宁留勿错删。
- **验证只跑受影响测试**（.claude/rules/general.md §9）：日常任务用 `npx vitest run tests/<file>.test.ts` 和 `node scripts/e2e-changed.js --run`；全量只在 Task 12 门禁。
- **E2E 跑 out/ 产物**：改源码后先 `npx electron-vite build`；`e2e-changed.js --run` 会自动构建。
- `npm run build` = `tsc --noEmit`（双 tsconfig）+ vite build，类型错即失败。中间验证用 `npx tsc --noEmit && npx tsc --noEmit -p tsconfig.node.json`。
- **Tavily/search 链零改动**：`electron/lib/search.ts`、`electron/ipc/search.ts`、`electron/lib/credentials.ts`、Settings Tavily 卡片、`assistantSearchEnabled` 字段。
- **保留勿删**：`BriefingFontSize`、`BriefingTheme` 类型；`BriefingListColumn.tsx`、`TransferToWritingButton.tsx`（sourceType 收窄后保留）、PaintingPlate/CandlelightLayer/BriefingThemeToggle、`src/lib/article-chunks.ts`、`src/components/article-assistant/ArticleBodyChunks.tsx`（删精选集订阅后保留）、`electron/lib/{sibling-files,recovery,net-fetch,run-queue,kimi}.ts`；`blog-guide-v2.md`；turndown/gray-matter/mammoth/pdfjs/exceljs 依赖。（`spine-seals.ts`/`InternalizationSpine.tsx` 疑似孤儿，处置见 Task 7 Step 2，不在此列。）
- 分支：`chore/remove-three-sources`（从 main 新建）。
- 学习库路径：`C:\Users\86468\Desktop\学习库`；state.json 在 `C:\Users\86468\.studyparlor\state.json`（不手工编辑，由代码加载时剥离旧字段，见 Task 6）。
- **行号免责（终审 H4）**：计划中所有行号来自 2026-10-08 盘点，main 上的画作裁剪提交（0affb74 等）已使 store/index.ts 漂移约 +20 行。**一切删除按符号名定位，行号只作参考**。
- **终审修订的两处 spec 细化**：①`briefingSource` 字段不删除，收窄为 `'writing' | 'anthropic'`（默认 `'writing'`，旧值 `'digest'` 等非法值回退 `'writing'`）——保留"记住上次来源"行为；②state.ts 加载时剥离三来源旧字段（复用 readStateJson 的 delete 模式），满足"仿佛从未存在"。

---

### Task 1: 删除学习库三来源数据目录（Phase 0）

**Files:**
- Delete: `C:\Users\86468\Desktop\学习库\求职简报\`（6 个 md + .config.json）
- Delete: `C:\Users\86468\Desktop\学习库\夜航简报\`（15 个 md + 精选集.json + .bak）
- Delete: `C:\Users\86468\Desktop\学习库\拾贝\`（对话/20260802-2156-d67f.json）

**Interfaces:**
- Consumes: 无
- Produces: 学习库仅剩写作/博客/学习会话相关目录；Phase 2 的代码删除不再有数据兜底顾虑

- [ ] **Step 1: 删除前快照确认（只读）**

```bash
cd "C:/Users/86468/Desktop/学习库" && ls && echo "---" && find 求职简报 夜航简报 拾贝 -type f | wc -l
```
Expected: 根目录含 `求职简报 夜航简报 拾贝` 等；文件数约 24

- [ ] **Step 2: 删除三个目录**

```bash
cd "C:/Users/86468/Desktop/学习库" && rm -rf 求职简报 夜航简报 拾贝
```

- [ ] **Step 3: 验证学习库 diff 恰好是三个目录**

```bash
cd "C:/Users/86468/Desktop/学习库" && ls
```
Expected: 只剩 `.profile.json .study-groups.json Anthropic博客 repository writing 苏格拉底对话`；**无其他文件被动过**

- [ ] **Step 4: 冒烟确认旧代码对缺失目录有降级**

```bash
cd "C:/Users/86468/Desktop/project/study-parlor" && npm run dev
```
Expected: 应用正常启动；写作/博客来源可读；前沿/求职/拾贝显示空态而非崩溃。确认后关闭 dev。
（此步可选但强烈建议；若并行会话占用端口则跳过，Phase 2 后统一验证）

- [ ] **Step 5: 无 commit**（学习库不在 git 内；在执行记录中注明完成时间）

---

### Task 2: 抽离 generateArticleSearchQuery 到中立模块（Phase 1.1）

**Files:**
- Create: `electron/lib/article-search-query.ts`
- Move: `electron/prompts/job-briefing/generate-search-query.md` → `electron/prompts/generate-search-query.md`
- Modify: `electron/ipc/article-assistant.ts:16`（import）与 `:628`（调用点不变，仅 import 路径变）
- Test: `npx vitest run tests/article-assistant-guide-ipc.test.ts tests/article-assistant`

**Interfaces:**
- Consumes: `chatNonStream`（`electron/lib/kimi.ts`）、`AppConfig`（`electron/env.ts`）、`Message`（`@shared/index`）
- Produces: `generateArticleSearchQuery(cfg: AppConfig, args: { articleContent: string; selection?: string; lastMessage?: string }): Promise<string>` — Task 6 删除 `job-briefing.ts` 后 article-assistant 依赖此模块存活

- [ ] **Step 1: 移动 prompt 文件**

```bash
cd "C:/Users/86468/Desktop/project/study-parlor" && git mv electron/prompts/job-briefing/generate-search-query.md electron/prompts/generate-search-query.md
```

- [ ] **Step 2: 创建中立模块**（PROMPTS_DIR 解析模式照抄 `electron/lib/llm-tasks.ts:12-29`）

```typescript
// electron/lib/article-search-query.ts
import fs from 'node:fs'
import path from 'node:path'
import { chatNonStream } from './kimi'
import type { AppConfig } from '../env'
import type { Message } from '@shared/index'

const PROMPTS_DIR = (() => {
  const candidates = [
    path.resolve(__dirname, '..', 'prompts'),
    path.resolve(__dirname, '..', '..', 'electron', 'prompts'),
  ]
  for (const c of candidates) {
    if (fs.existsSync(c)) return c
  }
  throw new Error(`prompts directory not found. Tried: ${candidates.join(', ')}`)
})()

// 文章旁注助手的搜索增强：从文章内容+选区+用户问题生成搜索词
export async function generateArticleSearchQuery(
  cfg: AppConfig,
  args: { articleContent: string; selection?: string; lastMessage?: string }
): Promise<string> {
  const prompt = fs.readFileSync(path.join(PROMPTS_DIR, 'generate-search-query.md'), 'utf8')
    .replace('{{articleContent}}', args.articleContent.slice(0, 3000))
    .replace('{{selection}}', args.selection ?? '')
    .replace('{{lastMessage}}', args.lastMessage ?? '')
  const text = await chatNonStream(cfg, {
    messages: [{ role: 'user', content: prompt } as Message],
    temperature: 0.3,
    thinking: { type: 'enabled' },
  })
  return text.trim()
}
```

- [ ] **Step 3: 改 article-assistant.ts 的 import**

`electron/ipc/article-assistant.ts:16` 由
```typescript
import { generateArticleSearchQuery } from '../lib/job-briefing'
```
改为
```typescript
import { generateArticleSearchQuery } from '../lib/article-search-query'
```
调用点（L628）不动。

- [ ] **Step 4: 类型与构建验证**

```bash
npx tsc --noEmit && npx tsc --noEmit -p tsconfig.node.json && npx electron-vite build
```
Expected: 全部通过

- [ ] **Step 5: 定向测试**

```bash
npx vitest run tests/article-assistant-guide-ipc.test.ts
```
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add electron/lib/article-search-query.ts electron/prompts/generate-search-query.md electron/prompts/job-briefing/generate-search-query.md electron/ipc/article-assistant.ts
git commit -m "refactor: 抽离 generateArticleSearchQuery 至中立模块（求职删除前置）"
```

---

### Task 3: 共享点预处理 — article-io / writing-assistant / companion-picker（Phase 1.2-1.4）

**Files:**
- Modify: `electron/lib/article-io.ts:5`
- Modify: `electron/lib/writing-assistant/prompt.ts:119-141`（删 Digest 段）
- Modify: `src/lib/companion-picker.ts`（收窄为仅 anthropic）
- Modify: `src/components/BriefingSourceSidebar.tsx`（handleNavClick 传参收窄，约 L99-120）
- Test: `tests/article-io.test.ts`（删拾贝用例）、`tests/companion-picker.test.ts`（重写）

**Interfaces:**
- Consumes: 现有 ALLOWED_DIRS / buildWritingSystemPrompt / companionPickerTarget
- Produces: `CompanionPickerKey = 'anthropic'`；`CompanionPickerState` 仅剩 `{ briefingSource, articlePanelMode, articleAssistantGuideCollapsed, anthropicReaderFilePath }`；`companionPickerTarget(s): 'anthropic' | null`

- [ ] **Step 1: article-io.ts 删拾贝**

`electron/lib/article-io.ts:5` 由
```typescript
const ALLOWED_DIRS = ['Anthropic博客', '拾贝']
```
改为
```typescript
const ALLOWED_DIRS = ['Anthropic博客']
```

- [ ] **Step 2: writing-assistant/prompt.ts 删 Digest 段**

删除 `electron/lib/writing-assistant/prompt.ts` 第 119-141 行整段（`// ── 5. Digest (夜航简报/) ──` 注释行起到 `} catch { /* skip */ }` 止）。保留上方 Blog 段（L97-117）。已确认该文件无 scout/job 段。

- [ ] **Step 3: companion-picker.ts 收窄**（整文件替换为）

```typescript
// 博客对照挑选器资格判断：当前状态下，点来源栏「写作」是否应打开写作树挑选器
// （而非整页跳转到写作界面）。放 lib 而非组件文件——组件文件只导出组件（ui-styling §10）。

export type CompanionPickerKey = 'anthropic'

// 窄结构参数：调用方（sidebar）从 store 取这几个字段组装，测试可直接造字面量。
export interface CompanionPickerState {
  briefingSource: string
  articlePanelMode: Record<CompanionPickerKey, 'guide' | 'companion'>
  articleAssistantGuideCollapsed: boolean
  anthropicReaderFilePath: string | null
}

// 全部满足才可挑选：当前 source 是博客栏目 + 右栏处于对照 tab
// + 右栏展开 + 主区有在读文章（对照需要主文作锚）。
export function companionPickerTarget(s: CompanionPickerState): CompanionPickerKey | null {
  if (s.articleAssistantGuideCollapsed) return null
  if (s.briefingSource === 'anthropic') {
    return s.articlePanelMode.anthropic === 'companion' && s.anthropicReaderFilePath ? 'anthropic' : null
  }
  return null
}
```

- [ ] **Step 4: BriefingSourceSidebar.tsx handleNavClick 收窄**

读 `src/components/BriefingSourceSidebar.tsx:99-120`，从组装 `CompanionPickerState` 的代码中删去 `scoutTab`、`scoutReaderFilePath`、`jobResultFilePath` 三个字段的传递，以及对 store 中对应字段的读取。组件其余部分不动（navItems 五项保留到 Task 6）。

- [ ] **Step 5: 重写 companion-picker 测试**

`tests/companion-picker.test.ts` 删除全部 scout/job 场景用例，只留 anthropic 命中/未命中（面板收起返回 null、非对照 tab 返回 null、无在读文章返回 null、满足条件返回 'anthropic'）。`tests/article-io.test.ts` 删除 `'拾贝'` 路径相关用例。

- [ ] **Step 6: 验证**

```bash
npx tsc --noEmit && npx electron-vite build
npx vitest run tests/companion-picker.test.ts tests/article-io.test.ts
```
Expected: tsc/build 通过；两个测试文件 PASS

- [ ] **Step 7: Commit**

```bash
git add electron/lib/article-io.ts electron/lib/writing-assistant/prompt.ts src/lib/companion-picker.ts src/components/BriefingSourceSidebar.tsx tests/companion-picker.test.ts tests/article-io.test.ts
git commit -m "chore: 预处理共享点（article-io 收窄/writing-assistant 索引/companion-picker 仅留博客）"
```

---

### Task 4: 删除渲染层消费者 — 组件与页面（Phase 2a）

**Files:**
- Delete: `src/components/scout/`（ScoutPanel/ScoutListColumn/ScoutChatView/ScoutConversationList/ScoutCandidateCards 全目录）
- Delete: `src/components/job-briefing/`（JobBriefingRenderer/JobProfilePanel/JobAssistantPanel/index.ts 全目录）
- Delete: `src/components/briefing/` 下 `AcademicBriefingLayout.tsx`、`NewspaperBriefingLayout.tsx`、`BriefingSourceCard.tsx`、`BriefingSourceItem.tsx`、`BriefingEmptyState.tsx`、`BriefingConstellation.tsx`、`CollectionView.tsx`、`BriefingMetaLine.tsx`（终审 B-10：仅被两个被删 Layout 与 Briefing.tsx digest 分支使用，含 index.ts:3 的 re-export）
- Delete: `src/components/BriefingDateColumn.tsx`、`BriefingProgress.tsx`、`BriefingError.tsx`、`BriefingSkeleton.tsx`
- Delete: `src/lib/scout-runtime.ts`、`src/lib/job-briefing-defaults.ts`、`src/lib/parse-briefing-markdown.ts`、`src/lib/collection-attribution.ts`、`src/lib/briefing-source-order.ts`、`src/lib/parse-source-link.ts`（终审 B-11：仅被 BriefingSourceCard 使用）
- Modify: `src/components/briefing/index.ts`（移除已删组件的 re-export）
- Modify: `src/pages/Briefing.tsx`（删三来源分支，L13-20 import、L64-198、L225-331、L374-636，剩写作+博客）
- Modify: `src/components/BriefingSourceSidebar.tsx`（navItems 删 digest/job-briefing/scout 三项与 DigestIcon/JobBriefingIcon/ScoutIcon；删求职星蓝高亮；**删拖拽排序：移除对 `briefingSourceOrder`/`setBriefingSourceOrder` 的消费（约 L91-92）与拖拽逻辑（约 L202-245），改为直接渲染 navItems 数组**——终审 H5，两来源下排序无意义且 Task 5 会删该 store 字段）
- Modify: `src/components/article-assistant/ArticleBodyChunks.tsx`（终审 B-12：**删除顶层对 `s.collection.entries`/`s.collectChunk` 的订阅与"收入精选集"按钮渲染**——collectible 仅由被删的 AcademicBriefingLayout 传入；组件本体保留，博客的 chunk 功能不动）
- Modify: `src/components/briefing/TransferToWritingButton.tsx`（组件保留；prop `sourceType` 联合收窄删 `'digest'`，仅留 `'anthropic'`——终审 B 模糊点）
- Modify: `src/components/md/ReportHeader.tsx`（TYPE_LABELS/BADGE_STYLES 删 briefing/web-article/job-briefing）
- Modify: `src/components/md/fileType.ts`（删 job-briefing 映射与"求职简报"文件名兜底）
- Modify: `src/pages/Settings.tsx`（删"求职简报"配置卡片 L253-296 与 jobConfig 状态）
- Modify: `src/App.tsx`（删 initScoutRuntime import 与调用，L11、L60）
- Modify: `src/lib/guide-progress.ts`（删 'briefing'/'web-article' 分支 L17-22）
- Modify: `src/components/article-assistant/ArticleGuideTabs.tsx`、`ArticleAssistantPanel.tsx`（删 briefing/web-article 分支）
- Modify: `src/components/anthropic/AnthropicArticleReader.tsx`（删 web-article 适配分支，组件本体保留）

**Interfaces:**
- Consumes: Task 3 收窄后的 companion-picker
- Produces: 渲染层不再 import 任何 scout/job/digest 模块；store 与 types 中的相关字段暂时仍在（Task 5/6 删）

- [ ] **Step 1: 删整目录与整文件**

```bash
cd "C:/Users/86468/Desktop/project/study-parlor"
git rm -r src/components/scout src/components/job-briefing
git rm src/components/briefing/AcademicBriefingLayout.tsx src/components/briefing/NewspaperBriefingLayout.tsx src/components/briefing/BriefingSourceCard.tsx src/components/briefing/BriefingSourceItem.tsx src/components/briefing/BriefingEmptyState.tsx src/components/briefing/BriefingConstellation.tsx src/components/briefing/CollectionView.tsx src/components/briefing/BriefingMetaLine.tsx
git rm src/components/BriefingDateColumn.tsx src/components/BriefingProgress.tsx src/components/BriefingError.tsx src/components/BriefingSkeleton.tsx
git rm src/lib/scout-runtime.ts src/lib/job-briefing-defaults.ts src/lib/parse-briefing-markdown.ts src/lib/collection-attribution.ts src/lib/briefing-source-order.ts src/lib/parse-source-link.ts
```

- [ ] **Step 2: 改 Briefing.tsx**

删除三来源的所有 import 与渲染分支，页面只剩 `writing` 与 `anthropic` 两个 source 的渲染路径。页面框架（Header/侧栏/背景/Drawer）不动。改完文件应明显变短（641 行 → 约 300 行内）。

- [ ] **Step 3: 改其余 Modify 文件**

按上方 Files 清单逐个删分支。注意 `src/components/briefing/index.ts` 只移除已删组件的 export，保留仍被引用的。

- [ ] **Step 4: 验证（此时 store/types 仍有三来源代码，属预期）**

```bash
npx tsc --noEmit && npx electron-vite build
```
Expected: 通过。若有残留 import 报错，按报错位置补删，不要新增代码。

- [ ] **Step 5: 不 commit**（Phase 2 在 Task 7 末统一 commit）

---

### Task 5: store/index.ts 手术（Phase 2b）

**Files:**
- Modify: `src/store/index.ts`（约 3000+ 行 → 预计删 ~700 行；**行号已因画作裁剪提交漂移 +20，全部按符号定位**——终审 H4）
- Test: `npx vitest run tests/store.test.ts tests/store-article-assistant.test.ts tests/store-generation-pulse.test.ts`

**Interfaces:**
- Consumes: Task 4 后的组件层（不再调用 scout/job/digest actions，sidebar 不再消费 briefingSourceOrder）
- Produces: store 不再暴露 scout*/job*/digest 生成相关 state 与 actions；**保留收窄后的 `briefingSource: 'writing' | 'anthropic'`（默认 `'writing'`）**；`briefingSourceOrder` 字段与 setter 删除

- [ ] **Step 0: 符号定位（先做，替代一切行号）**

```bash
grep -n "scoutTab\|scoutConversations\|deleteScoutArticle\|generateJobBriefing\|generateBriefing\|markBriefingRead\|briefingSourceOrder\|onBriefingProgress\|JOB_" src/store/index.ts | head -40
```
以此输出为手术地图。已知锚点（终审 H4 实测）：scout actions 实际在 ~L1678-1762（含 deleteScoutArticle 尾巴），**注意 L1650-1676 是保留的博客推荐 actions（openRecommendView/closeRecommendView/removeBlogBatch/toggleBlogRead/startBlogRecommend），严禁误删**；onBriefingProgress 实际在 ~L977/L1145；JOB_* 映射 ~L1185-1191；markBriefingRead 在 ~L1479。

- [ ] **Step 1: 删 scout 域**

删 scout 相关 state 声明（scoutTab/scoutConversations/scoutActiveConversationId 等）、初始值、全部 scout actions（含 deleteScoutArticle）。

- [ ] **Step 2: 删 job 域**

删 job 相关声明、初始值、全部 job actions（generateJobBriefing/viewJobBriefingToday/loadJobBriefingHistory/deleteJobBriefings/cancelJobBriefing/setJobBriefingConfig/updateJobProfile/discoverJobBriefingPages/generateJobBriefingKeywords + jobBriefingViewRequestId）。

- [ ] **Step 3: 删 digest 域**

删 generateBriefing/loadBriefingHistory/markBriefingRead、briefingRead 清理逻辑、夜航简报文件名正则、精选集 actions（collection 域全部）、briefingGeneration/briefingPulseAt、onBriefingProgress 双订阅、JOB_* 错误码映射。

- [ ] **Step 4: briefingSource 收窄（修订决策，不删除）**

默认值 `'digest'` → `'writing'`；init 白名单校验改为 `['writing','anthropic']`，旧值（如 `'digest'`）回退 `'writing'`。**保留该字段的读写**（来源切换持久化行为不变）。

- [ ] **Step 5: 删 briefingSourceOrder 与 state.json 旧字段读取**

删 `briefingSourceOrder` 声明/初始值/`setBriefingSourceOrder` action（store ~L154/163/646/734/1474-1476）。删 init 时对 `scoutTab`/`scoutActiveConversationId`/`briefingRead`/`jobBriefingConfig`/`jobProfile` 的读取与对应 setters 写入点。articlePanelMode 默认值只留 anthropic 键。

- [ ] **Step 6: 收窄 transfer 分支**

store 中 TransferToWriting 相关的 `'digest'` → parent_type `'briefing'` 分支删除（~L265/L1289 附近，按符号 `parent_type: 'briefing'` 定位），保留 anthropic 分支。

- [ ] **Step 7: 验证**

```bash
npx tsc --noEmit && npx electron-vite build
npx vitest run tests/store.test.ts tests/store-article-assistant.test.ts tests/store-generation-pulse.test.ts
```
Expected: src/ 无类型错误（tests/ 的三来源报错此时可存在，Task 8 处理）；build 通过；store 测试中不含三来源断言的部分 PASS。

---

### Task 6: 类型、preload、facade、主进程删除（Phase 2c/2d）+ Phase 2 统一 commit

**Files:**
- Modify: `src/types/index.ts`（删接口清单见下）
- Modify: `electron/preload.ts`（删 L108-121、L230-243、L176-181 与 L2 类型 import；**另删 collection* 段 L155-160（collectionRead…collectionUpdateQA）**——终审 H2）
- Modify: `src/lib/ipc.ts`（删 L75-86、L149-159；**另删 collection getter 段 L108-113**——终审 H2）
- Modify: `electron/ipc/index.ts`（删四个注册与 config getter）
- Modify: `electron/ipc/state.ts`（**完整手术清单——终审 M2**：删 L7-8 两个 import（normalizeJobBriefingConfig/normalizeJobProfile）、DEFAULT 三来源字段、readStateJson 的 normalize 调用 L96-97、LIBRARY_KEYS 两键 L75-76、withLibraryData 叠加 L115/L121-122、patchState 的 saveJobData 块 L236-241、loadJobData/saveJobData 调用；**另加：readStateJson 加载时剥离三来源旧字段**（复用 L208-210 的 delete 模式，剥离清单：`briefingSourceOrder`/`scoutTab`/`scoutActiveConversationId`/`briefingRead`/`jobBriefingConfig`/`jobProfile` 及 `articlePanelMode` 的 scout/job 嵌套键、`briefingRead` 的 digest/job-briefing 嵌套键——满足"仿佛从未存在"））
- Modify: `electron/lib/library-data.ts`（删 jobDataPathFor/loadJobData/saveJobData/isNonDefaultJobData 与 MIGRATED_KEYS 两键，保留 profile/anthropicBlogCache/anthropicBlogLastSeenAt）
- Modify: `electron/lib/frontmatter.ts`（删三条 EXT_FIELDS、文件名推断、parent_type 联合值、job_sources）
- Modify: `electron/lib/guide-v2-pipeline.ts`（删 runDigestGuideV2 L155，保留 runBlogGuideV2）
- Modify: `electron/lib/writing-assistant/tools.ts`（**删 resolveSourcePath 的 case 'digest'（~L23-24）与 case 'job'（~L41-44）**——终审 B-13，WritingSourceType 收窄后必删）
- Modify: `electron/ipc/article-assistant.ts`（删 digest/web-article 分支 L109-111、L262、L367-412、L460、L510、L539、L710、L751；保留博客 v2）
- Delete: `electron/ipc/briefing.ts`、`electron/ipc/job-briefing.ts`、`electron/ipc/scout.ts`、`electron/ipc/collection.ts`
- Delete: `electron/lib/job-briefing.ts`、`electron/lib/job-error-codes.ts`、`electron/lib/collection-store.ts`、`electron/lib/feed-status.ts`
- Delete: `electron/lib/scout/`（整目录 7 文件）
- Delete: `electron/prompts/briefing/`、`electron/prompts/job-briefing/`（整目录）；`electron/prompts/digest-guide.md`、`digest-guide-v2.md`
- Test: `npx vitest run tests/frontmatter.test.ts tests/state-library.test.ts tests/library-data.test.ts tests/guide-progress.test.ts`

**Interfaces:**
- Consumes: Task 2 的 `electron/lib/article-search-query.ts`（article-assistant 已不依赖 job-briefing.ts）
- Produces: `BriefingSourceId = 'writing' | 'anthropic'`；IpcApi 无 briefing*/jobBriefing*/scout*/collection* 成员；StateJson 无三来源字段

- [ ] **Step 1: types/index.ts 删除**

删：`BriefingSourceType`、`BriefingSourceItem`、`BriefingSource`、`BriefingResult`、`BriefingSourceStatus`、`BriefingStage`、`BriefingProgressSource`、`JobCompany`、`JobBriefingConfig`、`JobErrorCode`、`JobProfile`、`JobEventType`、`JobEvent`、`MatchedJob`、`JobBriefingSourceStatus`、`JobBriefingStage`、`JobBriefingResult`、Scout 系列（`ScoutErrorCode`/`ScoutCandidate`/`ScoutMessage`/`ScoutConversationMeta`/`ScoutConversation`/`ScoutArticleMeta`/`ScoutToolEvent`，L986-1033）、BriefingCollection 系列（L235-261）。
收窄：`DocType`（L264）删 `'briefing' | 'web-article' | 'job-briefing'`；`Frontmatter.parent_type`（L297）与 `job_sources`（L303）删；`BriefingSourceId`（L619）收窄为 `'writing' | 'anthropic'`；`WritingSourceType`（L585）删 `'digest' | 'job' | 'web'` 值（先 grep 写作侧引用确认无使用后删）；StateJson 删 `briefingSourceOrder`/`jobBriefingConfig`/`jobProfile`/`scoutTab`/`scoutActiveConversationId`/`briefingRead`/`articlePanelMode` 的 scout/job 键（**`briefingSource` 保留收窄，见 Global Constraints**）；IpcApi 删 briefing*/jobBriefing*/scout*/collection* 与 onBriefingProgress/onScoutTool。
**保留**：`BriefingFontSize`、`BriefingTheme`、`assistantSearchEnabled`。

- [ ] **Step 2: preload.ts 与 src/lib/ipc.ts 删除**

按 Files 清单行号删。onBriefingProgress 的双域订阅逻辑（digest 与 job 可同时订阅同一频道的注释块）整体删除。

- [ ] **Step 3: 主进程接线删除**

`electron/ipc/index.ts`、`electron/ipc/state.ts`、`electron/lib/library-data.ts`、`electron/lib/frontmatter.ts`、`electron/lib/guide-v2-pipeline.ts`、`electron/ipc/article-assistant.ts` 按清单删。

- [ ] **Step 4: 删主进程整文件**

```bash
git rm electron/ipc/briefing.ts electron/ipc/job-briefing.ts electron/ipc/scout.ts electron/ipc/collection.ts
git rm electron/lib/job-briefing.ts electron/lib/job-error-codes.ts electron/lib/collection-store.ts electron/lib/feed-status.ts
git rm -r electron/lib/scout electron/prompts/briefing electron/prompts/job-briefing
git rm electron/prompts/digest-guide.md electron/prompts/digest-guide-v2.md
```

- [ ] **Step 5: 全量类型与构建验证（此步必须全绿）**

```bash
npx tsc --noEmit && npx tsc --noEmit -p tsconfig.node.json && npx electron-vite build
```
Expected: src/ 与 electron/ 全部通过（tests/ 的三来源报错此时可存在，Task 8 清理；若主 tsconfig 包含 tests 导致 build 阻塞，则先执行 Task 8 的测试删除再回到本步）。

- [ ] **Step 6: 定向测试**

```bash
npx vitest run tests/frontmatter.test.ts tests/state-library.test.ts tests/library-data.test.ts
```
Expected: PASS（若因三来源断言失败，记录后转 Task 8 处理再回来确认）

- [ ] **Step 7: Commit（Phase 2 统一提交）**

```bash
git add -A
git commit -m "feat!: 删除求职/前沿/拾贝三来源（主进程+渲染层+类型+state字段）"
```

---

### Task 7: 主进程删除收尾核对（Phase 2 复查门）

**Files:** 无新增改动，纯核对。

- [ ] **Step 1: 残留引用扫描（全仓，含英文标识词）**

```bash
cd "C:/Users/86468/Desktop/project/study-parlor"
grep -rn --include="*.ts" --include="*.tsx" --include="*.js" --include="*.cjs" --include="*.json" --include="*.md" \
  -e "job-briefing" -e "jobBriefing" -e "JobBriefing" -e "JobProfile" -e "scout" -e "Scout" -e "web-article" \
  -e "feed-status" -e "精选集" -e "collection-store" -e "拾贝" -e "求职" -e "夜航简报-" \
  src/ electron/ tests/ e2e/ scripts/ .dsh/ .claude/ AGENTS.md package.json electron-builder.yml 2>/dev/null | head -60
```
Expected: 仅剩合法残留（页面名"夜航简报"、docs/ 历史文档、用户 coverNotepad、changelog、博客精选集 BlogCollectionSection 等保留功能）。每条残留要么删除要么确认合法。

- [ ] **Step 2: 孤儿死代码核查（优先级铁律：先确认零引用再删）**

对下列疑似孤儿逐个 `grep -rn "<文件名去扩展>" src/ electron/ tests/ e2e/`，确认零引用后删除，有引用则保留并在执行记录注明：
`src/hooks/use-generation-transition.ts`（+对应 test）、`use-reading-finished.ts`（+test）、`src/lib/format-briefing-date.ts`、`src/components/briefing/InternalizationSpine.tsx` + `src/lib/spine-seals.ts`（+2 test）——终审 A 实测 spine-seals 唯一消费链是被删的 AcademicBriefingLayout，**但 article-chunks.ts / ArticleBodyChunks.tsx 被博客阅读器使用，保留**。
`electron/lib/guide-v2.ts` 的 digest 专用导出与注释（L149）顺手清。

- [ ] **Step 3: 启动冒烟**

```bash
npm run dev
```
Expected: 正常启动；夜航简报页只剩写作/博客两个来源；写作助手、旁注助手、搜索设置正常；state.json 旧字段存在时不报错。确认后关闭。

---

### Task 8: 单测清理（Phase 3a）

**Files:**
- Delete（tests/）：`briefing.test.ts`、`briefing-prompts.test.ts`、`briefing-layout.test.tsx`、`briefing-page.test.tsx`、`briefing-empty-state.test.tsx`、`briefing-date-column.test.tsx`、`briefing-constellation.test.tsx`、`briefing-transition.test.tsx`、`briefing-progress.test.tsx`、`briefing-error.test.tsx`、`briefing-source-card.test.tsx`、`briefing-meta-line.test.tsx`、`briefing-parser.test.ts`、`briefing-source-order.test.ts`、`store-briefing-read.test.ts`、`collection-store.test.ts`、`collection-slice.test.ts`、`collection-view.test.tsx`、`collection-attribution.test.ts`、`collection-ipc-wiring.test.ts`、`chunk-collect-button.test.tsx`、`feed-status.test.ts`、`job-error-codes.test.ts`、`job-briefing.test.ts`、`job-briefing-real.test.ts`、`job-briefing-queries.test.ts`、`job-briefing-defaults.test.ts`、`job-briefing-layout.test.tsx`、`fixtures/job-briefing-real-empty.md`、`fixtures/job-briefing-real-filled.md`、scout 系列 11 个（`scout-contracts.test.ts`、`scout-loop`、`scout-ipc`、`scout-tools`、`scout-article-store`、`scout-store`、`scout-tool-protocol`、`scout-conversation-store`、`scout-panel`、`scout-entry`、`scout-fetcher`）、`web-article-reader.test.tsx`
- Rewrite: `tests/briefing-sidebar.test.tsx`（只测 writing/anthropic 两项导航）
- Modify（删三来源断言）：`tests/store.test.ts`、`state-library.test.ts`、`library-data.test.ts`、`frontmatter.test.ts`、`guide-v2-real.test.ts`、`article-assistant-guide-ipc.test.ts`、`store-article-assistant.test.ts`、`store-generation-pulse.test.ts`、`guide-progress.test.ts`、`anthropic-blog-panel.test.tsx`、`GuideSidebar.test.tsx`、`transfer-to-writing.test.ts`、`tests/setup.ts`（注释）
- Modify（**tests/article-assistant/ 整目录——终审 H1**）：`prompt.test.ts`（删 L11-66、L141+ 对 digest-guide.md/digest-guide-v2.md 的 fs 读取断言，保留 blog 部分）、`guide-v2.test.ts`（保留 digest 形状负例——验证博客管线拒绝 digest 形状，合法）、`guide-v2-pipeline.test.ts`（删 runDigestGuideV2 的 describe 段 L13/L39-86，保留 runBlogGuideV2 段）、`file-io.test.ts` 与 `ChatWindow` 相关（清 briefing/web-article 引用）

**Interfaces:**
- Consumes: Task 6 后的类型与实现
- Produces: `npx tsc --noEmit`（含 tests）全绿

- [ ] **Step 1: 删整文件**

```bash
cd "C:/Users/86468/Desktop/project/study-parlor/tests"
git rm briefing.test.ts briefing-prompts.test.ts briefing-layout.test.tsx briefing-page.test.tsx briefing-empty-state.test.tsx briefing-date-column.test.tsx briefing-constellation.test.tsx briefing-transition.test.tsx briefing-progress.test.tsx briefing-error.test.tsx briefing-source-card.test.tsx briefing-meta-line.test.tsx briefing-parser.test.ts briefing-source-order.test.ts store-briefing-read.test.ts collection-store.test.ts collection-slice.test.ts collection-view.test.tsx collection-attribution.test.ts collection-ipc-wiring.test.ts chunk-collect-button.test.tsx feed-status.test.ts job-error-codes.test.ts job-briefing.test.ts job-briefing-real.test.ts job-briefing-queries.test.ts job-briefing-defaults.test.ts job-briefing-layout.test.tsx web-article-reader.test.tsx
git rm fixtures/job-briefing-real-empty.md fixtures/job-briefing-real-filled.md
git rm scout-*.test.ts scout-*.test.tsx
```
（scout 文件名以 `ls tests/scout-*` 实际为准）

- [ ] **Step 2: 改写 briefing-sidebar.test.tsx**

只保留：渲染 writing/anthropic 两项、点击切换、折叠展开。删 digest/job/scout 相关断言。

- [ ] **Step 3: 修共享测试**

对 Modify 清单逐个文件：运行 → 按失败信息删三来源断言/mock → 重跑。命令模式：

```bash
npx vitest run tests/<file>.test.ts
```

- [ ] **Step 4: 全项目 tsc 绿确认**

```bash
npx tsc --noEmit && npx tsc --noEmit -p tsconfig.node.json
```
Expected: 含 tests 全绿

- [ ] **Step 5: Commit**

```bash
git add -A tests/
git commit -m "test: 删除三来源单测并清理共享测试断言"
```

---

### Task 9: E2E 清理（Phase 3b）

**Files:**
- Delete（e2e/）：briefing 系列 14 个（`briefing.spec.ts`、`briefing-aesthetics`、`briefing-annotations-persistence`、`briefing-assistant-session-persistence`、`briefing-background-generation`、`briefing-collection`、`briefing-delete-cleanup`、`briefing-generation`、`briefing-lifecycle`、`briefing-real-api`、`briefing-real-generation`、`briefing-source-cards`、`briefing-source-switching`、`briefing-ux-optimization`）、job 系列 3 个（`job-briefing-error`、`job-briefing-generation`、`job-briefing-profile-panel`）、scout 系列 6 个（`scout-article-delete`、`scout-candidate-select`、`scout-conversation-crud`、`scout-persistence`、`scout-real-api`、`scout-source`）
- Rewrite 评估：`briefing-rail-layout.spec.ts`、`briefing-source-order.spec.ts`、`generation-ceremony.spec.ts`（涉及侧栏/生成动画等保留 UI——逐个读，能改写为两来源则改写并保留，彻底绑定三来源才删）
- Modify: `e2e/helpers/selectors.ts`（**逐项删，严禁按段删——终审 H3**：digest/job/scout 专属选择器（receiveDigestButton/dateColumn/dateItem/job*/scout 各块）才删；保留 `page`/`themeToggle`/`listColumn`/`listColumnToggle`/`sourceAnthropicButton`/`anthropicNewArticlesPrompt`/`anthropicArticleRow`/`anthropicListRailThumb` 及全部 writing*/anthropic* 选择器——它们被 ~15 个保留 spec 使用）、`e2e/helpers/test-library.ts`（删 seed 中三来源夹具）、`e2e/pages/ArticleAssistantPage.ts`、`e2e/README.md`
- Modify（**保留 spec 中的三来源用例——终审 B-C**）：`e2e/specs/article-assistant.spec.ts`（删 seed digest 缓存 + receive-digest 打开文章用例，L19-57）、`article-assistant-guide.spec.ts`（删 digest seed 与默认 briefingSource='digest'，L34-50）、`article-annotations.spec.ts`（删 'E2E-A4: digest 简报划线标注' 用例，L243）、`writing-navigation.spec.ts`（删 "Switch to digest and back" 步骤，L37）、`writing-catalog.spec.ts`（改"默认来源是 digest"前置为 writing，L28）、`lighting.spec.ts`（删 'job briefing: flame uses star-blue color' 用例，L83-89）、`writing-list-column.spec.ts`（清注释，L50）、`anthropic-blog-reading-position.spec.ts`（清 seed 中 articlePanelMode 的 scout/job 键，L113）
- Modify: `e2e/source-map.json`（删 "job-briefing"、"scout" 两个 group；"briefing-core" 收窄为写作/博客相关源文件；"article-side-panel" 保留）

**Interfaces:**
- Consumes: Task 6 后的应用行为
- Produces: source-map.json 无孤儿 spec WARNING；`e2e-changed` 匹配正常

- [ ] **Step 1: 删 spec**

```bash
cd "C:/Users/86468/Desktop/project/study-parlor/e2e"
git rm briefing.spec.ts briefing-*.spec.ts job-briefing-*.spec.ts scout-*.spec.ts
```
随后恢复三个待评估文件：`git checkout -- briefing-rail-layout.spec.ts briefing-source-order.spec.ts generation-ceremony.spec.ts`（若上条命令误删），逐个评估改写。

- [ ] **Step 2: 改 helpers 与 source-map.json**

按 Files 清单删改。source-map.json 改完运行 `node scripts/e2e-changed.js`（仅列出模式）确认无孤儿 WARNING。

- [ ] **Step 3: 定向 E2E 验证**

```bash
node scripts/e2e-changed.js --run --no-retries
```
Expected: 受影响的保留功能 spec（写作/博客/旁注面板相关）PASS

- [ ] **Step 4: Commit**

```bash
git add -A e2e/
git commit -m "test(e2e): 删除三来源 spec，收窄 source-map 与 helpers"
```

---

### Task 10: 描述层同步与脚本清理（Phase 4）

**Files:**
- Modify: `AGENTS.md`（简报来源描述改为写作/博客两来源；删求职/拾贝段落）
- Modify: `.claude/rules/` 与 `.dsh/skills/` 中提及三来源的现行规则条目（改写成两来源现状；changelog 不动。**特别注意——终审 B-E**：`.dsh/skills/ui-styling/SKILL.md:112,114` 求职星蓝例外主色条款、`.dsh/skills/e2e/SKILL.md:22` 与 `.claude/rules/e2e.md:23` 以 job-briefing-real.test.ts 为示例的条目，这些**无中文词**，必须用英文标识词定位）
- Delete: `scripts/test-scout-fetch.js`、`scripts/test-briefing-chain.js`、`scripts/test-baseline-pipeline.js`、`scripts/test-full-experiment.js`、`scripts/test-quality-experiment.js`、`scripts/test-factor-experiment.js`、`scripts/test-llm-batch.js`、`scripts/test-llm-debug.js`、`scripts/test-search-granularity.js`、`scripts/experiment-final-report.md`、`scripts/experiment-final-summary.md`、`scripts/experiment-results.json`、`scripts/quality-experiment-results.json`、`可靠信息源.md`

**Interfaces:**
- Consumes: 无
- Produces: 文档与代码现状一致

- [ ] **Step 1: 改 AGENTS.md、rules、.dsh/skills**

AGENTS.md 写作功能段落保留；「夜航简报的第四来源」等描述改为现状。用**中英文混合**标识词定位（只搜中文会漏——终审 B-E26）：

```bash
grep -rn -e "拾贝" -e "求职" -e "前沿" -e "job-briefing" -e "scout" -e "digest" -e "星蓝" .claude/rules/ .dsh/ AGENTS.md
```
逐处改写为两来源现状；changelog 与历史记录不动。`.claude/settings.local.json` 中过期 allowlist（briefing-generation.spec、test-synth-variants.js）顺手清。

- [ ] **Step 2: 删脚本**

```bash
git rm scripts/test-scout-fetch.js scripts/test-briefing-chain.js scripts/test-baseline-pipeline.js scripts/test-full-experiment.js scripts/test-quality-experiment.js scripts/test-factor-experiment.js scripts/test-llm-batch.js scripts/test-llm-debug.js scripts/test-search-granularity.js scripts/experiment-final-report.md scripts/experiment-final-summary.md scripts/experiment-results.json scripts/quality-experiment-results.json 可靠信息源.md
```

- [ ] **Step 3: 确认无依赖变动**

```bash
grep -n "turndown\|gray-matter\|mammoth\|pdfjs\|exceljs" package.json
```
Expected: 仍在（被保留功能使用），package.json 与 electron-builder.yml 零改动

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "docs: 同步 AGENTS.md 与 rules 现行描述，清理一次性实验脚本"
```

---

### Task 11: 全量门禁（合并前）

**Files:** 无改动，纯验证。

- [ ] **Step 1: 全量单测**

```bash
npx vitest run
```
Expected: 全绿

- [ ] **Step 2: 全量 E2E**

```bash
npm run test:e2e
```
Expected: 全绿（含 startup-health 回归）

- [ ] **Step 3: 打包冒烟（可选但建议）**

```bash
npm run package
```
Expected: release/ 产出安装包；主进程无三来源模块缺失报错

- [ ] **Step 4: 汇报结果，由用户决定合并 main**

---

## 终审修订记录（2026-10-08，双子代理对抗审查后）

**安全性终审结论**：架构与执行顺序正确，大部分声明经实地核实成立（Task 2 抽离正确、打包路径可达、保留勿删符号均被真实使用、删除目标引用者均在清单内）；5 处高危已修入计划：H1 测试清单补全（Task 8）、H2 collection facade 段（Task 6）、H3 selectors 改逐项删（Task 9）、H4 store 改符号定位（Task 5 Step 0）、H5 sidebar 拖拽排序显式删除（Task 4）。

**完整性终审结论**：26 处漏删已补入：tests 9 个文件（Task 8）、代码 4 处（Task 4 BriefingMetaLine/parse-source-link/ArticleBodyChunks，Task 6 writing-assistant/tools.ts）、e2e 8 处用例（Task 9）、scripts 3 个实验残留（Task 10）、.dsh/rules 英文标识词盲区（Task 10 混合 grep）。state.json 与学习库确认无遗漏。

**对 spec 的两处细化**（已获用户优先级授权：不影响使用 > 无残留）：briefingSource 字段保留收窄；state.json 加载时剥离旧字段。
