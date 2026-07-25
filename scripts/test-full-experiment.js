/**
 * 全面搜索+LLM策略实验
 *
 * 测试矩阵：
 *   Tavily: 5种搜索粒度 × 3个阶段(events/jobs/questions)
 *   LLM:   逐条提取 vs 批量提取 vs 高思考批量提取
 *
 * 用法：node scripts/test-full-experiment.js
 */
import dotenv from 'dotenv'
import fs from 'node:fs'
import path from 'node:path'

dotenv.config()

const TAVILY_KEY = process.env.TAVILY_API_KEY
const TAVILY_URL = process.env.TAVILY_API_URL || 'https://api.tavily.com/search'
const LLM_URL = (process.env.KIMI_BASE_URL || 'https://api.deepseek.com/v1').replace(/\/+$/, '') + '/chat/completions'
const LLM_KEY = process.env.KIMI_API_KEY
const LLM_MODEL = process.env.KIMI_MODEL || 'deepseek-v4-pro'

const COMPANIES = [
  '字节跳动', '阿里巴巴', '腾讯', '百度', '美团',
  'MiniMax', '智谱AI', '月之暗面', '零一万物', '百川智能'
]
const BIG_TECH = COMPANIES.slice(0, 5)
const AI_STARTUP = COMPANIES.slice(5)
const CITIES = '北京 上海 杭州 深圳'
const ROLES = 'AI产品经理 大模型产品经理 Agent产品经理'

// ═══════════════════ Tavily Search ═══════════════════

async function tavilySearch(opts) {
  const body = {
    api_key: TAVILY_KEY,
    query: opts.query,
    search_depth: 'basic',
    max_results: opts.maxResults ?? 5,
    include_answer: false,
  }
  if (opts.days) body.days = opts.days
  if (opts.includeDomains?.length) body.include_domains = opts.includeDomains

  const res = await fetch(TAVILY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`)
  }
  const data = await res.json()
  return data.results || []
}

// ═══════════════════ LLM ═══════════════════

async function llmChat(opts) {
  const body = {
    model: LLM_MODEL,
    messages: opts.messages,
    temperature: opts.temperature ?? 0.3,
    max_tokens: opts.maxTokens ?? 4096,
  }
  if (opts.thinking) {
    body.thinking = { type: 'enabled' }
    if (opts.thinkingEffort) body.reasoning_effort = opts.thinkingEffort
  } else {
    body.thinking = { type: 'disabled' }
  }

  const start = Date.now()
  const res = await fetch(LLM_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${LLM_KEY}`,
      'Content-Type': 'application/json',
      'User-Agent': 'claude-code/0.1.0',
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`LLM HTTP ${res.status}: ${text.slice(0, 200)}`)
  }
  const data = await res.json()
  const elapsed = Date.now() - start
  return {
    content: data.choices?.[0]?.message?.content || '',
    elapsed,
  }
}

// ═══════════════════ 搜索策略定义 ═══════════════════

const EVENT_STRATEGIES = {
  'A-逐家(当前方案)': {
    calls: 11,
    async run() {
      const all = []
      for (const c of COMPANIES) {
        const q = `${c} 2026秋招 2027届 校招 宣讲会 AI产品 招聘 ${CITIES}`
        all.push(...await tavilySearch({ query: q, maxResults: 5, days: 7 }))
      }
      // + 汇总
      all.push(...await tavilySearch({
        query: `AI产品 2026秋招 2027届 校招 汇总 ${CITIES}`,
        maxResults: 5, days: 7,
        includeDomains: ['nowcoder.com', 'yingjiesheng.com'],
      }))
      return all
    }
  },
  'B-全量合并': {
    calls: 1,
    async run() {
      return await tavilySearch({
        query: `2026秋招 AI产品经理 校招开启 ${COMPANIES.join(' ')}`,
        maxResults: 15, days: 7,
      })
    }
  },
  'C-双层(社区+全网)': {
    calls: 2,
    async run() {
      const [community, broad] = await Promise.all([
        tavilySearch({
          query: '2026秋招 2027届 校招 AI产品 大模型 提前批 汇总',
          maxResults: 10, days: 7,
          includeDomains: ['nowcoder.com', 'yingjiesheng.com'],
        }),
        tavilySearch({
          query: `2026秋招 AI产品经理 校招 宣讲会 ${BIG_TECH.join(' ')} ${CITIES}`,
          maxResults: 10, days: 7,
        }),
      ])
      return [...community, ...broad]
    }
  },
  'D-三层(社区+大厂+创业)': {
    calls: 3,
    async run() {
      const [community, big, startup] = await Promise.all([
        tavilySearch({
          query: '2026秋招 2027届 校招 AI产品 提前批 汇总',
          maxResults: 8, days: 7,
          includeDomains: ['nowcoder.com', 'yingjiesheng.com'],
        }),
        tavilySearch({
          query: `2026秋招 AI产品经理 校招 ${BIG_TECH.join(' ')} ${CITIES}`,
          maxResults: 8, days: 7,
        }),
        tavilySearch({
          query: `2026秋招 AI产品经理 校招 ${AI_STARTUP.join(' ')} ${CITIES}`,
          maxResults: 8, days: 7,
        }),
      ])
      return [...community, ...big, ...startup]
    }
  },
  'E-极简单次': {
    calls: 1,
    async run() {
      return await tavilySearch({
        query: `2026秋招 校招 AI产品 大模型 ${COMPANIES.join(' ')} ${CITIES}`,
        maxResults: 20, days: 7,
      })
    }
  },
}

