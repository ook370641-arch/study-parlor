/**
 * 质量评分实验 — Tavily 搜索 + LLM 提取全组合对比
 *
 * 设计：
 *   Phase 1: 所有搜索策略的结果 → LLM裁判评分(相关性/公司覆盖/内容类型)
 *   Phase 2: 所有LLM策略的提取结果 → LLM裁判评分(准确性/幻觉率/覆盖率)
 *   Phase 3: 最优组合验证
 *
 * 用法：node scripts/test-quality-experiment.js
 */
import dotenv from 'dotenv'
import fs from 'node:fs'
import path from 'node:path'

dotenv.config()

const TAVILY_KEY = process.env.TAVILY_API_KEY
const TAVILY_URL = (process.env.TAVILY_API_URL || 'https://api.tavily.com/search')
const LLM_URL = (process.env.KIMI_BASE_URL || 'https://api.deepseek.com/v1').replace(/\/+$/, '') + '/chat/completions'
const LLM_KEY = process.env.KIMI_API_KEY
const LLM_MODEL = process.env.KIMI_MODEL || 'deepseek-v4-pro'

const ALL_COMPANIES = [
  '字节跳动', '阿里巴巴', '腾讯', '百度', '美团',
  'MiniMax', '智谱AI', '月之暗面', '零一万物', '百川智能'
]
const BIG_TECH = ALL_COMPANIES.slice(0, 5)
const AI_STARTUP = ALL_COMPANIES.slice(5)
const CITIES = '北京 上海 杭州 深圳'
const ROLES = 'AI产品经理 大模型产品经理 Agent产品经理'
const TODAY = new Date().toISOString().slice(0, 10)

// ═══════════════════ 工具函数 ═══════════════════

async function tavilySearch(opts) {
  const body = {
    api_key: TAVILY_KEY, query: opts.query, search_depth: 'basic',
    max_results: opts.maxResults ?? 5, include_answer: false,
  }
  if (opts.days) body.days = opts.days
  if (opts.includeDomains?.length) body.include_domains = opts.includeDomains
  const res = await fetch(TAVILY_URL, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`Tavily ${res.status}`)
  const data = await res.json()
  return data.results || []
}

async function llmChat(opts) {
  const body = {
    model: LLM_MODEL, messages: opts.messages,
    temperature: opts.temperature ?? 0.3, max_tokens: opts.maxTokens ?? 4096,
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
    headers: { 'Authorization': `Bearer ${LLM_KEY}`, 'Content-Type': 'application/json', 'User-Agent': 'claude-code/0.1.0' },
    body: JSON.stringify(body),
  })
  const data = await res.json()
  return { content: data.choices?.[0]?.message?.content || '', elapsed: Date.now() - start }
}

function dedupResults(results) {
  const seen = new Set()
  return results.filter(r => {
    const k = (r.url || '').replace(/\?.*$/, '').replace(/\/+$/, '')
    if (!k || seen.has(k)) return false
    seen.add(k)
    return true
  })
}

function safeJsonParse(text) {
  try {
    const cleaned = text.replace(/```json\s*/g, '').replace(/```/g, '').trim()
    // Find the first { or [
    const start = Math.min(
      cleaned.indexOf('{') === -1 ? Infinity : cleaned.indexOf('{'),
      cleaned.indexOf('[') === -1 ? Infinity : cleaned.indexOf('[')
    )
    if (start === Infinity) return null
    return JSON.parse(cleaned.slice(start))
  } catch {
    return null
  }
}

// ═══════════════════ Phase 1: 搜索策略定义 ═══════════════════

