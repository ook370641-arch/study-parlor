/**
 * 基线测试：跑一次完整的当前 generateJobBriefing 链路
 * 记录所有 Tavily 调用次数、LLM 调用次数、耗时、输出内容
 *
 * 用法：
 *   node scripts/test-baseline-pipeline.js           # 完整生成
 *   BASELINE_DRY_RUN=1 node scripts/test-baseline-pipeline.js  # 仅跑搜索（不调LLM提取）
 */
import dotenv from 'dotenv'
dotenv.config()

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { loadEnv } from '../electron/env.js'
import { generateJobBriefing, normalizeJobBriefingConfig } from '../electron/lib/job-briefing.js'
import { normalizeJobProfile } from '../src/lib/job-briefing-defaults.js'

const DRY_RUN = !!process.env.BASELINE_DRY_RUN
const today = new Date().toISOString().slice(0, 10)

// ═══════════════════ 拦截器 ═══════════════════
let tavilyCalls = 0
let llmCalls = 0
const tavilyQueries = []
const llmDurations = []
const stageTimings = {}

// Monkey-patch searchWeb to count calls
const searchModule = await import('../electron/lib/search.js')
const origSearchWeb = searchModule.searchWeb
searchModule.searchWeb = async function(opts) {
  tavilyCalls++
  tavilyQueries.push({
    query: opts.query,
    maxResults: opts.maxResults,
    days: opts.days,
    domains: opts.includeDomains,
  })
  const start = Date.now()
  const result = await origSearchWeb(opts)
  const duration = Date.now() - start
  if (!stageTimings['search']) stageTimings['search'] = []
  stageTimings['search'].push({ query: opts.query.slice(0, 80), duration, results: result.length })
  return result
}

// Monkey-patch chatNonStream to count LLM calls
const kimiModule = await import('../electron/lib/kimi.js')
const origChatNonStream = kimiModule.chatNonStream
kimiModule.chatNonStream = async function(cfg, opts) {
  llmCalls++
  const start = Date.now()
  const result = await origChatNonStream(cfg, opts)
  const duration = Date.now() - start
  llmDurations.push(duration)
  return result
}

// Also need to patch the one imported by job-briefing
const briefingModule = await import('../electron/lib/job-briefing.js')

// ═══════════════════ Main ═══════════════════

async function main() {
  console.log('📋 求职简报基线测试 — 完整链路')
  console.log(`   时间: ${new Date().toISOString()}`)
  console.log(`   模式: ${DRY_RUN ? '干跑(仅搜索)' : '完整生成'}`)
  console.log('')

  // Load config
  const cfg = loadEnv({
    KIMI_API_KEY: process.env.KIMI_API_KEY,
    KIMI_BASE_URL: process.env.KIMI_BASE_URL,
    KIMI_MODEL: process.env.KIMI_MODEL,
    STUDY_LIBRARY_PATH: process.env.STUDY_LIBRARY_PATH || path.join(os.tmpdir(), 'study-parlor-baseline-test'),
  })
  fs.mkdirSync(cfg.libraryPath, { recursive: true })

  const config = normalizeJobBriefingConfig({})
  const profile = normalizeJobProfile({
    targetRoles: ['AI产品经理', '模型产品经理'],
    direction: '大模型/Agent 产品，偏评测与平台',
    skills: ['RAG', '提示词工程', '数据分析'],
    experience: 'AI 产品实习经历',
  })

  console.log(`   公司数: ${config.companies.filter(c => c.enabled).length}`)
  console.log(`   岗位: ${config.roleKeywords.join(', ')}`)
  console.log(`   城市: ${config.cities.join(', ')}`)
  console.log('')

  const overallStart = Date.now()
  let result
  try {
    result = await generateJobBriefing(cfg, config, profile, today, {
      emitProgress: (stage, detail) => {
        const elapsed = ((Date.now() - overallStart) / 1000).toFixed(0)
        console.log(`  [${elapsed}s] 📍 ${stage} ${detail || ''}`)
      },
    })
  } catch (err) {
    console.error(`\n❌ 生成失败: ${err.message}`)
    console.error(`   错误码: ${err.code}`)
  }
  const totalDuration = Date.now() - overallStart

  // ── 报告 ──
  console.log('\n' + '═'.repeat(70))
  console.log('📊 基线报告')
  console.log('═'.repeat(70))

  console.log(`\n⏱ 总耗时: ${(totalDuration / 1000).toFixed(1)}s (${(totalDuration / 60000).toFixed(1)}min)`)
  console.log(`📡 Tavily 调用: ${tavilyCalls} 次`)
  console.log(`🧠 LLM 调用: ${llmCalls} 次`)

  if (llmDurations.length > 0) {
    const sum = llmDurations.reduce((a, b) => a + b, 0)
    console.log(`   LLM 总耗时: ${(sum / 1000).toFixed(1)}s`)
    console.log(`   LLM 平均: ${(sum / llmDurations.length / 1000).toFixed(1)}s`)
    console.log(`   LLM 最长: ${(Math.max(...llmDurations) / 1000).toFixed(1)}s`)
  }

  console.log(`\n📡 Tavily 查询明细:`)
  tavilyQueries.forEach((q, i) => {
    console.log(`   ${i + 1}. "${q.query.slice(0, 100)}" [max=${q.maxResults}, days=${q.days}]`)
  })

  if (result) {
    console.log(`\n📝 输出:`)
    console.log(`   标题: ${result.title}`)
    console.log(`   内容长度: ${result.content.length} 字符`)
    console.log(`   文件: ${result.filePath}`)
    console.log(`   来源状态: ${JSON.stringify(result.sourceStatus)}`)

    // Count sections
    const sections = ['今日新动态', '与你最适配的岗位', '高频考察问题', '趋势解读']
    for (const s of sections) {
      const has = result.content.includes(`## ${s}`)
      const empty = result.content.includes('本期暂无')
      console.log(`   ${has ? '✅' : '❌'} ${s}${empty ? ' (暂无)' : ''}`)
    }

    // Show first 500 chars
    console.log(`\n📄 内容预览:`)
    console.log(result.content.slice(0, 500))
  }

  // ── 每条 Tavily 搜索耗时 ──
  if (stageTimings['search']) {
    const searches = stageTimings['search']
    console.log(`\n⏱ 搜索耗时明细:`)
    searches.forEach((s, i) => {
      console.log(`   ${i + 1}. ${(s.duration)}ms → ${s.results}条 | "${s.query}"`)
    })
  }

  // Save baseline
  const baselinePath = path.resolve(process.cwd(), 'scripts', 'baseline-result.json')
  fs.writeFileSync(baselinePath, JSON.stringify({
    timestamp: new Date().toISOString(),
    totalDuration,
    tavilyCalls,
    llmCalls,
    llmDurations,
    tavilyQueries,
    result: result ? {
      contentLength: result.content.length,
      filePath: result.filePath,
      sourceStatus: result.sourceStatus,
    } : null,
  }, null, 2))
  console.log(`\n📁 基线结果已保存: ${baselinePath}`)
}

main().catch(err => {
  console.error('基线测试失败:', err)
  process.exit(1)
})
