import { randomUUID } from 'node:crypto'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { killProjectProcessesByPattern } from './process-cleanup'

const TEST_LIBRARY_ROOT = path.join(process.cwd(), 'e2e', '.test-library')
const TEST_CONFIG_ROOT = path.join(process.cwd(), 'e2e', '.test-config')
const OLD_DIR_MAX_AGE_MS = 24 * 60 * 60 * 1000 // 24 hours

export function createTestLibrary(): string {
  cleanupOldTestDirs(TEST_LIBRARY_ROOT)
  const id = `${Date.now()}-${randomUUID()}`
  const dir = path.join(TEST_LIBRARY_ROOT, id)
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

export async function cleanupTestLibrary(dir: string, keepOnFailure: boolean = false): Promise<void> {
  if (keepOnFailure) return
  await retryRm(dir)
}

export function createTestConfigDir(): string {
  cleanupOldTestDirs(TEST_CONFIG_ROOT)
  const id = `${Date.now()}-${randomUUID()}`
  const dir = path.join(TEST_CONFIG_ROOT, id)
  fs.mkdirSync(dir, { recursive: true })
  // Copy .env so the Electron main process can load credentials in isolation.
  const envPath = path.join(process.cwd(), '.env')
  const targetEnvPath = path.join(dir, '.env')
  if (fs.existsSync(envPath)) {
    fs.copyFileSync(envPath, targetEnvPath)
  } else {
    // Fallback test credentials so E2E can start without a committed .env.
    fs.writeFileSync(
      targetEnvPath,
      `KIMI_API_KEY=sk-kimi-e2e-test-key\nKIMI_BASE_URL=https://api.kimi.com/coding/v1\nKIMI_MODEL=kimi-k2.6\nSTUDY_LIBRARY_PATH=${dir}\n`
    )
  }
  return dir
}

export async function cleanupTestConfigDir(dir: string, keepOnFailure: boolean = false): Promise<void> {
  if (keepOnFailure) return
  // 先终止任何仍锁定该测试配置目录的残留 Electron 进程，再尝试删除。
  // 这是 Windows 上避免 EPERM 的最后一道保险。
  try {
    const killed = await killProjectProcessesByPattern(process.cwd(), dir)
    if (killed.length) {
      console.log('[e2e] killed residual processes before config dir cleanup:', killed.join(', '))
      // Windows may need a few seconds to release file handles after the
      // processes are gone; give it a generous buffer before retrying rm.
      await new Promise((resolve) => setTimeout(resolve, 3000))
    }
  } catch (err) {
    console.warn('[e2e] failed to kill residual processes for config dir:', dir, err)
  }
  await retryRm(dir, {
    onRetry: async () => {
      try {
        const killed = await killProjectProcessesByPattern(process.cwd(), dir)
        if (killed.length) {
          console.log('[e2e] killed residual processes during retry:', killed.join(', '))
        }
      } catch {}
    },
  })
}

async function retryRm(
  dir: string,
  options: { timeoutMs?: number; intervalMs?: number; onRetry?: () => void | Promise<void> } = {}
): Promise<void> {
  const { timeoutMs = 30000, intervalMs = 200, onRetry } = options

  const deadline = Date.now() + timeoutMs
  let lastErr: unknown
  let attempts = 0
  while (Date.now() < deadline) {
    try {
      fs.rmSync(dir, { recursive: true, force: true })
      return
    } catch (err) {
      lastErr = err
      attempts++
      // Periodically ask the caller to release external locks (e.g. kill
      // lingering Electron processes on Windows) instead of waiting passively.
      if (onRetry && attempts % 25 === 0) {
        try {
          await onRetry()
        } catch {}
      }
      // On Windows a single locked file can prevent removing the whole tree.
      // Delete everything we can so the debris is minimal; the next run's
      // age-out cleanup will finish the rest.
      try {
        removeAsMuchAsPossible(dir)
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, intervalMs))
    }
  }

  // Last resort: rename the locked directory so it does not block future
  // test runs and can be picked up by the age-out cleanup later. If even
  // renaming fails (directory is still locked), leave it for the age-out
  // cleanup rather than failing the test run.
  const staleName = `${dir}.stale-${Date.now()}`
  try {
    fs.renameSync(dir, staleName)
    console.warn(`[e2e] could not remove locked dir, renamed to ${staleName}`)
    return
  } catch (renameErr) {
    console.warn(`[e2e] could not remove or rename locked dir ${dir}:`, renameErr)
  }
}

