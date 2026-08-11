# 学习库目录整理设计

日期：2026-08-11
状态：已与用户确认（选项 A：六来源留在库根、仅移动苏格拉底主题）

## 背景与目标

学习库根目录（`STUDY_LIBRARY_PATH`）当前混杂了两类内容：

1. **苏格拉底对话主题文件夹**（40+ 个，如 `Agent/`、`Git/`、`MCP/`，每个含 `s1/`、`s2/`… 会话子目录）
2. **六个非主题来源目录**：`writing/`、`repository/`、`夜航简报/`、`求职简报/`、`拾贝/`、`Anthropic博客/`

目标：把全部苏格拉底主题移入新建的 `苏格拉底对话/` 子目录；六个来源目录**保持在库根**（不移动、不改名）。`.study-groups.json` 保留在库根。

```
学习库/
├── 苏格拉底对话/            ← 新建，当前 40+ 个根主题文件夹全量移入
│   ├── Agent/
│   ├── Git/
│   └── ... （所有 s1/s2/... 主题目录）
├── writing/               ← 保留原位
├── repository/            ← 保留原位
├── 夜航简报/              ← 保留原位
├── 求职简报/              ← 保留原位
├── 拾贝/                  ← 保留原位
├── Anthropic博客/          ← 保留原位
└── .study-groups.json     ← 保留原位
```

**红线**：绝不丢失学习库的任何文件资料；仅做目录整理 + 代码路径同步。

## 成功标准

- 应用功能交互完全不变（用户可见行为无差异）
- 移动后文件数与移动前一致，无孤儿文件
- 全量测试（定向 + 关键 E2E）通过
- 代码改动量小、review 重点放在路径拼接的完整性

## 代码改动面

核心原则：**主进程统一在拼主题路径时加 `苏格拉底对话` 前缀；前端逻辑 id（`dirName`、`WritingRoot`、来源 id）一律不改。**

### 1. 主题扫描 `electron/ipc/files.ts` `files:scan`

现状：读库根直接子目录当主题，排除六个来源目录（L287 的排除清单）。

改为：读 `path.join(lib, '苏格拉底对话')` 的直接子目录当主题。排除清单逻辑相应简化/移除——但注意 `tests/scout-contracts.test.ts` 用正则断言排除清单含 `'拾贝'`，需要同步改该测试（见 §7）。

### 2. `getTopicMeta` 的 `.study-groups.json` 路径（关键坑）

`getTopicMeta`（files.ts L166）现在用 `path.join(path.dirname(topicDir), '.study-groups.json')` 定位分组文件——这只在主题位于库根时成立。主题移入 `苏格拉底对话/` 后 `dirname(topicDir)` 变成 `苏格拉底对话/`，分组文件会找不到，所有主题回落 `default` 组。

**方案**：`getTopicMeta(topicDir, libraryPath?)` 增加可选参数，group 文件改为 `path.join(libraryPath ?? path.dirname(topicDir), '.study-groups.json')`。`files:scan` 调用处传 `cfg.libraryPath`；`tests/files-scan.test.ts` 现有单参调用不受影响（`path.dirname(topicDir)` 即 tmp 根，且测试未断言 `groupId`）。与 `groups:*` IPC 的 L588-618 保持一致（恒用库根）。

### 3. 主进程所有主题路径拼接（加前缀）

以下文件中的 `path.join(lib/cfg.libraryPath, dirName, ...)` 主题读写，统一改为 `path.join(..., '苏格拉底对话', dirName, ...)`：

- `electron/ipc/files.ts`：`files:scan`（新扫描目标）、`updateContinueSuggestions`、`readAnchor`、`readExternalMaterials`、`writeProgress`、`writeReview`、`writeTranscript`、`writeFable`、`writeExternalMaterials`、`deleteArchivedSession`
- `electron/ipc/llm.ts`：`llm:generateDiagram` 的 sessionDir
- `electron/lib/llm-tasks.ts`：`readTopicReportSummaries`、`readReportFrontmatter`（以及任何其他以 `dirName` 拼主题目录的函数）

建议：抽一个小 helper（如 `topicDir(lib, dirName) => path.join(lib, '苏格拉底对话', dirName)`），集中放 `electron/lib/library-layout.ts`，避免散落硬编码。

### 4. 写作助手（study 来源）

- `electron/lib/writing-assistant/prompt.ts`：构建写作索引时「study 主题」扫描目标从库根改为 `苏格拉底对话/`；`SKIP_DIRS` 相应调整（六个来源已不在扫描范围内，可移除或保留无害）
- `electron/lib/writing-assistant/tools.ts`：`resolveSourcePath` 的 `case 'study'` 分支拼 `苏格拉底对话/` 前缀