const SEARCH_STRATEGIES = {
  'A-逐家(当前)': {
    calls: 11, desc: '每家公司独立搜索 + 1次汇总',
    async run() {
      const all = []
      for (const c of ALL_COMPANIES) {
        const q = `${c} 2026秋招 2027届 校招 宣讲会 AI产品 招聘 ${CITIES}`
        all.push(...await tavilySearch({ query: q, maxResults: 5, days: 7 }))
      }
      all.push(...await tavilySearch({
        query: `AI产品 2026秋招 2027届 校招 汇总 ${CITIES}`,
        maxResults: 5, days: 7,
        includeDomains: ['nowcoder.com', 'yingjiesheng.com'],
      }))
      return all
    }
  },
  'B-全量合并': {
    calls: 1, desc: '所有公司合并为一个搜索词',
    async run() {
      return await tavilySearch({
        query: `2026秋招 AI产品经理 校招开启 ${ALL_COMPANIES.join(' ')}`,
        maxResults: 15, days: 7,
      })
    }
  },
  'C-双层(社区+全网)': {
    calls: 2, desc: '社区限域 + 全网大厂',
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
    calls: 3, desc: '社区 + 大厂 + AI创业',
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
    calls: 1, desc: '一个超长搜索词全覆盖',
    async run() {
      return await tavilySearch({
        query: `2026秋招 校招 AI产品 大模型 ${ALL_COMPANIES.join(' ')} ${CITIES}`,
        maxResults: 20, days: 7,
      })
    }
  },
}

// ═══════════════════ Phase 1: 搜索结果质量评分 ═══════════════════

const SEARCH_QUALITY_JUDGE_PROMPT = (companies, resultsJson) => `你是一位招聘信息质量评估员。请对以下搜索结果逐一评分。

关注公司：${companies.join('、')}
目标场景：2026届/2027届校招 AI产品经理岗位

搜索结果（JSON数组，每个元素有 index/title/url/content）：
${resultsJson}

请对每条结果评分，返回 JSON 数组：
[{
  "index": 0,
  "relevance": 1-5,         // 相关性：5=直接是AI产品校招信息，1=完全无关
  "contentType": "校招公告|岗位信息|面经|行业新闻|无关",
  "companiesFound": ["公司名"],  // 结果中提到的关注公司
  "hasActionableInfo": true/false,  // 是否含日期/投递链接/岗位描述
  "noiseLevel": 1-5,        // 噪音程度：1=高价值信号，5=纯噪音
  "brief": "一句话说明为什么给这个分"
}]

只输出 JSON 数组，以 [ 开头、以 ] 结尾。`

async function scoreSearchResults(strategyName, results) {
  const unique = dedupResults(results)
  if (unique.length === 0) return { scores: [], avgRelevance: 0, actionableCount: 0, noiseRatio: 0, companyCoverage: {} }

  // Build compact result list for judge
  const compactResults = unique.map((r, i) => ({
    index: i,
    title: r.title?.slice(0, 100) || '',
    url: r.url?.slice(0, 120) || '',
    content: (r.content || '').slice(0, 300),
  }))

  const prompt = SEARCH_QUALITY_JUDGE_PROMPT(ALL_COMPANIES, JSON.stringify(compactResults))
  const { content } = await llmChat({
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.1, thinking: false, maxTokens: 4096,
  })

  const scores = safeJsonParse(content)
  if (!Array.isArray(scores)) {
    console.log(`     ⚠️ 评分解析失败，原始输出: ${content.slice(0, 200)}`)
    return { scores: [], avgRelevance: 0, actionableCount: 0, noiseRatio: 0, companyCoverage: {}, rawOutput: content.slice(0, 500) }
  }

  const valid = scores.filter(s => s && typeof s.relevance === 'number')
  const avgRelevance = valid.length > 0 ? (valid.reduce((a, s) => a + s.relevance, 0) / valid.length).toFixed(2) : 0
  const actionableCount = valid.filter(s => s.hasActionableInfo).length
  const noiseRatio = valid.length > 0 ? (valid.filter(s => s.noiseLevel >= 4).length / valid.length * 100).toFixed(0) : 0

  // Company coverage
  const companyCoverage = {}
  for (const s of valid) {
    for (const c of (s.companiesFound || [])) {
      companyCoverage[c] = (companyCoverage[c] || 0) + 1
    }
  }

  return { scores: valid, avgRelevance: parseFloat(avgRelevance), actionableCount, noiseRatio: parseInt(noiseRatio), companyCoverage }
}

// ═══════════════════ Phase 2: LLM 提取策略 ═══════════════════

