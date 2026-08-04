/**
 * 真实 API 集成测试：digest 导读 v2 的规划与生成（不含 Tavily 搜索——
 * getSearchApiKey 依赖 Electron safeStorage，node 环境不可用；搜索层由
 * 单测与 E2E mock 覆盖）。
 *
 * @vitest-environment node
 *
 * 默认运行（真实 API 调用，耗时约 1-3 分钟）。需要项目根目录 .env 配置
 * KIMI_API_KEY（非占位符）。
 * 回放：REAL_TEST_REPLAY=1 npx vitest run tests/guide-v2-real.test.ts
 */

import { describe, it, expect, beforeAll } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { loadEnv, type AppConfig } from '../electron/env'
import { chatNonStream } from '../electron/lib/kimi'
import {
  buildGuidePlanPrompt,
  buildGuideV2UserPrompt,
  isValidGuideV2,
  parseGuidePlan,
} from '../electron/lib/guide-v2'
import { extractJsonObject } from '../electron/lib/extract-json'

const DIGEST_FIXTURE = `## X / Twitter

### AI researcher Andrej Karpathy (karpathy on X)
Karpathy 用 Opus 5 将《指环王》片段渲染为 Three.js 动画，花费 2 小时和 10 美元。

### CEO of Box Aaron Levie (levie on X)
Levie 预测 AI 在日常生产力上的影响将趋平，但在深度专业领域将垂直加速。

## 原始来源
### karpathy
- [tweet](https://x.com/karpathy/status/1)
### levie
- [tweet](https://x.com/levie/status/1)`

const REPLAY_FILE = path.resolve(__dirname, 'fixtures', 'guide-v2-real-guide.json')
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

describe('guide v2 real API', () => {
  it('planning produces valid queries within entry range', async () => {
    if (REPLAY) return // 规划结果不在回放范围
    const raw = await chatNonStream(cfg, {
      messages: [{ role: 'user', content: buildGuidePlanPrompt(DIGEST_FIXTURE, '夜航简报') }],
      temperature: 0.3,
      thinking: { type: 'disabled' },
    })
    const plan = parseGuidePlan(raw, 10)
    for (const q of plan) {
      expect(q.query.length).toBeGreaterThan(0)
      expect(q.entries.length).toBeGreaterThan(0)
    }
  }, 120_000)

  it('generation yields a valid v2 guide (background + context chunks)', async () => {
    let raw: string
    if (REPLAY) {
      raw = fs.readFileSync(REPLAY_FILE, 'utf8')
    } else {
      const system = fs.readFileSync(path.resolve(process.cwd(), 'electron/prompts/digest-guide-v2.md'), 'utf8')
      raw = await chatNonStream(cfg, {
        messages: [
          { role: 'system', content: system },
          {
            role: 'user',
            content: buildGuideV2UserPrompt({
              articleContent: DIGEST_FIXTURE,
              articleTitle: '夜航简报',
              materials: new Map(),
              entryCount: 2,
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
    expect(isValidGuideV2(guide)).toBe(true)
    expect(guide.background.trim().length).toBeGreaterThan(0)
    for (const chunk of guide.chunks) {
      // 背景铺陈不应是复述：长度下限兜底
      expect(chunk.context.length).toBeGreaterThan(30)
    }
  }, 300_000)
})
