# 学习库目录整理实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把学习库根目录下全部苏格拉底主题文件夹移入新建的 `苏格拉底对话/` 子目录；六个来源目录（writing/repository/夜航简报/求职简报/拾贝/Anthropic博客）与 `.study-groups.json` 保持原位；同步全部代码、测试、E2E、Skill 路径，功能交互不变。

**Architecture:** 引入一个共享布局常量模块 `electron/lib/library-layout.ts` 暴露 `SOCRATIC_ROOT = '苏格拉底对话'` 与 `topicDir(lib, dirName)` helper。所有主进程主题路径拼接改用它；`files:scan` 改为扫描 `苏格拉底对话/` 直接子目录；`getTopicMeta` 增加可选 `libraryPath` 参数解决 `.study-groups.json` 定位。前端逻辑 id（`dirName`/`WritingRoot`/来源 id）一律不改。最后用同盘原子 `mv` 移动真实学习库文件并校验。

**Tech Stack:** Electron (node:fs / node:path)、Vitest、Playwright E2E、bash（移动文件）

## Global Constraints

- **红线**：绝不丢失学习库任何文件资料；仅目录整理 + 代码路径同步
- **成功标准**：应用功能交互完全不变；移动后文件数与移动前一致；代码改动量小
- 六个来源目录与 `.study-groups.json` 路径**不修改**（保持原位）
- 前端逻辑 id 不改：`WritingRoot = 'writing' | 'repository'`、`briefingSource` id、`childrenPathsOf` 的 `'writing'/'repository'` 根名
- 验证只跑受影响测试（`.claude/rules/general.md` §9），禁止全量
- E2E 跑 `out/` 产物：改源码后先 `npx electron-vite build` 或 `node scripts/e2e-changed.js --run`（自动构建）

---

### Task 1: 共享布局常量与 helper

**Files:**
- Create: `electron/lib/library-layout.ts`
- Test: `tests/library-layout.test.ts`

**Interfaces:**
- Produces: `SOCRATIC_ROOT: string`（值 `'苏格拉底对话'`）、`topicDir(lib: string, dirName: string): string`（返回 `path.join(lib, SOCRATIC_ROOT, dirName)`）。后续任务全部依赖这两个导出。

- [ ] **Step 1: 写失败测试**

```ts
// tests/library-layout.test.ts
import { describe, expect, it } from 'vitest'
import path from 'node:path'
import { SOCRATIC_ROOT, topicDir } from '@electron/lib/library-layout'

describe('library-layout', () => {
  it('SOCRATIC_ROOT is 苏格拉底对话', () => {
    expect(SOCRATIC_ROOT).toBe('苏格拉底对话')
  })

  it('topicDir joins lib, SOCRATIC_ROOT and dirName', () => {
    expect(topicDir('/tmp/lib', 'Agent')).toBe(path.join('/tmp/lib', '苏格拉底对话', 'Agent'))
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/library-layout.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现**

```ts
// electron/lib/library-layout.ts
import path from 'node:path'

/** 苏格拉底对话主题的根目录名（相对学习库根）。 */
export const SOCRATIC_ROOT = '苏格拉底对话'

