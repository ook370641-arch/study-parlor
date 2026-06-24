import fs from 'node:fs'
import path from 'node:path'

const TEST_LIBRARY_ROOT = path.join(process.cwd(), 'e2e', '.test-library')

export function createTestLibrary(): string {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const dir = path.join(TEST_LIBRARY_ROOT, id)
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

export async function cleanupTestLibrary(dir: string, keepOnFailure: boolean = false): Promise<void> {
  if (keepOnFailure) return
  try {
    fs.rmSync(dir, { recursive: true, force: true })
  } catch (err) {
    console.warn('[e2e] failed to cleanup test library:', dir, err)
  }
}

export function seedNewTopic(libPath: string, slug: string, title: string): void {
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
