/**
 * 两轮渐进搜索实验：验证新搜索管线 vs 原始 Claude Code 分析质量
 *
 * 用法：node scripts/test-two-round-search.js
 * 需要项目根目录 .env 中配置 TAVILY_API_KEY, KIMI_API_KEY
 */
import dotenv from 'dotenv'
import fs from 'node:fs'
import path from 'node:path'

dotenv.config()

const DEEPSEEK_BASE_URL = (process.env.KIMI_BASE_URL || 'https://api.deepseek.com/v1').replace(/\/+$/, '')
const DEEPSEEK_KEY = process.env.KIMI_API_KEY
const DEEPSEEK_MODEL = process.env.KIMI_MODEL || 'deepseek-v4-pro'
const TAVILY_KEY = process.env.TAVILY_API_KEY
const TAVILY_URL = process.env.TAVILY_API_URL || 'https://api.tavily.com/search'

const TOPIC = '为什么 Claude Code 的 agent harness 架构比其他 AI 编程 agent（Cursor/Copilot/Devin）表现更好'

// ─── 工具函数 ───────────────────────────────────────────

async function llm(messages, opts = {}) {
  const body = {
    model: DEEPSEEK_MODEL,
    stream: false,
    messages,
    temperature: opts.temperature ?? 0.3,
    max_tokens: opts.maxTokens ?? 4096,
    thinking: opts.thinking ?? { type: 'disabled' },
  }
  if (body.thinking?.type === 'enabled') {
    body.reasoning_effort = opts.reasoningEffort ?? 'high'
  }

  const res = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${DEEPSEEK_KEY}`,
      'Content-Type': 'application/json',
      'User-Agent': 'claude-code/0.1.0',
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`DeepSeek HTTP ${res.status}: ${text.slice(0, 300)}`)
  }
  const json = await res.json()
  const content = json.choices?.[0]?.message?.content ?? ''
  return content.trim()
}

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
    throw new Error(`Tavily HTTP ${res.status}: ${text.slice(0, 200)}`)
  }
  const data = await res.json()
  return data.results || []
}

function extractJsonArray(text) {
  // 剥除 markdown fence 和前后 prose
  const cleaned = text
    .replace(/```(?:json)?\s*\n?/gi, '')
    .replace(/```/g, '')
    .trim()
  const start = cleaned.indexOf('[')
  const end = cleaned.lastIndexOf(']')
  if (start === -1 || end === -1 || end <= start) return null
  return cleaned.slice(start, end + 1)
}

function formatResults(results, label) {
  if (!results || results.length === 0) return `（${label}: 无结果）`
  return results.map((r, i) =>
    `[${label}-${i + 1}] ${r.title}\nURL: ${r.url}\n摘要: ${r.content?.slice(0, 400) || '(无内容)'}`
  ).join('\n\n')
}

// ─── 第1轮：探索 ────────────────────────────────────────

async function round1_explore() {
  console.log('='.repeat(70))
  console.log('🔭 第1轮：探索 — 建立全景图')
  console.log('='.repeat(70))

  // Step 1: LLM 生成探索查询词
  console.log('\n📝 生成探索查询词...')
  const queryPrompt = `用户想研究：「${TOPIC}」

请生成 2-3 个宽域搜索查询词，用于全面了解这个主题。要求：
- 覆盖不同角度（比如：架构设计、工程实践、对比分析、底层原理）
- 查询词简短、精准，适合英文搜索引擎
- 不要生成互相重叠的查询词
- 查询词用英文（此类技术资料英文质量更高）

只输出 JSON 数组：["查询1", "查询2"]`

  const queryText = await llm([{ role: 'user', content: queryPrompt }], { temperature: 0.3 })
  const queriesJson = extractJsonArray(queryText)
  const queries = queriesJson ? JSON.parse(queriesJson) : []
  console.log(`   生成 ${queries.length} 个查询词:`)
  queries.forEach((q, i) => console.log(`   [${i + 1}] ${q}`))

  if (queries.length === 0) throw new Error('第1轮查询词生成失败')

  // Step 2: 并行搜索
  console.log('\n🔍 并行搜索...')
  const settled = await Promise.allSettled(
    queries.map(q => tavilySearch({ query: q, maxResults: 6 }))
  )
  const round1Results = settled
    .filter(r => r.status === 'fulfilled')
    .flatMap(r => r.value)
  const failed = settled.filter(r => r.status === 'rejected').length

  console.log(`   获得 ${round1Results.length} 条结果 · ${failed} 个查询失败`)
  if (round1Results.length > 0) {
    round1Results.slice(0, 3).forEach(r => console.log(`   📄 ${r.title?.slice(0, 80)}`))
    if (round1Results.length > 3) console.log(`   ... 还有 ${round1Results.length - 3} 条`)
  }

  return { queries, results: round1Results }
}

// ─── 子维度识别 ──────────────────────────────────────────

async function identifyDimensions(topic, round1Results) {
  console.log('\n🎯 从第1轮结果中识别子维度...')

  const dimPrompt = `以下是关于「${topic}」的第一轮网络搜索结果。请通读所有摘要，识别 2-4 个值得深挖的子维度。

对每个子维度，生成 1 个精准搜索查询词。要求：
- 子维度必须是第一轮结果中反复出现或暗示了深度的话题
- 查询词要足够具体，能搜到该子维度的深入内容
- 查询词用英文
- 如果第一轮结果已经足够全面，可以只输出 1-2 个查询词

第一轮搜索结果：
${formatResults(round1Results, 'R1')}

只输出 JSON 数组：["查询1", "查询2", "查询3"]`

  const dimText = await llm([{ role: 'user', content: dimPrompt }], { temperature: 0.3 })
  const dimJson = extractJsonArray(dimText)
  const dimensions = dimJson ? JSON.parse(dimJson) : []
  console.log(`   识别出 ${dimensions.length} 个子维度:`)
  dimensions.forEach((d, i) => console.log(`   [${i + 1}] ${d}`))

  return dimensions
}

// ─── 第2轮：深钻 ────────────────────────────────────────

async function round2_deepDive(dimQueries) {
  console.log('\n🔬 第2轮：深钻 — 子维度搜索')
  console.log('='.repeat(70))

  if (dimQueries.length === 0) {
    console.log('   无子维度查询，跳过第2轮')
    return []
  }

  console.log('\n🔍 并行搜索子维度...')
  const settled = await Promise.allSettled(
    dimQueries.map(q => tavilySearch({ query: q, maxResults: 5 }))
  )
  const round2Results = settled
    .filter(r => r.status === 'fulfilled')
    .flatMap(r => r.value)
  const failed = settled.filter(r => r.status === 'rejected').length

  console.log(`   获得 ${round2Results.length} 条结果 · ${failed} 个查询失败`)
  if (round2Results.length > 0) {
    round2Results.slice(0, 3).forEach(r => console.log(`   📄 ${r.title?.slice(0, 80)}`))
    if (round2Results.length > 3) console.log(`   ... 还有 ${round2Results.length - 3} 条`)
  }

  return round2Results
}

// ─── 合成 ────────────────────────────────────────────────

async function synthesize(topic, round1Results, round2Results) {
  console.log('\n🧠 合成研究报告...')
  console.log('='.repeat(70))

  const synthPrompt = `你是一位技术研究助手。以下是从两轮网络搜索得到的关于「${topic}」的资料。

## 第一轮（全景扫描）
${formatResults(round1Results, 'R1')}

## 第二轮（子维度深钻）
${round2Results.length > 0 ? formatResults(round2Results, 'R2') : '（无 — 仅基于第一轮结果合成）'}

请撰写一份结构化的研究报告。要求：

1. 输出纯 markdown 格式，控制在 4000 字以内
2. 结构灵活但不失深度——根据材料自然产生的维度组织章节，而不是套固定模板（不要"一、引言 / 二、概述 / 三、结论"的八股结构）
3. 优先使用：对比表格、分层分析、关键数据点
4. 每个事实性陈述后附上来源编号 [1] [2] ...（对应下方来源列表的编号）
5. 如果材料之间存在矛盾或不同观点，明确指出
6. 结尾附"关键收获"：3-5 条这篇文章最值得记住的要点
7. 结尾附"来源列表"：每条来源的标题 + URL

写作风格：专业但不学术，像资深工程师写的内部技术备忘录。不要"本文首先…其次…最后…"的结构。直接切入，言之有物。`

  const report = await llm([{ role: 'user', content: synthPrompt }], {
    temperature: 0.5,
    maxTokens: 8192,
    thinking: { type: 'enabled' },
    reasoningEffort: 'high',
  })

  return report
}

// ─── 主程序 ─────────────────────────────────────────────

async function main() {
  console.log('🧪 两轮渐进搜索实验')
  console.log(`   主题: ${TOPIC}`)
  console.log(`   LLM: ${DEEPSEEK_MODEL} @ ${DEEPSEEK_BASE_URL}`)
  console.log(`   Tavily key: ${TAVILY_KEY?.slice(0, 12)}...`)
  console.log('')

  const startTime = Date.now()

  try {
    // 第1轮
    const r1 = await round1_explore()

    // 识别子维度
    const dimQueries = await identifyDimensions(TOPIC, r1.results)

    // 第2轮
    const r2Results = await round2_deepDive(dimQueries)

    // 合成报告
    const report = await synthesize(TOPIC, r1.results, r2Results)

    const elapsed = Date.now() - startTime

    // ─── 输出 ────────────────────────────────────────────

    console.log('\n' + '='.repeat(70))
    console.log('📋 最终研究报告')
    console.log('='.repeat(70))
    console.log(report)
    console.log('\n' + '='.repeat(70))

    // 统计
    const tavilyCalls = r1.queries.length + dimQueries.length
    const totalResults = r1.results.length + r2Results.length

    console.log('📊 统计')
    console.log(`   总耗时: ${(elapsed / 1000).toFixed(1)}s`)
    console.log(`   Tavily 调用: ${tavilyCalls} 次`)
    console.log(`   LLM 调用: 3 次（探索查询 + 子维度识别 + 合成）`)
    console.log(`   搜索结果: ${totalResults} 条（第1轮 ${r1.results.length} + 第2轮 ${r2Results.length}）`)

    // ─── 保存 ────────────────────────────────────────────

    const outputDir = path.resolve(import.meta.dirname || '.', '..', '.experiment-results')
    fs.mkdirSync(outputDir, { recursive: true })
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const outputFile = path.join(outputDir, `two-round-search-${ts}.md`)

    const metadata = [
      `# 两轮渐进搜索实验报告`,
      '',
      `- **主题**: ${TOPIC}`,
      `- **LLM**: ${DEEPSEEK_MODEL}`,
      `- **耗时**: ${(elapsed / 1000).toFixed(1)}s`,
      `- **Tavily 调用**: ${tavilyCalls} 次`,
      `- **搜索结果**: ${totalResults} 条`,
      `- **日期**: ${new Date().toISOString()}`,
      '',
      '---',
      '',
      '## 第1轮查询词',
      ...r1.queries.map((q, i) => `${i + 1}. \`${q}\``),
      '',
      '## 第2轮查询词（子维度）',
      ...dimQueries.map((q, i) => `${i + 1}. \`${q}\``),
      '',
      '## 第1轮结果摘要',
      ...r1.results.map(r => `- [${r.title}](${r.url})`),
      '',
      '## 第2轮结果摘要',
      ...r2Results.map(r => `- [${r.title}](${r.url})`),
      '',
      '---',
      '',
      '## 合成报告',
      '',
      report,
    ].join('\n')

    fs.writeFileSync(outputFile, metadata, 'utf8')
    console.log(`\n💾 完整报告已保存到: ${outputFile}`)

  } catch (err) {
    const elapsed = Date.now() - startTime
    console.error(`\n❌ 实验失败 (${(elapsed / 1000).toFixed(1)}s):`, err.message)
    console.error(err.stack)
    process.exit(1)
  }
}

main().catch(err => {
  console.error('未捕获错误:', err)
  process.exit(1)
})
