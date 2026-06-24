import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

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
  const filePath = path.join(libPath, `${slug}.md`)
  const content = `---
title: ${title}
description: 自动生成用于 E2E 测试的主题
type: progress
created: '2026-06-24T00:00:00.000Z'
tags:
  - test
session_number: 1
difficulty: high
progress_summary: E2E fixture data
last_studied: '2026-06-24T00:00:00.000Z'
review_count: 0
---

# ${title}

这是 E2E 测试用的占位学习报告。
`
  fs.writeFileSync(filePath, content)
}

export function seedReviewableTopic(libPath: string, slug: string, title: string): void {
  const filePath = path.join(libPath, `${slug}.md`)
  const content = `---
title: ${title}
description: 自动生成用于 E2E 复习测试的主题
type: progress
created: '2026-05-01T00:00:00.000Z'
tags:
  - test
session_number: 2
difficulty: mid
progress_summary: E2E fixture data for review
last_studied: '2026-05-01T00:00:00.000Z'
review_count: 1
---

# ${title}

这是 E2E 复习测试用的占位学习报告。
`
  fs.writeFileSync(filePath, content)
}
