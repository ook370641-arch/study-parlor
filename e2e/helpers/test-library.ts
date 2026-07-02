import { randomUUID } from 'node:crypto'
import * as fs from 'node:fs'
import * as path from 'node:path'

const TEST_LIBRARY_ROOT = path.join(process.cwd(), 'e2e', '.test-library')
const TEST_CONFIG_ROOT = path.join(process.cwd(), 'e2e', '.test-config')

export function createTestLibrary(): string {
  const id = `${Date.now()}-${randomUUID()}`
  const dir = path.join(TEST_LIBRARY_ROOT, id)
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

export async function cleanupTestLibrary(dir: string, keepOnFailure: boolean = false): Promise<void> {
  if (keepOnFailure) return
  fs.rmSync(dir, { recursive: true, force: true })
}

export function createTestConfigDir(): string {
  const id = `${Date.now()}-${randomUUID()}`
  const dir = path.join(TEST_CONFIG_ROOT, id)
  fs.mkdirSync(dir, { recursive: true })
  // Copy .env so the Electron main process can load credentials in isolation.
  const envPath = path.join(process.cwd(), '.env')
  if (fs.existsSync(envPath)) {
    fs.copyFileSync(envPath, path.join(dir, '.env'))
  }
  return dir
}

export async function cleanupTestConfigDir(dir: string, keepOnFailure: boolean = false): Promise<void> {
  if (keepOnFailure) return
  fs.rmSync(dir, { recursive: true, force: true })
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

  const diagramContent = `# 流程图

\`\`\`mermaid
graph TD
  A[开始] --> B[结束]
\`\`\`
`
  fs.writeFileSync(path.join(dir, '流程图.md'), diagramContent)
}

type GroupDef = { id: string; name: string; color?: string }
type GroupMapping = { dirName: string; groupId: string | null }

export function seedGroupState(
  libPath: string,
  groups: GroupDef[],
  mappings: GroupMapping[]
): void {
  const state = {
    groups,
    mappings,
  }
  fs.writeFileSync(
    path.join(libPath, '.study-groups.json'),
    JSON.stringify(state, null, 2)
  )
}

export function seedStateJson(
  configDir: string,
  partialState: Record<string, unknown>
): void {
  const statePath = path.join(configDir, 'state.json')
  const base = {
    profile: {
      name: 'E2E 测试员',
      profile_text: '',
      preferred_topics: [],
    },
    lastUsed: {
      difficulty: 'mid',
      temperature: 'balanced',
    },
    session_count: 0,
    groups: [],
    activeGroupId: null,
    groupInspirations: {},
    topicContinueSuggestions: {},
    unsavedSessions: [],
    pendingArchives: [],
    archiveResult: null,
    terminology: {},
  }
  fs.writeFileSync(
    statePath,
    JSON.stringify({ ...base, ...partialState }, null, 2)
  )
}

export function seedTerminology(
  configDir: string,
  terminology: Record<string, string>
): void {
  const statePath = path.join(configDir, 'state.json')
  const base = {
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
    archiveResult: null,
    terminology: {},
  }
  const state = fs.existsSync(statePath)
    ? JSON.parse(fs.readFileSync(statePath, 'utf8'))
    : base
  state.terminology = { ...state.terminology, ...terminology }
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf8')
}

export function seedWildCardInspiration(
  configDir: string,
  payload: { title: string; hook: string; topic: string }
): void {
  const statePath = path.join(configDir, 'state.json')
  const base = {
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
    archiveResult: null,
    terminology: {},
  }
  const state = fs.existsSync(statePath)
    ? JSON.parse(fs.readFileSync(statePath, 'utf8'))
    : base
  state.wildCardInspiration = payload
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf8')
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
