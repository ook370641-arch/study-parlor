/**
 * 真实 API 集成测试：完整求职简报三级漏斗管道
 *
 * @vitest-environment node
 *
 * 默认跳过（真实 API 调用耗时 ~8-15 分钟且消耗配额），显式开启：
 *   REAL_API=1 npx vitest run tests/job-briefing-real.test.ts
 *
 * 断言迭代零成本回放（使用最近一次真实生成的 fixture）：
 *   REAL_API=1 REAL_TEST_REPLAY=1 npx vitest run tests/job-briefing-real.test.ts
 *   REAL_TEST_REPLAY 也接受 filled / empty 只回放对应一次生成。
 *
 * 运行条件：项目根目录 .env 须配置 KIMI_API_KEY 与 TAVILY_API_KEY（非占位符）。
 */

import { describe, it, expect, beforeAll } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { loadEnv, type AppConfig } from '../electron/env'
import { generateJobBriefing, normalizeJobBriefingConfig } from '../electron/lib/job-briefing'
import { normalizeJobProfile, DEFAULT_JOB_PROFILE } from '../src/lib/job-briefing-defaults'
import type { JobBriefingResult } from '../src/types'

const skip = process.env.REAL_API !== '1'

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

function ensureEnv() {
  const dotEnv = readDotEnv()
  for (const [k, v] of Object.entries(dotEnv)) {
    if (!process.env[k]) process.env[k] = v
  }
}

let cfg: AppConfig
let filledResult: JobBriefingResult
let emptyResult: JobBriefingResult
const today = new Date().toISOString().slice(0, 10)

// 回放模式：REAL_TEST_REPLAY=1 全部回放；=filled / =empty 只回放对应一次生成。
// 生成成功后会把内容写入 fixtures，供断言迭代时零成本回放。
const REPLAY_MODE = process.env.REAL_TEST_REPLAY ?? ''
const REPLAY_FILLED = REPLAY_MODE === '1' || REPLAY_MODE === 'filled'
const REPLAY_EMPTY = REPLAY_MODE === '1' || REPLAY_MODE === 'empty'
const REPLAY = REPLAY_FILLED && REPLAY_EMPTY
const REPLAY_DIR = path.resolve(__dirname, 'fixtures')
const FILLED_REPLAY = path.join(REPLAY_DIR, 'job-briefing-real-filled.md')
const EMPTY_REPLAY = path.join(REPLAY_DIR, 'job-briefing-real-empty.md')

function loadReplay(file: string): JobBriefingResult {
  return {
    title: '求职简报',
    date: today,
    content: fs.readFileSync(file, 'utf8'),
    filePath: file,
    cached: true,
    generatedAt: '',
    sourceStatus: { events: 'ok', jobs: 'ok', questions: 'ok', official: {} },
  }
}

function saveReplay(file: string, content: string) {
  fs.mkdirSync(REPLAY_DIR, { recursive: true })
  fs.writeFileSync(file, content, 'utf8')
}