const JOB_STRATEGIES = {
  'A-逐公司(当前)': {
    calls: 5, // focus companies ~5
    async run() {
      const all = []
      for (const c of COMPANIES.slice(0, 5)) {
        const q = `${c} ${ROLES} 招聘 校招 2026 ${CITIES}`
        all.push(...await tavilySearch({ query: q, maxResults: 5, days: 30 }))
      }
      return all
    }
  },
  'B-全量合并': {
    calls: 1,
    async run() {
      return await tavilySearch({
        query: `${ROLES} 校招 2026 2027届 ${COMPANIES.join(' ')}`,
        maxResults: 20, days: 30,
      })
    }
  },
  'C-分层(大厂+创业)': {
    calls: 2,
    async run() {
      const [big, startup] = await Promise.all([
        tavilySearch({
          query: `${ROLES} 校招 2026 ${BIG_TECH.join(' ')} ${CITIES}`,
          maxResults: 10, days: 30,
        }),
        tavilySearch({
          query: `${ROLES} 校招 2026 ${AI_STARTUP.join(' ')} ${CITIES}`,
          maxResults: 10, days: 30,
        }),
      ])
      return [...big, ...startup]
    }
  },
}

const QUESTION_STRATEGIES = {
  'A-逐公司(当前)': {
    calls: 4,
    async run() {
      const all = []
      for (const c of COMPANIES.slice(0, 3)) {
        const q = `${c} AI产品经理 面经 面试题`
        all.push(...await tavilySearch({
          query: q, maxResults: 5, days: 90,
          includeDomains: ['nowcoder.com', 'yingjiesheng.com', 'zhihu.com', 'xiaohongshu.com'],
        }))
      }
      // fallback
      all.push(...await tavilySearch({
        query: 'AI产品经理 面经 高频问题',
        maxResults: 5, days: 90,
        includeDomains: ['nowcoder.com', 'zhihu.com', 'xiaohongshu.com'],
      }))
      return all
    }
  },
  'B-全量合并': {
    calls: 1,
    async run() {
      return await tavilySearch({
        query: `AI产品经理 面经 面试题 高频 ${COMPANIES.slice(0, 5).join(' ')}`,
        maxResults: 15, days: 90,
        includeDomains: ['nowcoder.com', 'zhihu.com', 'xiaohongshu.com'],
      })
    }
  },
}

// ═══════════════════ LLM 提取策略 ═══════════════════

const EVENT_EXTRACT_PROMPT_INDIVIDUAL = (company, today, content) => `# 求职新动态提取

你正在从搜索结果中提取国内 AI 产品相关的求职新动态。

目标公司：${company}
当前日期：${today}

搜索结果：
\`\`\`
${content}
\`\`\`

要求：
1. 只输出 JSON，不要 markdown 代码块，不要解释。
2. 输出格式：{"events": [{"company":"公司名","eventType":"秋招开启|新岗位|线下活动|宣讲会|其他","title":"事件标题","date":"YYYY-MM-DD","summary":"2-3句摘要","url":"原始链接"}]}
3. 只保留与求职/招聘直接相关的事件。
4. 今天是${today}，只保留面向2026届/2027届的活跃事件，丢弃面向2025届及更早的。
5. 没有有效事件时返回 {"events": []}。
6. eventType 只取五个值之一。
7. 空字段用 ""。`

