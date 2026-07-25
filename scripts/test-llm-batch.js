/**
 * LLM 批量提取实验：岗位 + 面经问题
 * 对比逐条提取 vs 批量提取(有/无高思考)
 */
import dotenv from 'dotenv'
dotenv.config()

const TAVILY_KEY = process.env.TAVILY_API_KEY
const TAVILY_URL = (process.env.TAVILY_API_URL || 'https://api.tavily.com/search')
const LLM_URL = (process.env.KIMI_BASE_URL || 'https://api.deepseek.com/v1').replace(/\/+$/, '') + '/chat/completions'
const LLM_KEY = process.env.KIMI_API_KEY
const LLM_MODEL = process.env.KIMI_MODEL || 'deepseek-v4-pro'

const COMPANIES = ['字节跳动', '阿里巴巴', '腾讯', '百度', '美团', 'MiniMax', '智谱AI', '月之暗面']
const ROLES = 'AI产品经理 大模型产品经理 Agent产品经理'
const CITIES = '北京 上海 杭州 深圳'

async function tavilySearch(opts) {
  const body = { api_key: TAVILY_KEY, query: opts.query, search_depth: 'basic', max_results: opts.maxResults ?? 10, include_answer: false }
  if (opts.days) body.days = opts.days
  if (opts.includeDomains?.length) body.include_domains = opts.includeDomains
  const res = await fetch(TAVILY_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const data = await res.json()
  return data.results || []
}

async function llmChat(opts) {
  const body = { model: LLM_MODEL, messages: opts.messages, temperature: opts.temperature ?? 0.3, max_tokens: opts.maxTokens ?? 4096 }
  if (opts.thinking) { body.thinking = { type: 'enabled' }; if (opts.thinkingEffort) body.reasoning_effort = opts.thinkingEffort }
  else { body.thinking = { type: 'disabled' } }
  const start = Date.now()
  const res = await fetch(LLM_URL, {
    method: 'POST', headers: { 'Authorization': `Bearer ${LLM_KEY}`, 'Content-Type': 'application/json', 'User-Agent': 'claude-code/0.1.0' },
    body: JSON.stringify(body),
  })
  const data = await res.json()
  return { content: data.choices?.[0]?.message?.content || '', elapsed: Date.now() - start }
}

function dedupByUrl(results) {
  const seen = new Set()
  return results.filter(r => { const k = r.url.replace(/\?.*$/, '').replace(/\/+$/, ''); if (seen.has(k)) return false; seen.add(k); return true })
}

// ═══════════════ Prompts ═══════════════

const JOB_EXTRACT_BATCH = (companies, content) => `# 岗位信息批量提取
从以下搜索结果中提取面向国内 AI 产品岗位的招聘信息。

关注公司：${companies.join('、')}

搜索结果：
\`\`\`
${content}
\`\`\`

要求：
1. 只输出 JSON：{"jobs": [{"title":"岗位名","city":"城市","salary":"薪资","requirements":["要求1"],"url":"链接","company":"公司名"}]}
2. 仅保留与 AI产品/大模型/Agent 相关的岗位
3. 没有岗位时返回 {"jobs": []}
4. 对每条 JD 提炼3-5条核心要求
5. 不要编造 URL`

const QUESTION_BATCH = (direction, content) => `# 面经高频问题聚合
从以下求职社区面经中聚合面试问题。

方向：${direction}

面经内容：
\`\`\`
${content}
\`\`\`

要求：
1. 只输出 JSON：{"questions": [{"question":"问题","intent":"考察意图","prepTip":"准备要点","frequency":"高频/出现多次/偶见","companies":["公司"],"url":"链接"}]}
2. 只保留真实面经中的问题，不要编造
3. 相似问题合并，companies 取并集
4. 没有有效问题时返回 {"questions": []}`

// ═══════════════ Main ═══════════════

async function main() {
  console.log('🧠 LLM 批量提取实验 (岗位 + 面经)\n')

  // ── 岗位搜索 ──
  console.log('📡 岗位搜索 (1次Tavily, maxResults=20)...')
  const jobResults = await tavilySearch({
    query: `${ROLES} 校招 2026 ${COMPANIES.slice(0,5).join(' ')} ${CITIES}`,
    maxResults: 20, days: 30,
  })
  const jobUnique = dedupByUrl(jobResults)
  console.log(`   ${jobResults.length}条 (${jobUnique.length}唯一)\n`)

  // ── 面经搜索 ──
  console.log('📡 面经搜索 (1次Tavily, maxResults=15)...')
  const qResults = await tavilySearch({
    query: `AI产品经理 面经 面试题 高频 ${COMPANIES.slice(0,5).join(' ')}`,
    maxResults: 15, days: 90,
    includeDomains: ['nowcoder.com', 'zhihu.com', 'xiaohongshu.com'],
  })
  const qUnique = dedupByUrl(qResults)
  console.log(`   ${qResults.length}条 (${qUnique.length}唯一)\n`)

  // ── 岗位提取: 3 strategies ──
  console.log('═'.repeat(60))
  console.log('📋 岗位提取策略对比\n')

  const jobContent = jobUnique.map((r, i) => `[${i+1}] ${r.title}\nURL: ${r.url}\n${r.content}`).join('\n\n')

  // Strategy 1: batch no thinking
  const j1 = await llmChat({
    messages: [{ role: 'user', content: JOB_EXTRACT_BATCH(COMPANIES, jobContent.slice(0, 30000)) }],
    temperature: 0.3, thinking: false, maxTokens: 4096,
  })
  let j1Count = 0
  try { const j = JSON.parse(j1.content.replace(/```json\n?/g, '').replace(/```/g, '').trim()); j1Count = j.jobs?.length || 0 } catch {}
  console.log(`  ✅ batch (no thinking): ${j1Count}个岗位 · ${j1.content.length}字符 · ${(j1.elapsed/1000).toFixed(1)}s`)
  console.log(`     ${j1.content.slice(0, 150).replace(/\n/g, ' ')}...\n`)

  // Strategy 2: batch with thinking high
  const j2 = await llmChat({
    messages: [{ role: 'user', content: JOB_EXTRACT_BATCH(COMPANIES, jobContent.slice(0, 30000)) }],
    temperature: 0.3, thinking: true, thinkingEffort: 'high', maxTokens: 4096,
  })
  let j2Count = 0
  try { const j = JSON.parse(j2.content.replace(/```json\n?/g, '').replace(/```/g, '').trim()); j2Count = j.jobs?.length || 0 } catch {}
  console.log(`  ✅ batch (high thinking): ${j2Count}个岗位 · ${j2.content.length}字符 · ${(j2.elapsed/1000).toFixed(1)}s`)
  console.log(`     ${j2.content.slice(0, 150).replace(/\n/g, ' ')}...\n`)

  // ── 面经提取: 3 strategies ──
  console.log('═'.repeat(60))
  console.log('📋 面经提取策略对比\n')

  const qContent = qUnique.map((r, i) => `[${i+1}] ${r.title}\nURL: ${r.url}\n${r.content}`).join('\n\n')

  // Strategy 1: batch no thinking
  const q1 = await llmChat({
    messages: [{ role: 'user', content: QUESTION_BATCH('AI产品经理/大模型产品', qContent.slice(0, 30000)) }],
    temperature: 0.3, thinking: false, maxTokens: 4096,
  })
  let q1Count = 0
  try { const j = JSON.parse(q1.content.replace(/```json\n?/g, '').replace(/```/g, '').trim()); q1Count = j.questions?.length || 0 } catch {}
  console.log(`  ✅ batch (no thinking): ${q1Count}个问题 · ${q1.content.length}字符 · ${(q1.elapsed/1000).toFixed(1)}s`)
  console.log(`     ${q1.content.slice(0, 150).replace(/\n/g, ' ')}...\n`)

  // Strategy 2: batch with thinking high
  const q2 = await llmChat({
    messages: [{ role: 'user', content: QUESTION_BATCH('AI产品经理/大模型产品', qContent.slice(0, 30000)) }],
    temperature: 0.3, thinking: true, thinkingEffort: 'high', maxTokens: 4096,
  })
  let q2Count = 0
  try { const j = JSON.parse(q2.content.replace(/```json\n?/g, '').replace(/```/g, '').trim()); q2Count = j.questions?.length || 0 } catch {}
  console.log(`  ✅ batch (high thinking): ${q2Count}个问题 · ${q2.content.length}字符 · ${(q2.elapsed/1000).toFixed(1)}s`)
  console.log(`     ${q2.content.slice(0, 150).replace(/\n/g, ' ')}...\n`)

  // ── Summary ──
  console.log('═'.repeat(60))
  console.log('📊 总结\n')
  console.log(`  岗位提取: no-think ${j1Count}个(${(j1.elapsed/1000).toFixed(1)}s) vs high-think ${j2Count}个(${(j2.elapsed/1000).toFixed(1)}s)`)
  console.log(`  面经提取: no-think ${q1Count}个(${(q1.elapsed/1000).toFixed(1)}s) vs high-think ${q2Count}个(${(q2.elapsed/1000).toFixed(1)}s)`)
  console.log(`\n  推荐: ${j1Count >= j2Count ? 'no-thinking' : 'high-thinking'} (岗位), ${q1Count >= q2Count ? 'no-thinking' : 'high-thinking'} (面经)`)
}

main().catch(err => { console.error(err); process.exit(1) })