function removeAsMuchAsPossible(dir: string): void {
  if (!fs.existsSync(dir)) return
  for (const entry of fs.readdirSync(dir)) {
    const fullPath = path.join(dir, entry)
    try {
      const stat = fs.statSync(fullPath)
      if (stat.isDirectory()) {
        removeAsMuchAsPossible(fullPath)
        fs.rmdirSync(fullPath)
      } else {
        fs.unlinkSync(fullPath)
      }
    } catch {
      // ignore locked files or directories
    }
  }
}

function cleanupOldTestDirs(root: string): void {
  if (!fs.existsSync(root)) return
  const now = Date.now()
  for (const entry of fs.readdirSync(root)) {
    const fullPath = path.join(root, entry)
    try {
      const stat = fs.statSync(fullPath)
      const age = now - stat.mtimeMs
      if (age > OLD_DIR_MAX_AGE_MS) {
        fs.rmSync(fullPath, { recursive: true, force: true })
        console.log(`[e2e] cleaned up old test dir: ${fullPath}`)
      }
    } catch (err) {
      // If a directory is locked by a running test, skip it silently.
      console.warn(`[e2e] skipped cleanup of ${fullPath}:`, err)
    }
  }
}

/**
 * Force cleanup of all test directories older than maxAgeMs.
 * Useful for CI or manual recovery when Windows file locks have left debris.
 */
export function forceCleanupOldTestDirs(maxAgeMs: number = OLD_DIR_MAX_AGE_MS): void {
  cleanupOldTestDirsWithAge(TEST_LIBRARY_ROOT, maxAgeMs)
  cleanupOldTestDirsWithAge(TEST_CONFIG_ROOT, maxAgeMs)
}

function cleanupOldTestDirsWithAge(root: string, maxAgeMs: number): void {
  if (!fs.existsSync(root)) return
  const now = Date.now()
  for (const entry of fs.readdirSync(root)) {
    const fullPath = path.join(root, entry)
    try {
      const stat = fs.statSync(fullPath)
      const age = now - stat.mtimeMs
      if (age > maxAgeMs) {
        fs.rmSync(fullPath, { recursive: true, force: true })
      }
    } catch {
      // ignore
    }
  }
}

function validateSlug(slug: string): void {
  if (!slug) throw new Error('Slug must be non-empty')
  if (slug.includes('..') || slug.includes('/') || slug.includes('\\') || slug.includes(':')) {
    throw new Error(`Slug contains invalid characters: ${slug}`)
  }
}

export function seedNewTopic(libPath: string, slug: string, title: string): void {
  validateSlug(slug)
  const dir = path.join(libPath, slug, 's1')
  fs.mkdirSync(dir, { recursive: true })
  const filePath = path.join(dir, '学习报告.md')
  const now = new Date().toISOString()
  const content = `---
title: ${title}
description: 自动生成用于 E2E 测试的主题
type: progress
created: '${now}'
tags:
  - test
session_number: 1
difficulty: high
progress_summary: E2E fixture data
last_studied: '${now}'
review_count: 0
---

# ${title}

这是 E2E 测试用的占位学习报告。
`
  fs.writeFileSync(filePath, content)
}