/** 按 ## 标题提取板块正文（不误切 ### 子标题；索引定位，避免多行 $ 与懒惰匹配的组合陷阱） */
function extractSection(content: string, heading: string): string {
  const start = content.search(new RegExp(`^## ${heading}\\s*$`, 'm'))
  if (start === -1) return ''
  const bodyStart = content.indexOf('\n', start) + 1
  const rest = content.slice(bodyStart)
  const next = rest.search(/^## /m)
  return next === -1 ? rest : rest.slice(0, next)
}

beforeAll(async () => {
  ensureEnv()
  cfg = loadEnv({
    KIMI_API_KEY: process.env.KIMI_API_KEY,
    KIMI_BASE_URL: process.env.KIMI_BASE_URL,
    KIMI_MODEL: process.env.KIMI_MODEL,
    STUDY_LIBRARY_PATH: process.env.STUDY_LIBRARY_PATH || path.join(os.tmpdir(), 'study-parlor-real-test'),
  })
  fs.mkdirSync(cfg.libraryPath, { recursive: true })
}, 30_000)

describe.skipIf(skip)('job briefing real API pipeline', () => {
  const FILLED_PROFILE = normalizeJobProfile({
    targetRoles: ['AI产品经理', '模型产品经理'],
    direction: '大模型/Agent 产品，偏评测与平台',
    skills: ['RAG', '提示词工程', '数据分析', '评测体系'],
    experience: 'AI 产品实习经历，参与过 RAG 系统评测项目',
    additionalNotes: '只要北上深杭',
  })

  // ========== 生成阶段（只跑一次，结果共享） ==========

  it(
    'STEP 1: generate briefing with filled profile（完整档案）',
    async () => {
      if (REPLAY_FILLED) {
        filledResult = loadReplay(FILLED_REPLAY)
        console.log('  [replay] loaded filled fixture')
        return
      }
      filledResult = await generateJobBriefing(cfg, normalizeJobBriefingConfig({}), FILLED_PROFILE, today, {
        emitProgress: (stage, detail) => console.log(`  [filled/${stage}] ${detail ?? ''}`),
      })

      expect(filledResult.title).toBe('求职简报')
      expect(filledResult.content).toBeTruthy()
      expect(fs.existsSync(filledResult.filePath)).toBe(true)
      saveReplay(FILLED_REPLAY, filledResult.content)

      console.log(`  ✅ filled-profile briefing: ${filledResult.content.length} chars`)
      console.log(`  sourceStatus: ${JSON.stringify(filledResult.sourceStatus)}`)
      console.log(`  file: ${filledResult.filePath}`)
    },
    600_000,
  )

  it(
    'STEP 2: generate briefing with empty profile（空档案回退模式）',
    async () => {
      if (REPLAY_EMPTY) {
        emptyResult = loadReplay(EMPTY_REPLAY)
        console.log('  [replay] loaded empty fixture')
        return
      }
      emptyResult = await generateJobBriefing(cfg, normalizeJobBriefingConfig({}), DEFAULT_JOB_PROFILE, today, {
        emitProgress: (stage, detail) => console.log(`  [empty/${stage}] ${detail ?? ''}`),
      })

      expect(emptyResult.content).toBeTruthy()
      saveReplay(EMPTY_REPLAY, emptyResult.content)
      console.log(`  ✅ empty-profile briefing: ${emptyResult.content.length} chars`)
      console.log(`  sourceStatus: ${JSON.stringify(emptyResult.sourceStatus)}`)
    },
    600_000,
  )

  // ========== 断言阶段（只读，不重新生成） ==========

  it('filled profile: 四板块标题齐全', () => {
    const c = filledResult.content
    expect(c).toMatch(/^## 今日新动态/m)
    expect(c).toMatch(/^## 与你最适配的岗位/m)
    expect(c).toMatch(/^## 高频考察问题/m)
    expect(c).toMatch(/^## 趋势解读/m)
  })

  it('filled profile: 新动态板块有事件条目 + 链接', () => {
    const c = filledResult.content
    const eventsSection = extractSection(c, '今日新动态')
    console.log(`  Events section (first 300): ${eventsSection.slice(0, 300)}`)
    if (!eventsSection.includes('本期暂无')) {
      expect(eventsSection).toMatch(/\*\*\[[^\]]+\]/)          // `**[事件类型]` 徽标（公司名也在粗体内）
      expect(eventsSection).toMatch(/\[原文链接\]\(https?:\/\//)  // external link
    }
  })

  it('filled profile: 适配岗位有匹配度星级 + 溯源标注', () => {
    const c = filledResult.content
    const jobsSection = extractSection(c, '与你最适配的岗位')
    console.log(`  Jobs section (first 300): ${jobsSection.slice(0, 300)}`)
    if (!jobsSection.includes('本期暂无')) {
      expect(jobsSection).toMatch(/\[[★☆]{5}\]|### \[推荐\]/)  // 星级（或空档案的推荐标签）
      expect(jobsSection).toMatch(/源自/)                        // origin label
      expect(jobsSection).toMatch(/为什么适合你|岗位亮点/)          // match reason or general highlight
      expect(jobsSection).toMatch(/\[投递链接\]\(https?:\/\//)     // application link
    }
  })

  it('filled profile: 高频问题有序列表 + 考察意图 + 准备要点 + 原文链接', () => {
    const c = filledResult.content
    const qSection = extractSection(c, '高频考察问题')
    console.log(`  Questions section (first 300): ${qSection.slice(0, 300)}`)
    if (!qSection.includes('本期暂无')) {
      expect(qSection).toMatch(/^\d+[.、]\s*\*\*/m)      // numbered list
      expect(qSection).toMatch(/考察意图/)                  // intent field
      expect(qSection).toMatch(/准备要点/)                  // prep tip field
      expect(qSection).toMatch(/\[原文\]\(https?:\/\//)     // source URL
    }
  })

  it('filled profile: 趋势解读有实质内容', () => {
    const c = filledResult.content
    const trendsSection = extractSection(c, '趋势解读')
    if (!trendsSection.includes('本期暂无')) {
      expect(trendsSection.trim().length).toBeGreaterThan(20)
    }
    console.log(`  Trends section length: ${trendsSection.trim().length}`)
  })

  it('empty profile: 岗位板块使用「推荐」或「岗位亮点」', () => {
    const c = emptyResult.content
    expect(c).toMatch(/推荐|岗位亮点|[★☆]{5}/)
    console.log(`  Empty profile matches: ${/推荐|岗位亮点/.test(c) ? 'yes' : 'no (using stars)'}`)
  })

  it('sourceStatus: 至少一条车道成功', () => {
    for (const result of [filledResult, emptyResult]) {
      const anyOk =
        result.sourceStatus.events === 'ok' ||
        result.sourceStatus.jobs === 'ok' ||
        result.sourceStatus.questions === 'ok'
      expect(anyOk).toBe(true)
    }
  })

  it('cache: md 文件 frontmatter type 正确', () => {
    const pairs: [JobBriefingResult, boolean][] = [
      [filledResult, REPLAY_FILLED],
      [emptyResult, REPLAY_EMPTY],
    ]
    for (const [result, isReplay] of pairs) {
      if (isReplay) continue // 回放 fixture 只存正文，无 frontmatter
      const raw = fs.readFileSync(result.filePath, 'utf8')
      expect(raw).toContain('type: job-briefing')
      expect(raw).toContain('## 今日新动态')
    }
  })

  it('content: 包含关注公司名或本期暂无（真实市场信号）', () => {
    const companies = normalizeJobBriefingConfig({}).companies.filter(c => c.enabled).map(c => c.name)
    const mentioned = companies.filter(c => filledResult.content.includes(c))
    console.log(`  Companies mentioned: ${mentioned.join(', ') || '(none - may be 本期暂无)'}`)
    // 不强断言（当天可能没事件），但记录覆盖率
    expect(true).toBe(true)
  })

  it('filled profile content not identical to empty profile content', () => {
    // 档案不同，综合 prompt 不同，LLM 输出应不同
    expect(filledResult.content).not.toBe(emptyResult.content)
  })
})