const EVENT_EXTRACT_BATCH = (companies, today, content) => `# 求职新动态提取

从以下搜索结果中提取 ${companies.length} 家关注公司的2026届校招新动态。

关注公司：${companies.join('、')}
当前日期：${today}

搜索结果：
\`\`\`
${content}
\`\`\`

要求：
1. 只输出 JSON（以 { 开头、以 } 结尾）：{"events":[{"company":"公司名","eventType":"秋招开启|新岗位|线下活动|宣讲会|其他","title":"事件标题","date":"YYYY-MM-DD","summary":"2-3句摘要","url":"原始链接"}]}
2. 仅输出关注公司列表中的公司；非关注公司的事件跳过
3. 只保留面向2026届/2027届毕业生的校招事件；丢弃面向2025届及更早的事件
4. 公司新闻/融资/产品发布不算
5. 同一事件多次出现去重保留最完整的一条
6. 没有有效事件返回 {"events":[]}
7. 空字段用 ""。`

const EVENT_EXTRACT_INDIVIDUAL = (company, today, content) => `# 求职新动态提取

从以下搜索结果中提取 ${company} 的2026届校招新动态。

当前日期：${today}

搜索结果：
\`\`\`
${content}
\`\`\`

要求：
1. 只输出 JSON（以 { 开头、以 } 结尾）：{"events":[{"company":"${company}","eventType":"秋招开启|新岗位|线下活动|宣讲会|其他","title":"事件标题","date":"YYYY-MM-DD","summary":"2-3句摘要","url":"原始链接"}]}
2. 只保留面向2026届/2027届毕业生的校招事件
3. 公司新闻/融资/产品发布不算
4. 没有有效事件返回 {"events":[]}
5. 空字段用 ""。`

const LLM_STRATEGIES = {
  'individual-no-think': {
    desc: '逐公司提取, thinking=disabled (当前方案)',
    async run(results) {
      const unique = dedupResults(results)
      const allEvents = []
      for (const c of ALL_COMPANIES.slice(0, 5)) {
        const relevant = unique.filter(r =>
          (r.title || '').includes(c) || (r.content || '').includes(c)
        ).slice(0, 5)
        if (relevant.length === 0) continue
        const cContent = relevant.map((r, i) =>
          `[${i + 1}] ${r.title}\nURL: ${r.url}\n${r.content}`
        ).join('\n\n')
        const { content: llmOut, elapsed } = await llmChat({
          messages: [{ role: 'user', content: EVENT_EXTRACT_INDIVIDUAL(c, TODAY, cContent.slice(0, 8000)) }],
          temperature: 0.3, thinking: false, maxTokens: 2048,
        })
        const parsed = safeJsonParse(llmOut)
        if (parsed && Array.isArray(parsed.events)) allEvents.push(...parsed.events)
      }
      return { events: allEvents }
    }
  },
  'batch-no-think': {
    desc: '批量提取, thinking=disabled',
    async run(results) {
      const unique = dedupResults(results)
      const content = unique.map((r, i) =>
        `[${i + 1}] ${r.title}\nURL: ${r.url}\n${r.content}`
      ).join('\n\n')
      const { content: llmOut, elapsed } = await llmChat({
        messages: [{ role: 'user', content: EVENT_EXTRACT_BATCH(ALL_COMPANIES, TODAY, content.slice(0, 25000)) }],
        temperature: 0.3, thinking: false, maxTokens: 4096,
      })
      const parsed = safeJsonParse(llmOut)
      return { events: (parsed && Array.isArray(parsed.events)) ? parsed.events : [], rawOutput: llmOut }
    }
  },
  'batch-think': {
    desc: '批量提取, thinking=enabled',
    async run(results) {
      const unique = dedupResults(results)
      const content = unique.map((r, i) =>
        `[${i + 1}] ${r.title}\nURL: ${r.url}\n${r.content}`
      ).join('\n\n')
      const { content: llmOut, elapsed } = await llmChat({
        messages: [{ role: 'user', content: EVENT_EXTRACT_BATCH(ALL_COMPANIES, TODAY, content.slice(0, 25000)) }],
        temperature: 0.3, thinking: true, maxTokens: 4096,
      })
      const parsed = safeJsonParse(llmOut)
      return { events: (parsed && Array.isArray(parsed.events)) ? parsed.events : [], rawOutput: llmOut }
    }
  },
}

// ═══════════════════ Phase 2: LLM 输出质量评分 ═══════════════════