export function seedReviewableTopic(libPath: string, slug: string, title: string): void {
  validateSlug(slug)
  const dir = path.join(libPath, slug, 's2')
  fs.mkdirSync(dir, { recursive: true })
  const filePath = path.join(dir, '学习报告.md')
  const d = new Date()
  d.setDate(d.getDate() - 30)
  const ago = d.toISOString()
  const content = `---
title: ${title}
description: 自动生成用于 E2E 复习测试的主题
type: progress
created: '${ago}'
tags:
  - test
session_number: 2
difficulty: mid
progress_summary: E2E fixture data for review
last_studied: '${ago}'
review_count: 1
---

# ${title}

这是 E2E 复习测试用的占位学习报告。
`
  fs.writeFileSync(filePath, content)
}

export function seedMultiSessionTopic(
  libPath: string,
  slug: string,
  title: string,
  sessionCount: number = 3
): void {
  validateSlug(slug)
  const now = new Date()
  for (let i = 1; i <= sessionCount; i++) {
    const d = new Date(now)
    d.setDate(d.getDate() - (sessionCount - i) * 7)
    const dir = path.join(libPath, slug, `s${i}`)
    fs.mkdirSync(dir, { recursive: true })
    const filePath = path.join(dir, '学习报告.md')
    const content = `---
title: ${title}
description: E2E fixture session ${i}
type: progress
created: '${d.toISOString()}'
tags:
  - test
session_number: ${i}
difficulty: mid
progress_summary: E2E fixture session ${i}
last_studied: '${d.toISOString()}'
review_count: 0
---

# ${title} · 第${i}次

这是 E2E 测试用的占位学习报告。
`
    fs.writeFileSync(filePath, content)
  }
}

export function seedTopicWithFable(
  libPath: string,
  slug: string,
  title: string
): void {
  validateSlug(slug)
  const dir = path.join(libPath, slug, 's1')
  fs.mkdirSync(dir, { recursive: true })

  const reportContent = `---
title: ${title}
description: E2E fixture with fable
type: progress
created: '${new Date().toISOString()}'
tags:
  - test
session_number: 1
difficulty: mid
progress_summary: E2E fixture with fable
last_studied: '${new Date().toISOString()}'
review_count: 0
---

# ${title}

占位报告。
`
  fs.writeFileSync(path.join(dir, '学习报告.md'), reportContent)

  const fableContent = `---
title: ${title} 的寓言
description: 自动生成
session_number: 1
---

# 寓言

从前有一只用于 E2E 测试的狐狸。
`
  fs.writeFileSync(path.join(dir, '寓言.md'), fableContent)
}

