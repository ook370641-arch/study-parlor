/**
 * 快速诊断：检查 LLM 提取的原始输出内容
 */
import dotenv from 'dotenv'
dotenv.config()

const TAVILY_KEY = process.env.TAVILY_API_KEY
const TAVILY_URL = (process.env.TAVILY_API_URL || 'https://api.tavily.com/search')
const LLM_URL = (process.env.KIMI_BASE_URL || 'https://api.deepseek.com/v1').replace(/\/+$/, '') + '/chat/completions'
const LLM_KEY = process.env.KIMI_API_KEY
const LLM_MODEL = process.env.KIMI_MODEL || 'deepseek-v4-pro'

const ALL_COMPANIES = ['字节跳动', '阿里巴巴', '腾讯', '百度', '美团', 'MiniMax', '智谱AI', '月之暗面', '零一万物', '百川智能']
const BIG_TECH = ALL_COMPANIES.slice(0, 5)
const CITIES = '北京 上海 杭州 深圳'
const TODAY = new Date().toISOString().slice(0, 10)

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
  const res = await fetch(LLM_URL, {
    method: 'POST', headers: { 'Authorization': `Bearer ${LLM_KEY}`, 'Content-Type': 'application/json', 'User-Agent': 'claude-code/0.1.0' },
    body: JSON.stringify(body),
  })
  const data = await res.json()
  return { content: data.choices?.[0]?.message?.content || '', elapsed: Date.now() - (opts._start || Date.now()) }
}

function dedupResults(results) {
  const seen = new Set()
  return results.filter(r => { const k = (r.url || '').replace(/\?.*$/, '').replace(/\/+$/, ''); if (!k || seen.has(k)) return false; seen.add(k); return true })
}

const PROMPT_V2 = (companies, today, content) => `# 求职新动态提取

从搜索结果中找出关注公司的2026/2027届校招新动态。

关注公司名单：${companies.join('、')}
当前日期：${today}（2026年7月，暑假期间，秋招提前批/实习生招聘季）

搜索结果：
\`\`\`
${content}
\`\`\`

提取规则：
1. 输出 JSON 对象：{"events": [{"company": "公司名", "eventType": "秋招开启|新岗位|线下活动|宣讲会|其他", "title": "事件标题", "date": "YYYY-MM-DD或空", "summary": "2-3句摘要", "url": "来源链接"}]}
2. 以下属于有效事件：
   - 校招/秋招/春招/提前批/实习生招聘的开启通知
   - AI产品/大模型/Agent 方向的岗位发布
   - 宣讲会/线下活动/openday
   - 笔试/面试时间通知
3. 以下不属于事件（跳过）：
   - 公司股价/财报/融资新闻
   - 产品发布（非招聘）
   - 高管离职/人事变动（非批量招聘）
   - 纯科普文章、行业分析
4. 公司名必须是关注公司名单中的名称，或明确属于该公司的子品牌（如"阿里云"→"阿里巴巴"）
5. 如果没有找到任何有效事件，返回 {"events": []}
6. 不要编造任何信息；URL必须来自搜索结果`

async function main() {
  console.log('🔧 LLM 提取诊断\n')

  // Get fresh search results using best strategy (C-双层)
  console.log('📡 获取搜索结果 (C-双层)...')
  const [community, broad] = await Promise.all([
    tavilySearch({ query: '2026秋招 2027届 校招 AI产品 大模型 提前批 汇总', maxResults: 10, days: 7, includeDomains: ['nowcoder.com', 'yingjiesheng.com'] }),
    tavilySearch({ query: `2026秋招 AI产品经理 校招 宣讲会 ${BIG_TECH.join(' ')} ${CITIES}`, maxResults: 10, days: 7 }),
  ])
  const allResults = [...community, ...broad]
  const unique = dedupResults(allResults)
  console.log(`   ${allResults.length}条原始 / ${unique.length}条唯一\n`)

  // Show what we got
  console.log('📋 搜索结果摘要:')
  unique.forEach((r, i) => {
    console.log(`   [${i + 1}] ${r.title?.slice(0, 100)}`)
    console.log(`       URL: ${r.url?.slice(0, 100)}`)
    console.log(`       内容: ${(r.content || '').slice(0, 150).replace(/\n/g, ' ')}`)
    console.log('')
  })

  // Build extraction content
  const content = unique.map((r, i) =>
    `[${i + 1}] 标题: ${r.title}\nURL: ${r.url}\n摘要: ${r.content}`
  ).join('\n\n')

  // Test with V2 prompt (no thinking)
  console.log('═'.repeat(60))
  console.log('🧠 测试: V2 prompt, thinking=disabled\n')
  const r1 = await llmChat({
    messages: [{ role: 'user', content: PROMPT_V2(ALL_COMPANIES, TODAY, content.slice(0, 25000)) }],
    temperature: 0.3, thinking: false, maxTokens: 4096, _start: Date.now(),
  })
  console.log(`   耗时: ${(r1.elapsed / 1000).toFixed(1)}s`)
  console.log(`   长度: ${r1.content.length} 字符`)
  console.log(`   原始输出:\n${r1.content.slice(0, 1500)}`)
  console.log('')

  // Test with V2 prompt (thinking enabled)
  console.log('═'.repeat(60))
  console.log('🧠 测试: V2 prompt, thinking=enabled\n')
  const r2 = await llmChat({
    messages: [{ role: 'user', content: PROMPT_V2(ALL_COMPANIES, TODAY, content.slice(0, 25000)) }],
    temperature: 0.3, thinking: true, maxTokens: 4096, _start: Date.now(),
  })
  console.log(`   耗时: ${(r2.elapsed / 1000).toFixed(1)}s`)
  console.log(`   长度: ${r2.content.length} 字符`)
  console.log(`   原始输出:\n${r2.content.slice(0, 1500)}`)
  console.log('')

  // Also test: what if we search with "实习" instead of "秋招"?
  console.log('═'.repeat(60))
  console.log('📡 补充搜索: 用"实习"关键词 (7月是实习招聘季)\n')
  const [com2, broad2] = await Promise.all([
    tavilySearch({ query: '2026 2027届 AI产品 实习生 招聘 汇总', maxResults: 10, days: 7, includeDomains: ['nowcoder.com', 'yingjiesheng.com'] }),
    tavilySearch({ query: `AI产品经理 实习 校招 2026 ${BIG_TECH.join(' ')} ${CITIES}`, maxResults: 10, days: 7 }),
  ])
  const all2 = [...com2, ...broad2]
  const unique2 = dedupResults(all2)
  console.log(`   ${all2.length}条原始 / ${unique2.length}唯一\n`)
  const content2 = unique2.map((r, i) =>
    `[${i + 1}] 标题: ${r.title}\nURL: ${r.url}\n摘要: ${r.content}`
  ).join('\n\n')

  console.log('🧠 测试: 实习关键词 + V2 prompt, thinking=disabled\n')
  const r3 = await llmChat({
    messages: [{ role: 'user', content: PROMPT_V2(ALL_COMPANIES, TODAY, content2.slice(0, 25000)) }],
    temperature: 0.3, thinking: false, maxTokens: 4096, _start: Date.now(),
  })
  console.log(`   耗时: ${(r3.elapsed / 1000).toFixed(1)}s`)
  console.log(`   长度: ${r3.content.length} 字符`)
  console.log(`   原始输出:\n${r3.content.slice(0, 1500)}`)
}

main().catch(err => { console.error(err); process.exit(1) })