/** 拼出某主题目录的绝对路径。 */
export function topicDir(lib: string, dirName: string): string {
  return path.join(lib, SOCRATIC_ROOT, dirName)
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run tests/library-layout.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add electron/lib/library-layout.ts tests/library-layout.test.ts
git commit -m "feat(library): 共享苏格拉底根目录常量 topicDir helper"
```

---

### Task 2: files.ts 主题扫描与读写路径 + getTopicMeta 分组定位

**Files:**
- Modify: `electron/ipc/files.ts:166`（getTopicMeta groupFile）、`electron/ipc/files.ts:276-292`（files:scan）、`electron/ipc/files.ts:225,250,358,387,403,430,495,514,532,560,632`（主题路径）
- Test: `tests/files-scan.test.ts`（本地 `scanLibrary` 副本 + 新增 groupId 测试）、`tests/scout-contracts.test.ts`

**Interfaces:**
- Consumes: `SOCRATIC_ROOT`, `topicDir` from Task 1
- Produces: `getTopicMeta(topicDir: string, libraryPath?: string): TopicMeta | null`（可选第二参数）

**背景**：`files:scan` 现在读库根直接子目录并排除六个来源（L287）。改为读 `苏格拉底对话/` 直接子目录。`getTopicMeta` 现在用 `path.dirname(topicDir)` 找 `.study-groups.json`（L166），主题移入子目录后会错位，须改为接收库根。

- [ ] **Step 1: 更新测试——本地 scanLibrary 副本镜像新扫描逻辑**

在 `tests/files-scan.test.ts` 把本地 `scanLibrary` 副本（L26-55）与 `describe('scanLibrary')`（L308-398）改为新逻辑：主题建在 `<root>/苏格拉底对话/` 下，`scanLibrary(root)` 扫描该子目录。修改如下：

```ts
function scanLibrary(root: string): TopicMeta[] {
  const socraticRoot = path.join(root, '苏格拉底对话')
  if (!fs.existsSync(socraticRoot)) return []

  const entries = fs.readdirSync(socraticRoot, { withFileTypes: true })
  const topicDirs = entries.filter(d => d.isDirectory()).map(d => d.name)

  const results: TopicMeta[] = []
  for (const td of topicDirs) {
    const topicPath = path.join(socraticRoot, td)
    try {
      const meta = getTopicMeta(topicPath)
      if (meta) {
        results.push(meta)
      }
    } catch (err) {
      console.error(`[scanLibrary] failed to read topic ${td}:`, err)
    }
  }

  results.sort((a, b) => {
    if (!a.last_studied && !b.last_studied) return 0
    if (!a.last_studied) return 1
    if (!b.last_studied) return -1
    return new Date(b.last_studied).getTime() - new Date(a.last_studied).getTime()
  })

  return results
}
```

并把 `describe('scanLibrary')` 内所有建主题代码 `path.join(tmpDir, '主题A')` 等改为 `path.join(tmpDir, '苏格拉底对话', '主题A')`，`path.join(tmpDir, '空主题')` → `path.join(tmpDir, '苏格拉底对话', '空主题')`，`'有效主题'`、`'有日期'`、`'无日期'` 同理。

同时新增一个 groupId 解析测试：

```ts
it('getTopicMeta resolves group from libraryPath when provided', () => {
  const socratic = path.join(tmpDir, '苏格拉底对话')
  const topicDirPath = path.join(socratic, '分组主题')
  fs.mkdirSync(path.join(topicDirPath, 's1'), { recursive: true })
  writeReport(path.join(topicDirPath, 's1', '学习报告.md'), '分组主题', '2026-05-05T10:00:00+08:00')

  fs.writeFileSync(path.join(tmpDir, '.study-groups.json'), JSON.stringify({
    version: 1,
    groups: [{ id: 'g1', name: '组一', color: '#111111' }],
    mapping: { 分组主题: 'g1' },
  }), 'utf8')

  const meta = getTopicMeta(topicDirPath, tmpDir)
  expect(meta).not.toBeNull()
  expect(meta!.groupId).toBe('g1')
})
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/files-scan.test.ts`
Expected: FAIL（scanLibrary 扫 `苏格拉底对话/` 返回空 / groupId 落 default）

- [ ] **Step 3: 修改 files.ts——getTopicMeta 签名与 groupFile**

```ts
// 签名：第二个可选参数 libraryPath；无则回退 path.dirname(topicDir)（兼容现有单参调用）
export function getTopicMeta(topicDir: string, libraryPath?: string): TopicMeta | null {
  // ... 原有逻辑不变 ...
  // Load group mapping —— 改为：
  const groupFile = path.join(libraryPath ?? path.dirname(topicDir), '.study-groups.json')
  // ...
}
```

- [ ] **Step 4: 修改 files.ts——files:scan 扫描苏格拉底对话/**

```ts
ipcMain.handle('files:scan', async (): Promise<TopicMeta[]> => {
  const scanStart = Date.now()
  const root = cfg.libraryPath
  const socraticRoot = path.join(root, '苏格拉底对话')
  if (!fs.existsSync(socraticRoot)) {
    console.error(`[files:scan] socratic root does not exist: ${socraticRoot}`)
    return []
  }

  const entries = fs.readdirSync(socraticRoot, { withFileTypes: true })
  const topicDirs = entries.filter(d => d.isDirectory()).map(d => d.name)

  const results: TopicMeta[] = []
  for (const td of topicDirs) {
    const topicPath = path.join(socraticRoot, td)
    try {
      const meta = getTopicMeta(topicPath, cfg.libraryPath)
      if (meta) {
        results.push(meta)
      }
    } catch (err) {
      console.error(`[files:scan] failed to read topic ${td}:`, err)
    }
  }

  // Sort 逻辑保持不变
  results.sort((a, b) => {
    if (!a.last_studied && !b.last_studied) return 0
    if (!a.last_studied) return 1
    if (!b.last_studied) return -1
    return new Date(b.last_studied).getTime() - new Date(a.last_studied).getTime()
  })

  console.log(`[files:scan] ${topicDirs.length} topics scanned in ${Date.now() - scanStart}ms`)
  return results
})
```

> 注：`['writing', 'repository', '夜航简报', '求职简报', 'Anthropic博客', '拾贝'].includes(td)` 这行排除清单**删除**——新扫描只读 `苏格拉底对话/`，六个来源天然不在范围内。`tests/scout-contracts.test.ts` 的正则断言因此会红，见 Step 6。

- [ ] **Step 5: 修改 files.ts——全部主题路径加前缀**

在文件顶部 `import` 区加入 `import { topicDir } from '../lib/library-layout'`，然后把以下 11 处主题路径改为用 `topicDir`：

| 行 | 现在 | 改为 |
|---|---|---|
| 225 | `const topicDir = path.join(cfg.libraryPath, dirName)` | `const topicDir = topicDir(cfg.libraryPath, dirName)` |
| 250 | `const topicDir = path.join(cfg.libraryPath, dirName)` | 同上 |
| 358 | `const topicDir = path.join(cfg.libraryPath, args.dirName)` | `topicDir(cfg.libraryPath, args.dirName)` |
| 387 | `const topicDir = path.join(cfg.libraryPath, dirName)` | `topicDir(cfg.libraryPath, dirName)` |
| 403 | `const topicDir = path.join(cfg.libraryPath, dirName)` | `topicDir(cfg.libraryPath, dirName)` |
| 430 | `const topicDir = path.join(cfg.libraryPath, args.dirName)` | `topicDir(cfg.libraryPath, args.dirName)` |
| 495 | `const topicDir = path.join(cfg.libraryPath, args.dirName)` | `topicDir(cfg.libraryPath, args.dirName)` |
| 514 | `const topicDir = path.join(cfg.libraryPath, args.dirName)` | `topicDir(cfg.libraryPath, args.dirName)` |
| 532 | `const filePath = path.join(cfg.libraryPath, args.dirName, \`s${args.sessionNumber}\`, args.fileName)` | `path.join(topicDir(cfg.libraryPath, args.dirName), \`s${args.sessionNumber}\`, args.fileName)` |
| 560 | `const topicDir = path.join(cfg.libraryPath, args.dirName)` | `topicDir(cfg.libraryPath, args.dirName)` |
| 632 | `const sessionDir = path.join(cfg.libraryPath, args.dirName, \`s${args.sessionNumber}\`)` | `path.join(topicDir(cfg.libraryPath, args.dirName), \`s${args.sessionNumber}\`)` |

> 注意行 225/250 的局部变量名 `topicDir` 与 import 的 `topicDir` 函数冲突，改完后把这两处局部变量改名为 `tdir`（或 `topicPath`）。其余局部变量 `topicDir` 同样需要改名，避免遮蔽函数。**统一做法：这些局部变量一律改名 `topicPath`。**

- [ ] **Step 6: 更新 scout-contracts 契约测试**

`tests/scout-contracts.test.ts` L9-13 现在用正则断言排除清单含 `'拾贝'`。改为断言扫描目标指向苏格拉底对话（语义保留：拾贝 不会再被打为主题，因为扫描只读 `苏格拉底对话/`）：

```ts
it('files:scan reads topics from 苏格拉底对话 subdirectory, so 拾贝 is never a topic', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'electron', 'ipc', 'files.ts'), 'utf8')
  const scanHandler = src.slice(src.indexOf('files:scan'), src.indexOf('files:read'))
  expect(scanHandler).toContain('苏格拉底对话')
})
```

- [ ] **Step 7: 运行受影响测试确认通过**

Run: `npx vitest run tests/files-scan.test.ts tests/scout-contracts.test.ts`
Expected: PASS（含新 groupId 测试）

- [ ] **Step 8: 类型检查**

Run: `npx tsc --noEmit`（若项目有该脚本，否则 `npx electron-vite build`）
Expected: 无类型错误（局部变量改名后无遮蔽）

- [ ] **Step 9: 提交**

```bash
git add electron/ipc/files.ts tests/files-scan.test.ts tests/scout-contracts.test.ts
git commit -m "refactor(files): 主题扫描与读写移入苏格拉底对话子目录"
```

---

### Task 3: llm.ts 与 llm-tasks.ts 主题路径

**Files:**
- Modify: `electron/ipc/llm.ts:195`、`electron/lib/llm-tasks.ts:186,214`

**Interfaces:**
- Consumes: `topicDir` from Task 1

- [ ] **Step 1: 修改 llm.ts generateDiagram**

```ts
// electron/ipc/llm.ts —— 顶部 import
import { topicDir } from '../lib/library-layout'

// llm:generateDiagram 内（原 L195）
const sessionDir = path.join(topicDir(cfg.libraryPath, args.dirName), `s${args.sessionNumber}`)
```

- [ ] **Step 2: 修改 llm-tasks.ts 两个函数**

```ts
// electron/lib/llm-tasks.ts —— 顶部 import
import { topicDir } from './library-layout'

// readTopicReportSummaries（原 L186）
const topicDir = topicDir(libraryPath, dirName)   // 局部变量改名 topicPath
// readReportFrontmatter（原 L214）
const topicPath = topicDir(libraryPath, dirName)
```

> 同样注意局部变量 `topicDir` 与函数名冲突，改名 `topicPath`。

- [ ] **Step 3: 运行受影响测试**

Run: `npx vitest run tests/llm-tasks.test.ts tests/recommend.test.ts`
Expected: PASS（若无相关失败，记录说明）

- [ ] **Step 4: 提交**

```bash
git add electron/ipc/llm.ts electron/lib/llm-tasks.ts
git commit -m "refactor(llm): 图/续谈推荐主题路径加苏格拉底对话前缀"
```

---

### Task 4: 写作助手 study 来源路径

**Files:**
- Modify: `electron/lib/writing-assistant/prompt.ts:11,50-52`、`electron/lib/writing-assistant/tools.ts:28-31`

**Interfaces:**
- Consumes: `SOCRATIC_ROOT`, `topicDir` from Task 1

- [ ] **Step 1: 修改 prompt.ts 主题扫描目标**

`buildWritingIndex` 第 3 节（study topics）现在 `fs.readdirSync(lib)` 扫库根。改为扫 `苏格拉底对话/`：

```ts
// electron/lib/writing-assistant/prompt.ts —— 顶部 import
import { topicDir } from '../library-layout'   // 相对路径为 '../library-layout'（同 lib 目录）

// ── 3. Study topics ─────────────────────────────────────────
try {
  const socraticDir = path.join(lib, '苏格拉底对话')
  if (!fs.existsSync(socraticDir)) throw new Error('no socratic root')
  const dirents = fs.readdirSync(socraticDir, { withFileTypes: true })
  for (const d of dirents) {
    if (!d.isDirectory()) continue
    // SKIP_DIRS 不再适用（苏格拉底目录内只有主题），可移除该判断；若保留亦无害
    const topicPath = path.join(socraticDir, d.name)
    // ... 原有读取 frontmatter 逻辑不变 ...
    entries.push({ id: `study:${d.name}`, type: 'study', title, summary })
  }
} catch { /* library unreadable — skip */ }
```

> `SKIP_DIRS` 集合（L11）里的六个来源目录已不在扫描范围内，可删除该常量；但若被其他位置引用需一并处理。全文件搜 `SKIP_DIRS` 确认只有此一处引用后删除。

- [ ] **Step 2: 修改 tools.ts resolveSourcePath study 分支**

```ts
// electron/lib/writing-assistant/tools.ts —— 顶部 import
import { topicDir } from '../library-layout'

// case 'study':
const topicDir = topicDir(lib, idPath)   // 局部变量改名 topicPath
if (!fs.existsSync(topicDir)) return null
```

- [ ] **Step 3: 运行受影响测试**

Run: `npx vitest run tests/writing-assistant-prompt.test.ts tests/writing-assistant-tools.test.ts tests/writing-tool-protocol.test.ts`
Expected: PASS（若 prompt/tools 测试需要 seed 苏格拉底目录，同步调整 fixture）

- [ ] **Step 4: 提交**

```bash
git add electron/lib/writing-assistant/prompt.ts electron/lib/writing-assistant/tools.ts
git commit -m "refactor(assistant): study 来源扫描与读取指向苏格拉底对话子目录"
```

---

### Task 5: 两个 Skill 的存档路径

**Files:**
- Modify: `~/.claude/skills/study/SKILL.md`（仓库外，用户全局）
- Modify: `.claude/skills/fable/SKILL.md`（仓库内）

**Interfaces:**
- 无（纯文档路径更新）

- [ ] **Step 1: 修改 study skill 全部路径**

在 `C:\Users\86468\.claude\skills\study\SKILL.md` 中，把学习库路径统一加 `苏格拉底对话/` 前缀：

- L49 `ls "C:/Users/86468/Desktop/学习库"` → `ls "C:/Users/86468/Desktop/学习库/苏格拉底对话"`
- L54 遍历目标 → `苏格拉底对话/` 下的主题目录
- L104 提示文案 `学习库/主题/sN/学习报告.md` → `学习库/苏格拉底对话/主题/sN/学习报告.md`
- L116 `学习库/主题名/` → `学习库/苏格拉底对话/主题名/`
- L120 目标路径 `C:/Users/86468/Desktop/学习库/{主题名}/s{编号}/学习报告.md` → 加 `苏格拉底对话/`
- L210 `mkdir -p "C:/Users/86468/Desktop/学习库/{主题名}/s{编号}"` → 加 `苏格拉底对话/`
- L215 示例 `学习库/项目目录结构/s2` → `学习库/苏格拉底对话/项目目录结构/s2`
- L232 示例 `> "C:/Users/86468/Desktop/学习库/项目目录结构/s2/学习报告.md"` → 加 `苏格拉底对话/`
- L244 `mkdir -p "C:/Users/86468/Desktop/学习库/{主题名}/s1"` → 加 `苏格拉底对话/`

- [ ] **Step 2: 修改 fable skill 全部路径**

在 `.claude/skills/fable/SKILL.md` 中：

- L67 保存位置 `YOUR_LIBRARY_PATH/{概念名}/s{编号}/寓言.md` → `YOUR_LIBRARY_PATH/苏格拉底对话/{概念名}/s{编号}/寓言.md`
- L78 扫描 `ls "YOUR_LIBRARY_PATH"` → `ls "YOUR_LIBRARY_PATH/苏格拉底对话"`
- L82 遍历目标 → `苏格拉底对话/` 下
- L133 提示文案 `学习库/{概念名}/s{编号}/寓言.md` → 加 `苏格拉底对话/`
- L145 扫描目标、L149 目标路径 → 加 `苏格拉底对话/`
- L219/L224/L244/L257 mkdir 与 echo 示例 → 加 `苏格拉底对话/`

- [ ] **Step 3: 验证无遗漏**

Run: `grep -n "学习库" /c/Users/86468/.claude/skills/study/SKILL.md | grep -v "苏格拉底对话"` 应无输出（路径类）；fable 同理 `grep -n "YOUR_LIBRARY_PATH" .claude/skills/fable/SKILL.md` 检查每个路径都含 `苏格拉底对话/`。

- [ ] **Step 4: 提交（仅 fable，study 在仓库外不入库）**

```bash
git add .claude/skills/fable/SKILL.md
git commit -m "docs(skill): fable 存档路径加苏格拉底对话前缀"
```

> study skill 在 `~/.claude/skills/`（仓库外），不提交 git，只在本地改。

---

### Task 6: E2E seed 辅助函数与单独改的 spec

**Files:**
- Modify: `e2e/helpers/test-library.ts:206,233,262,298,340,378,407`（7 个主题 seed）
- Modify: `e2e/specs/archive-edge.spec.ts:47-56`、`e2e/specs/new-topic-progress.spec.ts:52-63`、`e2e/specs/review-topic.spec.ts:15-16,57`

**Interfaces:**
- Consumes: 无（seed 函数签名不变：`seedNewTopic(libPath, slug, title)` 等）

- [ ] **Step 1: 修改 7 个主题 seed 函数**

在 `e2e/helpers/test-library.ts` 中，给所有「主题」seed 的目标路径加 `'苏格拉底对话'` 段。六个来源 seed（`seedJobBriefing`/`seedBriefing`/`seedAnthropicArticle`/`seedAnthropicArticleWithImage`/`seedWritingTree`/`seedRepository`/`seedCatalogJson`）与 `seedGroupState`（`.study-groups.json`）**不改**。

模式（每个函数只需改 `path.join(libPath, slug, ...)` → `path.join(libPath, '苏格拉底对话', slug, ...)`）：

```ts
// seedNewTopic（L208）
const dir = path.join(libPath, '苏格拉底对话', slug, 's1')

// seedReviewableTopic（L235）
const dir = path.join(libPath, '苏格拉底对话', slug, 's2')

// seedMultiSessionTopic（L273）
const dir = path.join(libPath, '苏格拉底对话', slug, `s${i}`)

// seedTopicWithFable（L304）、seedTopicWithDiagram（L346）、
// seedTopicWithoutFable（L384）、seedTopicWithoutDiagram（L413）
const dir = path.join(libPath, '苏格拉底对话', slug, 's1')
```

> 若 seed 函数内部还有读取 `.study-groups.json` 或返回路径的辅助逻辑，需在函数体通读后一并更新（保持 seed 与真实库结构一致）。

- [ ] **Step 2: 改 archive-edge.spec.ts**

`fs.readdirSync(testLibraryPath)`（L49）改为扫描 `苏格拉底对话/`：

```ts
const socraticDir = path.join(testLibraryPath, '苏格拉底对话')
const topics = fs.readdirSync(socraticDir).filter(name =>
  fs.statSync(path.join(socraticDir, name)).isDirectory()
)
// 后面 topicDir 用 path.join(socraticDir, topics[0])
```

- [ ] **Step 3: 改 new-topic-progress.spec.ts**

L52-63 改为扫描 `苏格拉底对话/`：

```ts
const socraticDir = path.join(testLibraryPath, '苏格拉底对话')
const entries = fs.readdirSync(socraticDir)
expect(entries.length).toBeGreaterThan(0)
const topicDir = path.join(socraticDir, entries[0])
// 其余不变（sessions 含 s1、学习报告.md 存在等）
```

- [ ] **Step 4: 改 review-topic.spec.ts**

两处 `path.join(testLibraryPath, 'typescript-decorators', ...)` → `path.join(testLibraryPath, '苏格拉底对话', 'typescript-decorators', ...)`：

```ts
const reportPath = path.join(testLibraryPath, '苏格拉底对话', 'typescript-decorators', 's2', '学习报告.md')
const reviewReportPath = path.join(testLibraryPath, '苏格拉底对话', 'typescript-decorators', 's2', '复习报告.md')
```

- [ ] **Step 5: 确认 briefing-aesthetics.spec.ts 不需要改**

它只用 `seedBriefing`（写 `夜航简报/`，保留原位）+ `fs.readdirSync(testLibraryPath, { recursive: true })` 递归搜索今日 md。来源目录仍在库根，递归仍能找到。运行确认。

Run: `npx vitest run`（不用——E2E）→ 改为：

```bash
node scripts/e2e-changed.js --run --no-retries
```

Expected: 受影响 spec 全绿。若 briefing-aesthetics 因递归遍历 `苏格拉底对话/` 把主题 md 也扫进去而失败，需要把过滤改为只看 `夜航简报/` 下文件（记录说明，按需修）。

- [ ] **Step 6: 提交**

```bash
git add e2e/helpers/test-library.ts e2e/specs/archive-edge.spec.ts e2e/specs/new-topic-progress.spec.ts e2e/specs/review-topic.spec.ts
git commit -m "test(e2e): seed 与断言适配苏格拉底对话子目录"
```

---

### Task 7: 真实学习库文件移动 + 校验（红线）

**Files:**
- 操作真实学习库：`C:\Users\86468\Desktop\学习库`（非 git 仓库，直接文件系统操作）

**红线**：绝不丢失文件。移动用同盘 `mv`（原子 rename），移动前后计数校验。

- [ ] **Step 1: 移动前快照**

```bash
cd /c/Users/86468/Desktop/学习库
# 记录当前所有直接子目录（应含 6 来源 + 40+ 主题 + 苏格拉底对话需不存在）
ls -A | grep -v '^\.study-groups\.json$' > /tmp/lib-before.txt
# 记录全库文件总数
find . -type f | wc -l > /tmp/lib-filecount-before.txt
cat /tmp/lib-filecount-before.txt
```

- [ ] **Step 2: 确认苏格拉底对话目录不存在，创建之**

```bash
test ! -d 苏格拉底对话 && mkdir 苏格拉底对话
```

- [ ] **Step 3: 移动全部非来源主题目录**

保留名单（不移动）：`writing` `repository` `夜航简报` `求职简报` `拾贝` `Anthropic博客` `.study-groups.json` `苏格拉底对话`。对库根每个直接子目录，不在保留名单的 `mv` 进 `苏格拉底对话/`：

```bash
cd /c/Users/86468/Desktop/学习库
for d in */; do
  name="${d%/}"
  case "$name" in
    writing|repository|夜航简报|求职简报|拾贝|Anthropic博客|苏格拉底对话) ;;
    *) mv "$name" 苏格拉底对话/ && echo "moved: $name" ;;
  esac
done
```

- [ ] **Step 4: 移动后校验（红线）**

```bash
cd /c/Users/86468/Desktop/学习库
# 全库文件总数必须与移动前一致
find . -type f | wc -l
cat /tmp/lib-filecount-before.txt
# 苏格拉底对话下主题数 == 移动前非来源目录数
ls 苏格拉底对话 | wc -l
# 根目录只剩 6 来源 + 苏格拉底对话 + .study-groups.json
ls -A
```

Expected：文件总数一致；`ls 苏格拉底对话` 计数与移动前非来源数一致；根目录只剩 `writing repository 夜航简报 求职简报 拾贝 Anthropic博客 苏格拉底对话 .study-groups.json`。

- [ ] **Step 5: 校验分组映射不丢**

`.study-groups.json` 的 mapping 键是主题名（目录名），移动不改变目录名，无需改。抽查：

```bash
cat .study-groups.json | node -e "const d=JSON.parse(require('fs').readFileSync(0));console.log(Object.keys(d.mapping).length, 'topics in mapping')"
ls /c/Users/86468/Desktop/学习库/苏格拉底对话 | wc -l
```

Expected：mapping 键数 ≥ 苏格拉底对话目录数（mapping 可能含已删主题，只需 >=）。

- [ ] **Step 6: 无孤儿文件**

```bash
# 根目录不应再有散落的主题目录（除保留名单）
ls -A /c/Users/86468/Desktop/学习库 | grep -vE '^(writing|repository|夜航简报|求职简报|拾贝|Anthropic博客|苏格拉底对话|\.study-groups\.json)$'
```
Expected：无输出。

---

### Task 8: 端到端验证

**Files:**
- 无（纯验证）

- [ ] **Step 1: 构建并跑受影响 E2E**

```bash
cd /c/Users/86468/Desktop/project/study-parlor
node scripts/e2e-changed.js --run --no-retries
```

Expected：全绿。重点抽查 `new-topic-progress`、`review-topic`、`archive-edge`、`library-management`、`home`、`writing-*`、`briefing-*`、`scout-*`。

- [ ] **Step 2: 定向单测**

```bash
npx vitest run tests/library-layout.test.ts tests/files-scan.test.ts tests/scout-contracts.test.ts tests/llm-tasks.test.ts tests/writing-assistant-prompt.test.ts tests/writing-assistant-tools.test.ts
```

Expected：全绿。

- [ ] **Step 3: 手动冒烟（npm run dev）**

启动应用，确认：
- Home 库列表主题数与移动前一致、分组颜色正确（验证 getTopicMeta libraryPath 生效）
- 打开一个主题的 学习报告 / 复习报告 / 寓言 正常
- 写作树 writing/repository 正常
- 简报、求职简报、拾贝、Anthropic博客 各来源入口正常
- `/study` 与 `/fable` 各触发一次，确认历史同步与存档写入 `苏格拉底对话/`

- [ ] **Step 4: 完成**

确认全部通过后，任务完成。

---

## Self-Review 记录

- **Spec 覆盖**：§1 扫描（Task 2）、§2 getTopicMeta（Task 2）、§3 主进程路径（Task 2/3）、§4 写作助手（Task 4）、§5 六来源不改（各 Task 显式不改）、§6 skills（Task 5）、§7 测试 E2E（Task 2/6）、红线移动（Task 7）、验证（Task 8）——全覆盖。
- **占位符**：无 TBD/TODO。
- **类型一致性**：`topicDir(lib, dirName)` 命名一致；`getTopicMeta(topicDir, libraryPath?)` 签名一致；seed 函数签名未变。局部变量 `topicDir` 统一改名 `topicPath` 避免遮蔽，已在 Task 2/3/4 注明。