export function seedTopicWithDiagram(
  libPath: string,
  slug: string,
  title: string
): void {
  validateSlug(slug)
  const dir = path.join(libPath, slug, 's1')
  fs.mkdirSync(dir, { recursive: true })

  const reportContent = `---
title: ${title}
description: E2E fixture with diagram
type: progress
created: '${new Date().toISOString()}'
tags:
  - test
session_number: 1
difficulty: mid
progress_summary: E2E fixture with diagram
last_studied: '${new Date().toISOString()}'
review_count: 0
---

# ${title}

占位报告。
`
  fs.writeFileSync(path.join(dir, '学习报告.md'), reportContent)

  const diagramContent = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 200 100">
  <rect x="10" y="10" width="180" height="80" rx="8" fill="#d97757" opacity="0.2" stroke="#d97757" stroke-width="2"/>
  <text x="100" y="55" text-anchor="middle" fill="#e8d5b7" font-size="14">E2E 测试图表</text>
</svg>
`
  fs.writeFileSync(path.join(dir, '学习图表.svg'), diagramContent)
}

export function seedTopicWithoutFable(
  libPath: string,
  slug: string,
  title: string
): void {
  validateSlug(slug)
  const dir = path.join(libPath, slug, 's1')
  fs.mkdirSync(dir, { recursive: true })
  const content = `---
title: ${title}
description: E2E fixture without fable
type: progress
created: '${new Date().toISOString()}'
tags:
  - test
session_number: 1
difficulty: mid
progress_summary: E2E fixture without fable
last_studied: '${new Date().toISOString()}'
review_count: 0
---

# ${title}

占位报告，无寓言。
`
  fs.writeFileSync(path.join(dir, '学习报告.md'), content)
}

export function seedTopicWithoutDiagram(
  libPath: string,
  slug: string,
  title: string
): void {
  validateSlug(slug)
  const dir = path.join(libPath, slug, 's1')
  fs.mkdirSync(dir, { recursive: true })
  const content = `---
title: ${title}
description: E2E fixture without diagram
type: progress
created: '${new Date().toISOString()}'
tags:
  - test
session_number: 1
difficulty: mid
progress_summary: E2E fixture without diagram
last_studied: '${new Date().toISOString()}'
review_count: 0
---

# ${title}

占位报告，无图表。
`
  fs.writeFileSync(path.join(dir, '学习报告.md'), content)
}

type GroupDef = { id: string; name: string; color?: string }

type GroupMapping = Record<string, string | null>

export function seedGroupState(
  libPath: string,
  groups: GroupDef[],
  mapping: GroupMapping
): void {
  const state = {
    version: 1,
    groups,
    mapping,
  }
  fs.writeFileSync(
    path.join(libPath, '.study-groups.json'),
    JSON.stringify(state, null, 2)
  )
}

const BASE_STATE = {
  profile: {
    name: 'E2E 测试员',
    profile_text: '',
    preferred_topics: [],
  },
  lastUsed: {
    difficulty: 'mid',
    temperature: 0.7,
  },
  session_count: 0,
  groups: [],
  activeGroupId: null,
  groupInspirations: {},
  topicContinueSuggestions: {},
  unsavedSessions: [],
  pendingArchives: [],
  pendingReports: {},
  terminology: {},
  briefingSource: 'digest',
  briefingStageDetail: null,
  jobBriefingStageDetail: null,
  anthropicBlogCache: { lastFetchedAt: null, articles: [], loading: false, error: null },
  anthropicBlogLastSeenAt: null,
  articleAssistantGuideWidth: 320,
  articleAssistantGuideCollapsed: false,
  assistantSearchEnabled: false,
  assistantSocraticMode: true,
  assistantThinkingEffort: 'off',
  writingFontSize: 'base',
  writingTone: 'parchment',
  writingListTab: 'articles',
  writingAssistantWidth: 320,
  writingAssistantOpen: false,
  lastWritingFile: null,
  jobBriefingConfig: {
    companies: [
      { name: '字节跳动', priority: 1, enabled: true },
      { name: '阿里巴巴', priority: 2, enabled: true },
      { name: '腾讯', priority: 3, enabled: true },
      { name: '百度', priority: 4, enabled: true },
      { name: '美团', priority: 5, enabled: true },
      { name: 'MiniMax', priority: 6, enabled: true },
      { name: '智谱AI', priority: 7, enabled: true },
      { name: '月之暗面', priority: 8, enabled: true },
      { name: '零一万物', priority: 9, enabled: true },
      { name: '百川智能', priority: 10, enabled: true },
    ],
    roleKeywords: ['AI产品经理', '大模型产品经理', 'Agent产品经理'],
    cities: ['北京', '上海', '杭州', '深圳'],
    skillKeywords: ['RAG', 'Agent', '提示词工程', '多模态'],
    eventSearchKeywords: [],
    jobSearchKeywords: [],
    searchInternship: false,
    searchFallRecruit: true,
  },
  jobProfile: {
    targetRoles: [],
    direction: '',
    skills: [],
    experience: '',
    additionalNotes: '',
  },
}

export function seedStateJson(
  configDir: string,
  partialState: Record<string, unknown>
): void {
  const statePath = path.join(configDir, 'state.json')
  fs.writeFileSync(
    statePath,
    JSON.stringify({ ...BASE_STATE, ...partialState }, null, 2)
  )
}

export function seedTerminology(
  configDir: string,
  terminology: Record<string, string>
): void {
  const statePath = path.join(configDir, 'state.json')
  let state: Record<string, unknown>
  if (fs.existsSync(statePath)) {
    try {
      state = JSON.parse(fs.readFileSync(statePath, 'utf8'))
    } catch (error: any) {
      throw new Error(`Failed to parse state.json at ${statePath}: ${error.message}`)
    }
  } else {
    state = { ...BASE_STATE }
  }
  state.terminology = { ...(state.terminology as Record<string, string> || {}), ...terminology }
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2))
}

export function seedWildCardInspiration(
  configDir: string,
  payload: { title: string; hook: string; topic: string }
): void {
  const statePath = path.join(configDir, 'state.json')
  let state: Record<string, unknown>
  if (fs.existsSync(statePath)) {
    try {
      state = JSON.parse(fs.readFileSync(statePath, 'utf8'))
    } catch (error: any) {
      throw new Error(`Failed to parse state.json at ${statePath}: ${error.message}`)
    }
  } else {
    state = { ...BASE_STATE }
  }
  state.wildcardInspiration = payload
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2))
}

/**
 * Seed 一份求职简报缓存文件（`<libPath>/求职简报/求职简报-<date>.md`）。
 * body 传 `## Error\nJOB_XXX` 时命中主进程失败注入口
 * （electron/ipc/job-briefing.ts 的缓存错误 rethrow 分支），用于确定性
 * 覆盖失败路径——mock fast path 永远成功，失败分支此前零执行。
 */
export function seedJobBriefing(libPath: string, date: string, content: string): void {
  const dir = path.join(libPath, '求职简报')
  fs.mkdirSync(dir, { recursive: true })
  const filePath = path.join(dir, `求职简报-${date}.md`)
  const fm = `---
title: 求职简报
type: job-briefing
created: '${new Date().toISOString()}'
tags:
  - job-briefing
  - ai-product
date: '${date}'
---

`
  fs.writeFileSync(filePath, fm + content, 'utf8')
}

export function seedBriefing(libPath: string, date: string, content?: string, generatedAt?: string): void {
  const dir = path.join(libPath, '夜航简报')
  fs.mkdirSync(dir, { recursive: true })
  const filePath = path.join(dir, `夜航简报-${date}.md`)
  const defaultContent = content ?? `## X / Twitter

### Box CEO Aaron Levie
Aaron Levie 讨论了 LLM 在企业工作流中的落地。

## Official Blogs

### Anthropic Engineering
Claude 的新功能提升了长上下文可靠性。

## Podcasts

### Latent Space
最新一期采访了 Anthropic 研究员。

## 原始来源
### Aaron Levie
- [tweet](https://x.com/levie/status/1)
### Anthropic Engineering
- [post](https://anthropic.com/engineering/1)
### Latent Space
- [episode](https://youtube.com/watch?v=1)`
  const fm = `---
title: 夜航简报
type: briefing
created: '${generatedAt ?? new Date().toISOString()}'
tags:
  - industry-digest
  - ai
---

`
  fs.writeFileSync(filePath, fm + defaultContent, 'utf8')
}

export function seedAnthropicArticle(
  libPath: string,
  slug: string,
  title: string,
  body: string = '正文占位。',
  extraFrontmatter: Record<string, unknown> = {}
): string {
  validateSlug(slug)
  const dir = path.join(libPath, 'Anthropic博客')
  fs.mkdirSync(dir, { recursive: true })
  const filePath = path.join(dir, `${slug}.md`)
  const frontmatter = {
    title,
    type: 'anthropic-article',
    source_url: `https://www.anthropic.com/engineering/${slug}`,
    created: new Date().toISOString(),
    published_at: new Date().toISOString(),
    ...extraFrontmatter,
  }
  const fmLines = Object.entries(frontmatter)
    .map(([key, value]) => {
      if (Array.isArray(value)) {
        return `${key}:\n${value.map((v) => `  - ${v}`).join('\n')}`
      }
      return `${key}: ${value}`
    })
    .join('\n')
  const content = `---\n${fmLines}\n---\n\n${body}\n`
  fs.writeFileSync(filePath, content, 'utf8')
  return filePath
}

export function seedAnthropicArticleWithImage(
  libPath: string,
  slug: string,
  title: string,
  body: string = '正文占位。',
  extraFrontmatter: Record<string, unknown> = {}
): { filePath: string; assetPath: string } {
  const filePath = seedAnthropicArticle(libPath, slug, title, body, extraFrontmatter)
  const assetsDir = path.join(path.dirname(filePath), '.assets')
  fs.mkdirSync(assetsDir, { recursive: true })
  // 1x1 red PNG used as a deterministic image asset for E2E assertions.
  const assetPath = path.join(assetsDir, 'image.png')
  const pngBase64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVQIHWP4DwABAQEAGbBRyQAAAABJRU5ErkJggg=='
  fs.writeFileSync(assetPath, Buffer.from(pngBase64, 'base64'))
  return { filePath, assetPath }
}

export function seedUnsavedSession(
  configDir: string,
  session: {
    id: string
    topic: string
    mode?: string
    difficulty?: string
    temperature?: number | string
    history?: Array<{ role: string; content: string }>
  }
): void {
  const dir = path.join(configDir, 'sessions')
  fs.mkdirSync(dir, { recursive: true })
  const sanitized = session.topic.replace(/[^\w一-龥]/g, '_')
  const fileName = `${sanitized}_${session.id.slice(0, 8)}.json`
  const full = {
    mode: session.mode ?? 'progress',
    difficulty: session.difficulty ?? 'mid',
    temperature: session.temperature ?? 0.7,
    history: session.history ?? [],
    ...session,
  }
  fs.writeFileSync(path.join(dir, fileName), JSON.stringify(full, null, 2), 'utf8')
}

export function seedContinueSuggestions(
  configDir: string,
  topic: string,
  suggestions: Array<Record<string, string>>,
  sessionCount: number
): void {
  const statePath = path.join(configDir, 'state.json')
  let state: Record<string, unknown>
  if (fs.existsSync(statePath)) {
    try {
      state = JSON.parse(fs.readFileSync(statePath, 'utf8'))
    } catch (error: any) {
      throw new Error(`Failed to parse state.json at ${statePath}: ${error.message}`)
    }
  } else {
    state = { ...BASE_STATE }
  }
  state.topicContinueSuggestions = {
    ...(state.topicContinueSuggestions as Record<string, unknown> || {}),
    [topic]: { suggestions, sessionCount },
  }
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2))
}