### 5. 六个来源目录代码 —— 不改

`WRITING_ROOTS`（writing/repository）、`briefing.ts` 的 `夜航简报/`、`collection-store.ts` 精选集、`job-briefing.ts` 的 `求职简报/`、`scout/article-store.ts` 的 `拾贝/`、`anthropic-scraper.ts` 的 `Anthropic博客/`、`report-sync.ts` 的 `constitution-report`——**全部保持原位路径**。

前端 `WritingRoot = 'writing' | 'repository'`、`briefingSource` id、`childrenPathsOf` 逻辑根名——**不改**。

### 6. 两个 Skill（写库者）

- `~/.claude/skills/study/SKILL.md`：所有 `学习库/{主题名}/s{n}` 路径 → `学习库/苏格拉底对话/{主题名}/s{n}`；扫描命令 `ls "学习库"` 相应改为扫描 `苏格拉底对话/`
- `.claude/skills/fable/SKILL.md`：`YOUR_LIBRARY_PATH/{概念名}/s{编号}/寓言.md` → `YOUR_LIBRARY_PATH/苏格拉底对话/{概念名}/s{编号}/寓言.md`

### 7. 测试与 E2E

**E2E seed 杠杆点**（改一处覆盖大量 spec）：`e2e/helpers/test-library.ts` 中所有 seed 主题的辅助函数（`seedNewTopic`、`seedReviewableTopic`、`seedMultiSessionTopic`、`seedTopicWithFable`、`seedTopicWithDiagram`、`seedTopicWithoutFable`、`seedTopicWithoutDiagram`）→ 目标路径加 `苏格拉底对话` 前缀。六个来源的 seed（`seedBriefing`/`seedJobBriefing`/`seedAnthropicArticle`/`seedWritingTree`/`seedRepository`/`seedCatalogJson`/`seedGroupState`）**不改**。

**需单独改的 spec**（直接 `readdirSync(testLibraryPath)` 或硬编码主题路径）：
- `e2e/specs/archive-edge.spec.ts`（L47-56 读库根当主题）
- `e2e/specs/new-topic-progress.spec.ts`（L52-63 读库根）
- `e2e/specs/review-topic.spec.ts`（L15-16、L57 硬编码 `testLibraryPath/typescript-decorators/s2`）
- `e2e/specs/briefing-aesthetics.spec.ts`（L34-38 递归搜索——需确认过滤逻辑是否仍正确）
- 其余经 seed 的 spec 自动覆盖

**单测**：
- `tests/files-scan.test.ts`：本地 `scanLibrary` 副本（L26-55）+ `describe('scanLibrary')`（L308-398）同步改为扫 `苏格拉底对话/`
- `tests/scout-contracts.test.ts`：排除清单正则断言改为匹配新扫描逻辑（断言「拾贝 不被打为主题」的语义保留，但正则按新代码形态更新）
- `tests/writing-tree.test.ts` 等断言 `lib/writing`、`lib/repository` 在库根的测试——**不改**（来源保持原位）

## 文件移动方案（红线保护）

1. 移动前：`find 学习库 -maxdepth 1` 快照全部主题目录清单 + 文件总数，写入临时清单
2. 移动：对每个主题目录执行 `fs.rename(lib/topic, lib/苏格拉底对话/topic)`（同盘原子操作，Windows 下用 `fs.renameSync`；先 `mkdir 苏格拉底对话`）
3. 六个来源目录、`.study-groups.json`、`writing/`、`repository/` 内部 `.catalog.json`——不触碰
4. 移动后校验：`苏格拉底对话/` 下主题数 == 移动前清单数；全库文件总数一致；无遗漏无残留
5. 校验通过后才提交代码改动

## 验证

- 定向单测：`npx vitest run tests/files-scan.test.ts tests/scout-contracts.test.ts tests/writing-tree.test.ts tests/briefing.test.ts`
- E2E：`node scripts/e2e-changed.js --run --no-retries`（source-map 覆盖的受影响 spec）
- 手动：`npm run dev` 确认 Home 库列表、写作树、简报、拾贝、求职简报、Anthropic博客 各入口正常
- skill：`/study` 与 `/fable` 触发一次确认历史同步与存档路径正确

## 范围外（本迭代不做）

- `~/.studyparlor/` 的 state.json / debug / recovery / sessions —— 保持原位，不做目录整理（已在审计中确认其存在与内容）
- 六个来源目录的改名或收父目录
- `.study-groups.json` 的迁移