const EVENT_EXTRACT_PROMPT_BATCH = (companies, today, content) => `# 求职新动态批量提取

你正在从搜索结果中提取国内 AI 产品相关的求职新动态。

关注公司列表：${companies.join('、')}
当前日期：${today}

搜索结果（可能覆盖多家公司）：
\`\`\`
${content}
\`\`\`

要求：
1. 只输出 JSON，不要 markdown 代码块，不要解释。
2. 输出格式：{"events": [{"company":"公司名","eventType":"秋招开启|新岗位|线下活动|宣讲会|其他","title":"事件标题","date":"YYYY-MM-DD","summary":"2-3句摘要","url":"原始链接"}]}
3. 只保留与求职/招聘直接相关的事件；公司新闻、融资、产品发布不算。
4. 今天是${today}，只保留面向2026届/2027届的活跃事件。
5. 同一事件可能在多个搜索结果中出现，去重保留最完整的一条。
6. 仅输出关注公司列表中公司的事件，其他公司跳过。
7. 没有有效事件时返回 {"events": []}。
8. eventType 只取五个值之一。
9. 空字段用 ""。`

async function dedupResults(results) {
  const seen = new Set()
  return results.filter(r => {
    const key = r.url.replace(/\?.*$/, '').replace(/\/+$/, '')
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

async function extractEventsFromResults(results, companies, today, strategy) {
  const unique = await dedupResults(results)
  const content = unique.map((r, i) =>
    `[${i + 1}] 标题: ${r.title}\nURL: ${r.url}\n摘要: ${r.content}`
  ).join('\n\n')

  if (strategy === 'batch') {
    const prompt = EVENT_EXTRACT_PROMPT_BATCH(companies, today, content.slice(0, 25000))
    return await llmChat({
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      thinking: true,
      thinkingEffort: 'high',
      maxTokens: 4096,
    })
  }

  if (strategy === 'batch-no-think') {
    const prompt = EVENT_EXTRACT_PROMPT_BATCH(companies, today, content.slice(0, 25000))
    return await llmChat({
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      thinking: false,
      maxTokens: 4096,
    })
  }

  // individual
  const allEvents = []
  for (const c of companies.slice(0, 4)) {
    const relevant = unique.filter(r =>
      r.title.includes(c) || r.content.includes(c) || r.url.includes(c)
    ).slice(0, 5)
    if (relevant.length === 0) continue
    const cContent = relevant.map((r, i) =>
      `[${i + 1}] 标题: ${r.title}\nURL: ${r.url}\n摘要: ${r.content}`
    ).join('\n\n')
    const { content: llmOut } = await llmChat({
      messages: [{ role: 'user', content: EVENT_EXTRACT_PROMPT_INDIVIDUAL(c, today, cContent.slice(0, 8000)) }],
      temperature: 0.3,
      thinking: false,
      maxTokens: 2048,
    })
    try {
      const json = JSON.parse(llmOut.replace(/```json\n?/g, '').replace(/```/g, '').trim())
      if (Array.isArray(json.events)) allEvents.push(...json.events)
    } catch {}
  }
  return { content: JSON.stringify({ events: allEvents }), elapsed: 0 }
}

// ═══════════════════ 主实验 ═══════════════════

async function runSearchExperiments(label, strategies) {
  console.log(`\n📡 ${label}`)
  console.log('─'.repeat(60))
  const results = {}
  for (const [name, s] of Object.entries(strategies)) {
    const start = Date.now()
    try {
      const data = await s.run()
      const unique = await dedupResults(data)
      const domains = {}
      for (const r of unique) {
        try { const h = new URL(r.url).hostname; domains[h] = (domains[h] || 0) + 1 } catch {}
      }
      const elapsed = Date.now() - start
      results[name] = {
        calls: s.calls, total: data.length, unique: unique.length,
        domains, elapsed, ok: true,
        efficiency: (unique.length / s.calls).toFixed(1),
        topDomains: Object.entries(domains).sort((a, b) => b[1] - a[1]).slice(0, 5),
      }
      console.log(`  ✅ ${name}: ${data.length}条(${unique.length}唯一) · ${s.calls}次调用 · ${elapsed}ms · ${(unique.length/s.calls).toFixed(1)}条/次`)
      console.log(`     来源: ${results[name].topDomains.map(([d,n]) => `${d}(${n})`).join(', ')}`)
    } catch (err) {
      results[name] = { calls: s.calls, total: 0, unique: 0, domains: {}, elapsed: Date.now() - start, ok: false, error: err.message }
      console.log(`  ❌ ${name}: ${err.message}`)
    }
  }
  return results
}

async function runLLMExperiment(label, results, companies, today) {
  console.log(`\n🧠 ${label}`)
  console.log('─'.repeat(60))

  const strategies = ['individual', 'batch-no-think', 'batch']
  const outcomes = {}

  for (const strategy of strategies) {
    const start = Date.now()
    try {
      const { content, elapsed } = await extractEventsFromResults(results, companies, today, strategy)
      outcomes[strategy] = {
        elapsed,
        length: content.length,
        ok: true,
        preview: content.slice(0, 200),
      }
      // Count events extracted
      let eventCount = 0
      try {
        const json = JSON.parse(content.replace(/```json\n?/g, '').replace(/```/g, '').trim())
        eventCount = Array.isArray(json.events) ? json.events.length : 0
      } catch {}
      console.log(`  ✅ ${strategy}: ${eventCount}个事件 · ${content.length}字符 · ${(elapsed/1000).toFixed(1)}s`)
      console.log(`     ${content.slice(0, 150).replace(/\n/g, ' ')}...`)
    } catch (err) {
      outcomes[strategy] = { elapsed: Date.now() - start, length: 0, ok: false, error: err.message }
      console.log(`  ❌ ${strategy}: ${err.message}`)
    }
  }
  return outcomes
}

// ═══════════════════ Main ═══════════════════

async function main() {
  console.log('🔬 Study Parlor Tavily + LLM 全面策略实验')
  console.log(`   关注公司: ${COMPANIES.length}家 | API: Tavily + DeepSeek`)
  console.log(`   开始时间: ${new Date().toISOString()}`)

  const today = new Date().toISOString().slice(0, 10)
  const allResults = {}

  // ── Phase 1: Search Strategy Comparison ──
  console.log('\n' + '═'.repeat(70))
  console.log('📡 Phase 1: Tavily 搜索策略对比')
  console.log('═'.repeat(70))

  allResults.events = await runSearchExperiments('阶段① 发现动态 (Events)', EVENT_STRATEGIES)
  allResults.jobs = await runSearchExperiments('阶段③ 岗位搜索 (Jobs)', JOB_STRATEGIES)
  allResults.questions = await runSearchExperiments('阶段④ 面经问题 (Questions)', QUESTION_STRATEGIES)

  // ── Phase 2: LLM Extraction Strategy ──
  console.log('\n' + '═'.repeat(70))
  console.log('🧠 Phase 2: LLM 提取策略对比')
  console.log('═'.repeat(70))

  // Use the best search strategy's results for LLM experiments
  const bestEventStrategy = Object.entries(allResults.events)
    .filter(([, r]) => r.ok)
    .sort((a, b) => b[1].efficiency - a[1].efficiency)[0]

  if (bestEventStrategy) {
    // Re-run the best strategy to get fresh results for LLM
    const bestName = bestEventStrategy[0]
    console.log(`   使用最佳搜索策略 "${bestName}" 的结果进行 LLM 提取对比`)
    const freshResults = await EVENT_STRATEGIES[bestName].run()
    const deduped = await dedupResults(freshResults)
    console.log(`   搜索结果: ${freshResults.length}条 (${deduped.length}唯一)`)

    allResults.llmExtraction = await runLLMExperiment(
      '事件提取策略对比',
      deduped,
      COMPANIES,
      today,
    )
  }

  // ── Phase 3: Summary ──
  console.log('\n' + '═'.repeat(70))
  console.log('📊 Phase 3: 综合汇总')
  console.log('═'.repeat(70))

  // Best search strategy per stage
  console.log('\n🏆 各阶段最佳搜索策略:')
  for (const [stage, data] of Object.entries(allResults)) {
    if (stage === 'llmExtraction') continue
    const entries = Object.entries(data).filter(([, r]) => r.ok)
    if (entries.length === 0) continue

    // Score: efficiency weighted, but also consider unique count
    const scored = entries.map(([name, r]) => ({
      name,
      calls: r.calls,
      unique: r.unique,
      efficiency: parseFloat(r.efficiency),
      elapsed: r.elapsed,
      score: r.unique * 0.6 + parseFloat(r.efficiency) * 10 * 0.4,
    })).sort((a, b) => b.score - a.score)

    console.log(`\n  ${stage}:`)
    console.log(`  ${'策略'.padEnd(28)} ${'调用'.padStart(5)} ${'唯一URL'.padStart(8)} ${'效率'.padStart(8)} ${'耗时'.padStart(8)} ${'得分'.padStart(8)}`)
    for (const s of scored) {
      const marker = s === scored[0] ? '★' : ' '
      console.log(`  ${marker} ${s.name.padEnd(26)} ${String(s.calls).padStart(5)} ${String(s.unique).padStart(8)} ${s.efficiency.toFixed(1).padStart(8)} ${(s.elapsed + 'ms').padStart(8)} ${s.score.toFixed(1).padStart(8)}`)
    }
  }

  // LLM strategy comparison
  if (allResults.llmExtraction) {
    console.log('\n🧠 LLM 提取策略对比:')
    for (const [name, r] of Object.entries(allResults.llmExtraction)) {
      if (r.ok) {
        const evCount = (r.preview.match(/"company"/g) || []).length
        console.log(`  ${name}: ${r.length}字符 · ${(r.elapsed/1000).toFixed(1)}s · ~${evCount}个事件`)
      }
    }
  }

  // ── Recommended Configuration ──
  console.log('\n' + '═'.repeat(70))
  console.log('💡 推荐最优配置')
  console.log('═'.repeat(70))

  const totalCallsCurrent = 11 + 20 + 5 + 4 // events + official + jobs + questions
  const bestEvents = Object.entries(allResults.events).filter(([,r]) => r.ok)
    .sort((a, b) => parseFloat(b[1].efficiency) - parseFloat(a[1].efficiency))[0]
  const bestJobs = Object.entries(allResults.jobs).filter(([,r]) => r.ok)
    .sort((a, b) => parseFloat(b[1].efficiency) - parseFloat(a[1].efficiency))[0]
  const bestQuestions = Object.entries(allResults.questions).filter(([,r]) => r.ok)
    .sort((a, b) => parseFloat(b[1].efficiency) - parseFloat(a[1].efficiency))[0]

  const newCalls = (bestEvents?.[1]?.calls || 2) + (bestJobs?.[1]?.calls || 1) + (bestQuestions?.[1]?.calls || 1)

  console.log(`
  ┌─────────────────────┬──────────────┬──────────────┬──────────┐
  │ 阶段                │ 当前调用次数 │ 优化后次数   │ 降幅     │
  ├─────────────────────┼──────────────┼──────────────┼──────────┤
  │ ① 发现动态          │     11       │     ${String(bestEvents?.[1]?.calls || '?').padStart(2)}       │  ${(((11 - (bestEvents?.[1]?.calls || 2)) / 11) * 100).toFixed(0)}%     │
  │ ② 官方招聘页        │  最多20      │      0       │  100%    │
  │ ③ 岗位搜索          │      5       │     ${String(bestJobs?.[1]?.calls || '?').padStart(2)}       │  ${(((5 - (bestJobs?.[1]?.calls || 1)) / 5) * 100).toFixed(0)}%     │
  │ ④ 面经问题          │      4       │     ${String(bestQuestions?.[1]?.calls || '?').padStart(2)}       │  ${(((4 - (bestQuestions?.[1]?.calls || 1)) / 4) * 100).toFixed(0)}%     │
  ├─────────────────────┼──────────────┼──────────────┼──────────┤
  │ Tavily 合计         │    ~40       │     ${String(newCalls).padStart(2)}       │  ${(((40 - newCalls) / 40) * 100).toFixed(0)}%     │
  └─────────────────────┴──────────────┴──────────────┴──────────┘
  `)

  console.log('📋 推荐搜索词:')
  if (bestEvents) console.log(`  发现动态: ${bestEvents[0]}`)
  if (bestJobs) console.log(`  岗位搜索: ${bestJobs[0]}`)
  if (bestQuestions) console.log(`  面经问题: ${bestQuestions[0]}`)

  // Save results
  const outPath = path.resolve(process.cwd(), 'scripts', 'experiment-results.json')
  fs.writeFileSync(outPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    events: allResults.events,
    jobs: allResults.jobs,
    questions: allResults.questions,
    llmExtraction: allResults.llmExtraction,
    recommendation: {
      events: bestEvents?.[0],
      jobs: bestJobs?.[0],
      questions: bestQuestions?.[0],
      tavilyCallsBefore: 40,
      tavilyCallsAfter: newCalls,
      reduction: `${(((40 - newCalls) / 40) * 100).toFixed(0)}%`,
    }
  }, null, 2))
  console.log(`\n📁 完整结果已保存: ${outPath}`)
}

main().catch(err => {
  console.error('实验失败:', err)
  process.exit(1)
})