// ── Writing feature seeds ──────────────────────────────────────────

/**
 * Seed a writing directory tree under `libPath/writing/` with three articles
 * in a nested folder structure, plus an assistant session file for one article.
 */
export function seedWritingTree(libPath: string): void {
  const writingDir = path.join(libPath, 'writing')
  fs.mkdirSync(path.join(writingDir, '随笔'), { recursive: true })
  fs.mkdirSync(path.join(writingDir, '技术笔记', '子组'), { recursive: true })

  // Article 1: 随笔/七月夜话.md
  const f1 = `---\ntype: writing\ntitle: 七月夜话\ncreated: 2026-07-19\nupdated: 2026-07-19\n---\n\n# 七月夜话\n\n这是第一篇写作文章。\n`
  fs.writeFileSync(path.join(writingDir, '随笔', '七月夜话.md'), f1, 'utf8')

  // Article 2: 技术笔记/分布式随笔.md
  const f2 = `---\ntype: writing\ntitle: 分布式随笔\ncreated: 2026-07-18\nupdated: 2026-07-19\n---\n\n# 分布式随笔\n\n关于分布式系统的思考。\n`
  fs.writeFileSync(path.join(writingDir, '技术笔记', '分布式随笔.md'), f2, 'utf8')

  // Article 3: 技术笔记/子组/深度文章.md
  const f3 = `---\ntype: writing\ntitle: 深度文章\ncreated: 2026-07-17\nupdated: 2026-07-17\n---\n\n深度内容。\n`
  fs.writeFileSync(path.join(writingDir, '技术笔记', '子组', '深度文章.md'), f3, 'utf8')

  // Assistant session for 七月夜话
  const sessionContent = `## 用户\n\n帮我看看这篇文章\n\n## 助手\n\n好的，我来分析一下。\n\n> 来源：[repository] 旧随笔.md\n`
  const sessionFm = `---\ntype: article-assistant\nparent_path: writing/随笔/七月夜话.md\nparent_type: writing\ncreated: 2026-07-19\n---\n\n`
  fs.writeFileSync(path.join(writingDir, '随笔', '七月夜话.assistant.md'), sessionFm + sessionContent, 'utf8')
}