const LLM_QUALITY_JUDGE_PROMPT = (companies, today, searchResults, extractedEvents) => `你是一位信息提取质量评估员。评估以下事件提取的质量。

关注公司：${companies.join('、')}
当前日期：${today}

原始搜索结果（摘要）：
${searchResults.slice(0, 3000)}

提取出的事件：
\`\`\`json
${extractedEvents}
\`\`\`

请从以下维度评分，返回 JSON：
{
  "scores": {
    "precision": 1-5,        // 精确度：提取的事件是否都在原文中有据可查？5=全部可验证
    "recall": 1-5,           // 召回率：原文中的重要事件是否都被提取了？5=全部覆盖
    "companyAccuracy": 1-5,  // 公司名准确性：公司归属是否正确？
    "typeAccuracy": 1-5,     // 事件类型准确性：秋招开启/新岗位等分类正确吗？
    "dateAccuracy": 1-5,     // 日期准确性：提取的日期是否与原文一致？
    "noHallucination": 1-5,  // 无幻觉：5=没有编造事件/URL/公司，1=大量编造
    "overallQuality": 1-5    // 综合质量
  },
  "validEventCount": 0,      // 有效事件数
  "hallucinatedEventCount": 0, // 编造/无法在原文中找到的事件数
  "missedEvents": ["应该提取但遗漏的事件描述"],
  "issues": ["具体问题1", "具体问题2"],
  "verdict": "一句话总结"
}

只输出 JSON，以 { 开头、以 } 结尾。`

async function scoreLLMOutput(strategyName, results, events) {
  if (!events || events.length === 0) {
    return { scores: { overallQuality: 0 }, validEventCount: 0, hallucinatedEventCount: 0, issues: ['无输出'] }
  }

  const searchSummary = dedupResults(results).slice(0, 10).map((r, i) =>
    `[${i + 1}] ${r.title?.slice(0, 80)} | ${(r.content || '').slice(0, 150)}`
  ).join('\n')

  const prompt = LLM_QUALITY_JUDGE_PROMPT(ALL_COMPANIES, TODAY, searchSummary, JSON.stringify(events, null, 2))
  const { content } = await llmChat({
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.1, thinking: false, maxTokens: 2048,
  })

  const result = safeJsonParse(content)
  if (!result || !result.scores) {
    console.log(`     ⚠️ LLM质量评分解析失败: ${content.slice(0, 200)}`)
    return { scores: { overallQuality: 0 }, validEventCount: events.length, hallucinatedEventCount: 0, issues: ['评分解析失败'], rawOutput: content.slice(0, 500) }
  }
  return result
}

// ═══════════════════ Main ═══════════════════

