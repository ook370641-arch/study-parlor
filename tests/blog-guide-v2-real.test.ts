/**
 * 真实 API 集成测试：博客导读 v2 的规划与生成（不含 Tavily 搜索——
 * getSearchApiKey 依赖 Electron safeStorage，node 环境不可用）。
 *
 * @vitest-environment node
 *
 * 默认运行（真实 API 调用，耗时约 1-3 分钟）。需要项目根目录 .env 配置
 * KIMI_API_KEY（非占位符）。
 * 回放：REAL_TEST_REPLAY=1 npx vitest run tests/blog-guide-v2-real.test.ts
 */

import { describe, it, expect, beforeAll } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { loadEnv, type AppConfig } from '../electron/env'
import { chatNonStream } from '../electron/lib/kimi'
import {
  buildBlogGuidePlanPrompt,
  buildBlogGuideV2UserPrompt,
  isValidGuideBlogV2,
  parseGuidePlan,
} from '../electron/lib/guide-v2'
import { extractJsonObject } from '../electron/lib/extract-json'

const BLOG_FIXTURE = `## The case for agents

Agents are models using tools in a loop. We argue most failures are context failures.

## Building effective context

Context engineering means curating what enters the context window at each step.

## Evaluation and iteration

Without evals, agent improvements are guesswork. We describe a lightweight eval harness.`

const REPLAY_FILE = path.resolve(__dirname, 'fixtures', 'blog-guide-v2-real-guide.json')
const REPLAY = process.env.REAL_TEST_REPLAY === '1'

function readDotEnv(): Record<string, string> {
  const envPath = path.resolve(process.cwd(), '.env')
  if (!fs.existsSync(envPath)) return {}
  const env: Record<string, string> = {}
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z0-9_]+)=(.*)$/)
    if (m) env[m[1]] = m[2].trim()
  }
  return env
}

let cfg: AppConfig
beforeAll(() => {
  const dotEnv = readDotEnv()
  for (const [k, v] of Object.entries(dotEnv)) {
    if (!process.env[k]) process.env[k] = v
  }
  // 密钥缺失/占位符时让测试失败（rules e2e §1c），loadEnv 会抛出带指引的错误
  cfg = loadEnv({
    KIMI_API_KEY: process.env.KIMI_API_KEY,
    KIMI_BASE_URL: process.env.KIMI_BASE_URL,
    KIMI_MODEL: process.env.KIMI_MODEL,
    STUDY_LIBRARY_PATH: process.env.STUDY_LIBRARY_PATH || path.join(__dirname, 'fixtures'),
  })
})

describe('blog guide v2 real API', () => {
  it('planning produces valid queries within entry range', async () => {
    if (REPLAY) return
    const raw = await chatNonStream(cfg, {
      messages: [{ role: 'user', content: buildBlogGuidePlanPrompt(BLOG_FIXTURE, 'Agents') }],
      temperature: 0.3,
      thinking: { type: 'disabled' },
    })
    const plan = parseGuidePlan(raw, 10)
    expect(plan.length).toBeGreaterThan(0)
    for (const q of plan) {
      expect(q.query.length).toBeGreaterThan(0)
      expect(q.entries.length).toBeGreaterThan(0)
    }
  }, 120_000)

  it('generation yields a valid blog v2 guide (background + summary chunks)', async () => {
    let raw: string
    if (REPLAY) {
      raw = fs.readFileSync(REPLAY_FILE, 'utf8')
    } else {
      const system = fs.readFileSync(path.resolve(process.cwd(), 'electron/prompts/blog-guide-v2.md'), 'utf8')
      raw = await chatNonStream(cfg, {
        messages: [
          { role: 'system', content: system },
          {
            role: 'user',
            content: buildBlogGuideV2UserPrompt({
              articleContent: BLOG_FIXTURE,
              articleTitle: 'Agents',
              materials: new Map(),
              entryCount: 3,
            }),
          },
        ],
        temperature: 0.7,
        thinking: { type: 'enabled', reasoning_effort: 'max' },
      })
      fs.mkdirSync(path.dirname(REPLAY_FILE), { recursive: true })
      fs.writeFileSync(REPLAY_FILE, raw, 'utf8')
    }
    const extracted = extractJsonObject(raw)
    expect(extracted).toBeTruthy()
    const guide = JSON.parse(extracted!)
    expect(isValidGuideBlogV2(guide)).toBe(true)
    expect(guide.background.trim().length).toBeGreaterThan(0)
    for (const chunk of guide.chunks) {
      // 章节总结应有实质内容
      expect(chunk.summary!.length).toBeGreaterThan(10)
    }
  }, 300_000)
})