/**
 * Seed repository files under `libPath/repository/` — old blog posts and
 * loose markdown files with no frontmatter.
 */
export function seedRepository(libPath: string): void {
  const repoDir = path.join(libPath, 'repository', '2023')
  fs.mkdirSync(repoDir, { recursive: true })

  // Old blog post (no frontmatter)
  fs.writeFileSync(path.join(repoDir, '旧博客-xxx.md'), '# 旧博客\n\n过去的积累。\n', 'utf8')
  fs.writeFileSync(
    path.join(libPath, 'repository', '旧随笔.md'),
    '---\ntype: writing\ntitle: 旧随笔\ncreated: 2026-07-20\nupdated: 2026-07-20\n---\n\n没有 frontmatter 的旧文件。\n',
    'utf8'
  )
}

/**
 * Seed catalog JSON files for both writing and repository directories.
 * These are used by the catalog system for summaries and metadata.
 */
export function seedCatalogJson(libPath: string): void {
  const writingCatalog = {
    version: 1,
    entries: {
      'writing/随笔/七月夜话.md': { title: '七月夜话', summary: '关于七月的随笔', updatedAt: '2026-07-19' },
      'writing/技术笔记/分布式随笔.md': { title: '分布式随笔', summary: '分布式系统思考', updatedAt: '2026-07-19' },
      'writing/技术笔记/子组/深度文章.md': { title: '深度文章', summary: '深度内容', updatedAt: '2026-07-17' },
    },
  }
  fs.mkdirSync(path.join(libPath, 'writing'), { recursive: true })
  fs.writeFileSync(path.join(libPath, 'writing', '.catalog.json'), JSON.stringify(writingCatalog, null, 2), 'utf8')

  const repoCatalog = {
    version: 1,
    entries: {
      'repository/2023/旧博客-xxx.md': { title: '旧博客', summary: '过去的积累', updatedAt: '2026-07-19' },
      'repository/旧随笔.md': { title: '旧随笔', summary: '没有元数据的旧文件', updatedAt: '2026-07-19' },
    },
  }
  fs.mkdirSync(path.join(libPath, 'repository'), { recursive: true })
  fs.writeFileSync(path.join(libPath, 'repository', '.catalog.json'), JSON.stringify(repoCatalog, null, 2), 'utf8')
}

/**
 * Seed a .guide.md file for a blog article, used by the assistant to
 * provide contextual background during Q&A.
 */
export function seedGuideFile(articleDir: string, background: string): void {
  fs.mkdirSync(articleDir, { recursive: true })
  const guide = `---\ntype: article-assistant\ntitle: 导读\ncreated: 2026-07-19\n---\n\n# 背景\n\n${background}\n`
  fs.writeFileSync(path.join(articleDir, '文章.guide.md'), guide, 'utf8')
}

/**
 * Seed state.json with writing-related fields pre-configured, such as
 * switching the briefing source to 'writing'.
 */
export function seedWritingSourceState(configDir: string): void {
  seedStateJson(configDir, {
    briefingSource: 'writing',
    writingListTab: 'articles',
    writingAssistantWidth: 320,
    writingAssistantOpen: false,
    assistantSearchEnabled: false,
    assistantThinkingEffort: 'off',
  })
}