async function main() {
  console.log('🔬 Tavily + LLM 质量评分全组合实验')
  console.log(`   公司: ${ALL_COMPANIES.length}家 | 日期: ${TODAY}`)
  console.log(`   模型: ${LLM_MODEL}\n`)

  const allPhase1Results = {}
  const allPhase2Results = {}

  // ══════════════ Phase 1: 搜索质量评分 ══════════════
  console.log('═'.repeat(70))
  console.log('📡 Phase 1: 搜索策略 — 相关性质量评分')
  console.log('═'.repeat(70))

  for (const [name, strategy] of Object.entries(SEARCH_STRATEGIES)) {
    const start = Date.now()
    console.log(`\n🔍 ${name} (${strategy.calls}次调用) — ${strategy.desc}`)

    let results
    try {
      results = await strategy.run()
    } catch (err) {
      console.log(`   ❌ 搜索失败: ${err.message}`)
      allPhase1Results[name] = { error: err.message }
      continue
    }

    const unique = dedupResults(results)
    console.log(`   📊 ${results.length}条原始 / ${unique.length}条唯一 · ${Date.now() - start}ms`)

    // Quality scoring
    console.log(`   🧠 裁判评分中...`)
    const quality = await scoreSearchResults(name, results)
    allPhase1Results[name] = {
      calls: strategy.calls,
      totalResults: results.length,
      uniqueResults: unique.length,
      elapsed: Date.now() - start,
      quality,
    }
    console.log(`   📈 平均相关性: ${quality.avgRelevance}/5 | 可操作: ${quality.actionableCount}条 | 噪音: ${quality.noiseRatio}%`)
    console.log(`   🏢 公司覆盖: ${Object.keys(quality.companyCoverage).length}/10家 — ${Object.entries(quality.companyCoverage).map(([c, n]) => `${c}(${n})`).join(', ')}`)
  }

  // ══════════════ Phase 2: LLM 提取质量评分 ══════════════
  console.log('\n' + '═'.repeat(70))
  console.log('🧠 Phase 2: LLM 提取策略 — 输出质量评分')
  console.log('═'.repeat(70))

  // Pick the best search strategy for LLM testing
  const rankedSearches = Object.entries(allPhase1Results)
    .filter(([, r]) => r.quality && r.quality.avgRelevance > 0)
    .sort((a, b) => {
      const aQ = a[1].quality, bQ = b[1].quality
      // Composite: relevance (40%) + actionable ratio (30%) + company coverage (30%)
      const aScore = (aQ.avgRelevance / 5) * 0.4 + (aQ.actionableCount / a[1].uniqueResults) * 0.3 + (Object.keys(aQ.companyCoverage).length / 10) * 0.3
      const bScore = (bQ.avgRelevance / 5) * 0.4 + (bQ.actionableCount / b[1].uniqueResults) * 0.3 + (Object.keys(bQ.companyCoverage).length / 10) * 0.3
      return bScore - aScore
    })

  console.log('\n📊 搜索策略综合排名:')
  rankedSearches.forEach(([name, r], i) => {
    const rQ = r.quality
    const score = ((rQ.avgRelevance / 5) * 0.4 + (rQ.actionableCount / Math.max(r.uniqueResults, 1)) * 0.3 + (Object.keys(rQ.companyCoverage).length / 10) * 0.3 * 100).toFixed(1)
    console.log(`   ${i + 1}. ${name}: 综合${score}分 | 相关${rQ.avgRelevance}/5 | 可操作${rQ.actionableCount}/${r.uniqueResults} | 覆盖${Object.keys(rQ.companyCoverage).length}家`)
  })

  const bestSearchName = rankedSearches[0][0]
  console.log(`\n🏆 最佳搜索策略: ${bestSearchName}`)
  console.log('   用该策略的结果测试所有 LLM 提取策略...')

  // Re-run best search to get fresh results for LLM testing
  const bestResults = await SEARCH_STRATEGIES[bestSearchName].run()
  console.log(`   搜索结果: ${bestResults.length}条 (${dedupResults(bestResults).length}唯一)\n`)

  for (const [name, strategy] of Object.entries(LLM_STRATEGIES)) {
    console.log(`🧠 ${name} — ${strategy.desc}`)
    const start = Date.now()
    let output
    try {
      output = await strategy.run(bestResults)
    } catch (err) {
      console.log(`   ❌ 提取失败: ${err.message}`)
      allPhase2Results[name] = { error: err.message }
      continue
    }

    const elapsed = Date.now() - start
    console.log(`   📊 ${output.events.length}个事件 · ${(elapsed / 1000).toFixed(1)}s`)

    // Quality scoring
    console.log(`   🧠 裁判评分中...`)
    const quality = await scoreLLMOutput(name, bestResults, output.events)
    allPhase2Results[name] = {
      elapsed,
      eventCount: output.events.length,
      quality,
    }
    if (quality.scores) {
      const s = quality.scores
      console.log(`   📈 精确${s.precision}/5 召回${s.recall}/5 公司${s.companyAccuracy}/5 类型${s.typeAccuracy}/5 无幻觉${s.noHallucination}/5 综合${s.overallQuality}/5`)
      console.log(`   ⚡ 幻觉: ${quality.hallucinatedEventCount}个 | 遗漏: ${(quality.missedEvents || []).length}个`)
      if (quality.verdict) console.log(`   📝 ${quality.verdict}`)
    }
  }

  // ══════════════ Phase 3: 综合排名 ══════════════
  console.log('\n' + '═'.repeat(70))
  console.log('🏆 Phase 3: 综合排名')
  console.log('═'.repeat(70))

  console.log('\n📡 搜索策略排名（按质量综合分）:')
  console.log(`   ${'策略'.padEnd(30)} ${'调用'.padStart(5)} ${'唯一URL'.padStart(8)} ${'相关性'.padStart(8)} ${'可操作率'.padStart(10)} ${'公司覆盖'.padStart(8)}`)
  console.log('   ' + '─'.repeat(73))
  for (const [name, r] of rankedSearches) {
    const q = r.quality
    const actionableRate = q.actionableCount > 0 ? ((q.actionableCount / r.uniqueResults) * 100).toFixed(0) + '%' : '0%'
    console.log(`   ${name.padEnd(30)} ${String(r.calls).padStart(5)} ${String(r.uniqueResults).padStart(8)} ${String(q.avgRelevance).padStart(8)} ${actionableRate.padStart(10)} ${(Object.keys(q.companyCoverage).length + '/10').padStart(8)}`)
  }

  console.log('\n🧠 LLM 策略排名（按输出质量）:')
  const rankedLLM = Object.entries(allPhase2Results)
    .filter(([, r]) => r.quality && r.quality.scores)
    .sort((a, b) => (b[1].quality.scores.overallQuality || 0) - (a[1].quality.scores.overallQuality || 0))
  console.log(`   ${'策略'.padEnd(30)} ${'事件数'.padStart(8)} ${'耗时'.padStart(8)} ${'综合'.padStart(6)} ${'精确'.padStart(6)} ${'召回'.padStart(6)} ${'无幻觉'.padStart(8)}`)
  console.log('   ' + '─'.repeat(76))
  for (const [name, r] of rankedLLM) {
    const s = r.quality.scores
    console.log(`   ${name.padEnd(30)} ${String(r.eventCount).padStart(8)} ${((r.elapsed / 1000).toFixed(1) + 's').padStart(8)} ${String(s.overallQuality || 0).padStart(6)} ${String(s.precision || 0).padStart(6)} ${String(s.recall || 0).padStart(6)} ${String(s.noHallucination || 0).padStart(8)}`)
  }

  // ══════════════ Final Recommendation ══════════════
  console.log('\n' + '═'.repeat(70))
  console.log('💡 最终推荐')
  console.log('═'.repeat(70))

  const bestSearch = rankedSearches[0]
  const bestLLM = rankedLLM[0]
  const bestSearchQ = bestSearch[1].quality
  const bestLLMQ = bestLLM ? bestLLM[1].quality.scores : null

  console.log(`\n   推荐搜索: ${bestSearch[0]} (${bestSearch[1].calls}次Tavily, 相关性${bestSearchQ.avgRelevance}/5, 覆盖${Object.keys(bestSearchQ.companyCoverage).length}家公司)`)
  if (bestLLM) console.log(`   推荐LLM:  ${bestLLM[0]} (综合质量${bestLLMQ.overallQuality}/5)`)

  // Cost comparison
  const currentTavilyCalls = 40
  const newTavilyCalls = bestSearch[1].calls
  const currentLLMCalls = 40
  const newLLMCalls = 1 // batch extraction

  console.log(`\n   Tavily: ${currentTavilyCalls} → ${newTavilyCalls}次 (↓${((1 - newTavilyCalls / currentTavilyCalls) * 100).toFixed(0)}%)`)
  console.log(`   LLM:    ${currentLLMCalls} → ${newLLMCalls}次 (↓${((1 - newLLMCalls / currentLLMCalls) * 100).toFixed(0)}%)`)
  console.log(`   月配额可生成: ~25次 → ~${Math.floor(1000 / (newTavilyCalls + newLLMCalls))}次`)

  // Save
  const outPath = path.resolve(process.cwd(), 'scripts', 'quality-experiment-results.json')
  fs.writeFileSync(outPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    phase1: allPhase1Results,
    phase2: allPhase2Results,
    searchRanking: rankedSearches.map(([n, r]) => ({ name: n, ...r })),
    llmRanking: rankedLLM.map(([n, r]) => ({ name: n, ...r })),
    recommendation: {
      search: bestSearch[0],
      searchCalls: bestSearch[1].calls,
      llm: bestLLM ? bestLLM[0] : 'batch-no-think',
      llmCalls: newLLMCalls,
      tavilyReduction: `${((1 - newTavilyCalls / currentTavilyCalls) * 100).toFixed(0)}%`,
      llmReduction: `${((1 - newLLMCalls / currentLLMCalls) * 100).toFixed(0)}%`,
    }
  }, null, 2))
  console.log(`\n📁 完整结果: ${outPath}`)
}

main().catch(err => { console.error('实验失败:', err); process.exit(1) })
