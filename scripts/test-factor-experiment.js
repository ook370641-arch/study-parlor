/**
 * 因子实验：关键词(K) × 搜索粒度(G) × LLM策略(L)
 *
 * K1="秋招/校招"(当前)  K2="实习/提前批"  K3="招聘/校招/实习"(混合)
 * G1="逐公司"(当前)      G2="双层"         G3="全量合并"
 * L1="batch+no think"   L2="batch+think"  L3="individual+no think"(当前)
 *
 * 先跑 K×G=9组搜索 → 评分 → 选最佳2组 → ×3 LLM策略 = 6组提取 → 评分
 */
import dotenv from 'dotenv'
dotenv.config()

const TAVILY_KEY = process.env.TAVILY_API_KEY
const TAVILY_URL = (process.env.TAVILY_API_URL || 'https://api.tavily.com/search')
const LLM_URL = (process.env.KIMI_BASE_URL || 'https://api.deepseek.com/v1').replace(/\/+$/, '') + '/chat/completions'
const LLM_KEY = process.env.KIMI_API_KEY
const LLM_MODEL = process.env.KIMI_MODEL || 'deepseek-v4-pro'

const COMPANIES = ['字节跳动','阿里巴巴','腾讯','百度','美团','MiniMax','智谱AI','月之暗面','零一万物','百川智能']
const BIG = COMPANIES.slice(0,5)
const STARTUP = COMPANIES.slice(5)
const CITIES = '北京 上海 杭州 深圳'
const TODAY = new Date().toISOString().slice(0,10)

// ═══════════════ 因子定义 ═══════════════

const K = {
  'K1-秋招': { query: (c) => `${c} 2026秋招 2027届 校招 宣讲会 AI产品 招聘`, broad: `2026秋招 AI产品经理 校招`, community: '2026秋招 校招 AI产品 提前批 汇总', days: 7 },
  'K2-实习': { query: (c) => `${c} 2026 2027届 AI产品 实习 招聘`, broad: `AI产品经理 实习 2026 2027届`, community: '2027届 AI产品 实习 汇总', days: 7 },
  'K3-混合': { query: (c) => `${c} AI产品 招聘 校招 实习 2026`, broad: `AI产品经理 招聘 校招 实习 2026`, community: 'AI产品 校招 实习 2026 2027届 汇总', days: 14 },
}

const G = {
  'G1-逐公司': {
    async run(k) {
      const all = []
      for (const c of COMPANIES) {
        all.push(...await search(k.query(c), 5, k.days))
      }
      all.push(...await search(k.community, 5, k.days, ['nowcoder.com','yingjiesheng.com']))
      return all
    }
  },
  'G2-双层': {
    async run(k) {
      const [com, broad] = await Promise.all([
        search(k.community, 10, k.days, ['nowcoder.com','yingjiesheng.com']),
        search(`${k.broad} ${BIG.join(' ')} ${CITIES}`, 10, k.days),
      ])
      return [...com, ...broad]
    }
  },
  'G3-合并': {
    async run(k) {
      return await search(`${k.broad} ${COMPANIES.join(' ')} ${CITIES}`, 15, k.days)
    }
  },
}

const L = {
  'L1-batch-nothink': {
    desc: '批量提取, thinking=disabled',
    async run(results) {
      const u = dedup(results)
      const c = u.map((r,i) => `[${i+1}] ${r.title}\nURL:${r.url}\n${(r.content||'').slice(0,300)}`).join('\n\n')
      const out = await llm({ prompt: EXTRACT_PROMPT(COMPANIES, TODAY, c.slice(0,25000)), think: false })
      const p = safeParse(out.content)
      return { events: (p&&Array.isArray(p.events)) ? p.events : [], elapsed: out.elapsed, raw: out.content.slice(0,500) }
    }
  },
  'L2-batch-think': {
    desc: '批量提取, thinking=enabled',
    async run(results) {
      const u = dedup(results)
      const c = u.map((r,i) => `[${i+1}] ${r.title}\nURL:${r.url}\n${(r.content||'').slice(0,300)}`).join('\n\n')
      const out = await llm({ prompt: EXTRACT_PROMPT(COMPANIES, TODAY, c.slice(0,25000)), think: true })
      const p = safeParse(out.content)
      return { events: (p&&Array.isArray(p.events)) ? p.events : [], elapsed: out.elapsed, raw: out.content.slice(0,500) }
    }
  },
  'L3-individual-nothink': {
    desc: '逐公司提取, thinking=disabled (当前)',
    async run(results) {
      const u = dedup(results)
      const all = []
      for (const c of COMPANIES.slice(0,5)) {
        const rel = u.filter(r => (r.title||''+r.content||'').includes(c)).slice(0,5)
        if (!rel.length) continue
        const c2 = rel.map((r,i) => `[${i+1}] ${r.title}\nURL:${r.url}\n${(r.content||'').slice(0,300)}`).join('\n\n')
        const out = await llm({ prompt: EXTRACT_PROMPT_ONE(c, TODAY, c2.slice(0,8000)), think: false })
        const p = safeParse(out.content)
        if (p&&Array.isArray(p.events)) all.push(...p.events)
      }
      return { events: all, elapsed: 0 }
    }
  },
}

// ═══════════════ 工具 ═══════════════

async function search(query, max, days, domains) {
  const body = { api_key: TAVILY_KEY, query, search_depth: 'basic', max_results: max, include_answer: false }
  if (days) body.days = days
  if (domains?.length) body.include_domains = domains
  const res = await fetch(TAVILY_URL, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) })
  if (!res.ok) throw new Error(`Tavily ${res.status}`)
  return (await res.json()).results || []
}

async function llm({ prompt, think, temp = 0.3, maxTok = 4096 }) {
  const body = { model: LLM_MODEL, messages: [{ role:'user', content: prompt }], temperature: temp, max_tokens: maxTok }
  body.thinking = think ? { type:'enabled' } : { type:'disabled' }
  const start = Date.now()
  const res = await fetch(LLM_URL, {
    method:'POST', headers:{'Authorization':`Bearer ${LLM_KEY}`,'Content-Type':'application/json','User-Agent':'claude-code/0.1.0'},
    body:JSON.stringify(body),
  })
  const data = await res.json()
  return { content: data.choices?.[0]?.message?.content || '', elapsed: Date.now() - start }
}

function dedup(r) { const s=new Set(); return r.filter(x=>{const k=(x.url||'').replace(/\?.*$/,'').replace(/\/+$/,''); if(!k||s.has(k))return false; s.add(k);return true}) }
function safeParse(t) { try { const c=t.replace(/```json\s*/g,'').replace(/```/g,'').trim(); const i=Math.min(c.indexOf('{')===-1?Infinity:c.indexOf('{'),c.indexOf('[')===-1?Infinity:c.indexOf('[')); if(i===Infinity)return null; return JSON.parse(c.slice(i)) } catch { return null } }

// ═══════════════ Prompts ═══════════════

const EXTRACT_PROMPT = (companies, today, content) => `# 求职新动态提取

从搜索结果中找出这些公司的2026/2027届校招/实习新动态：

关注公司：${companies.join('、')}
当前日期：${today}（2026年7月，暑期实习+秋招提前批季节）

搜索结果：
\`\`\`
${content}
\`\`\`

要求：
1. 输出 JSON：{"events":[{"company":"公司名","eventType":"秋招开启|新岗位|实习招聘|线下活动|宣讲会|其他","title":"一句话事件描述","date":"YYYY-MM-DD（推断不出留空）","summary":"2-3句关键信息","url":"来源链接"}]}
2. 公司名必须是关注公司列表中的名称
3. 以下属于有效事件：校招/秋招/提前批/实习招聘开启、AI产品岗位发布、宣讲会/openday、笔试面试通知
4. 以下跳过：股价/财报/融资、产品发布、高管离职、科普文章、纯广告
5. 同一事件去重保留最完整的
6. 没有有效事件返回 {"events":[]}
7. 不要编造任何信息`

const EXTRACT_PROMPT_ONE = (company, today, content) => `# 求职新动态提取

从搜索结果中找出 ${company} 的2026/2027届校招/实习新动态。
当前日期：${today}

搜索结果：
\`\`\`
${content}
\`\`\`

要求：
1. 输出 JSON：{"events":[{"company":"${company}","eventType":"秋招开启|新岗位|实习招聘|线下活动|宣讲会|其他","title":"一句话","date":"YYYY-MM-DD","summary":"2-3句","url":"链接"}]}
2. 仅限${company}及其子品牌的事件
3. 没有有效事件返回 {"events":[]}`

const SEARCH_JUDGE_PROMPT = `你是一位招聘信息质量评估员。对以下搜索结果逐一评分。

关注公司：${COMPANIES.join('、')}
目标场景：AI产品经理岗位的2026/2027届校招或实习信息

搜索结果：
{{RESULTS}}

请返回 JSON 数组：
[{
  "index": 0,
  "relevance": 1-5,
  "contentType": "校招公告|岗位信息|实习招聘|面经|汇总帖|行业新闻|无关",
  "companiesFound": ["公司名"],
  "hasActionableInfo": true/false,
  "isCurrentSeason": true/false,
  "brief": "简短理由"
}]

只输出 JSON 数组，以 [ 开头、以 ] 结尾。`

const LLM_JUDGE_PROMPT = (results, events) => `评估以下事件提取质量。

原始搜索结果（摘要）：
${results.slice(0,3000)}

提取的事件：
\`\`\`json
${JSON.stringify(events)}
\`\`\`

评分维度（1-5）：
- accuracy: 每个事件是否在原文中有据可查
- completeness: 原文中明显的事件是否都提取了
- companyCorrect: 公司归属是否正确
- typeCorrect: 事件类型分类是否正确
- noHallucination: 是否没有编造(5=零编造)

返回 JSON:
{"accuracy":4,"completeness":3,"companyCorrect":5,"typeCorrect":4,"noHallucination":5,"validCount":3,"hallucinatedCount":0,"verdict":"一句话总结"}`

// ═══════════════ 搜索质量评分 ═══════════════

async function judgeSearch(name, results) {
  const u = dedup(results)
  if (!u.length) return { avgRelevance:0, actionable:0, companiesCovered:[], currentSeason:0, scores:[] }

  const compact = u.map((r,i) => ({ index:i, title:(r.title||'').slice(0,100), url:(r.url||'').slice(0,100), content:(r.content||'').slice(0,250) }))
  const prompt = SEARCH_JUDGE_PROMPT.replace('{{RESULTS}}', JSON.stringify(compact))
  const { content } = await llm({ prompt, think: false, temp: 0.1 })
  const scores = safeParse(content)
  if (!Array.isArray(scores)) return { avgRelevance:0, actionable:0, companiesCovered:[], currentSeason:0, scores:[], rawJudge:content.slice(0,300) }

  const v = scores.filter(s=>s&&typeof s.relevance==='number')
  const avg = v.length ? (v.reduce((a,s)=>a+s.relevance,0)/v.length) : 0
  const actionable = v.filter(s=>s.hasActionableInfo).length
  const currentSeason = v.filter(s=>s.isCurrentSeason).length
  const companiesCovered = [...new Set(v.flatMap(s=>s.companiesFound||[]))]
  return { avgRelevance: +avg.toFixed(2), actionable, companiesCovered, currentSeason, scores: v }
}

// ═══════════════ LLM 质量评分 ═══════════════

async function judgeLLM(name, results, events) {
  if (!events.length) return { accuracy:0, completeness:0, companyCorrect:0, typeCorrect:0, noHallucination:5, validCount:0, hallucinatedCount:0, verdict:'无输出' }

  const summary = dedup(results).slice(0,10).map((r,i) => `[${i+1}] ${r.title?.slice(0,80)}: ${(r.content||'').slice(0,150)}`).join('\n')
  const { content } = await llm({ prompt: LLM_JUDGE_PROMPT(summary, events), think: false, temp: 0.1 })
  const scores = safeParse(content)
  if (!scores) return { accuracy:0, completeness:0, companyCorrect:0, typeCorrect:0, noHallucination:3, validCount:events.length, hallucinatedCount:0, verdict:'评分失败', rawJudge:content.slice(0,300) }
  return scores
}

// ═══════════════ Main ═══════════════

async function main() {
  console.log('🔬 因子实验: K(关键词)×G(粒度)×L(LLM策略)')
  console.log(`   ${COMPANIES.length}家公司 | ${TODAY}\n`)

  const searchResults = {}  // { 'K1-G1': { results, quality } }

  // ── Phase 1: K×G = 9 组搜索 ──
  console.log('═'.repeat(65))
  console.log('📡 Phase 1: 搜索策略 K×G (9组)')
  console.log('═'.repeat(65))

  for (const [kn, kv] of Object.entries(K)) {
    for (const [gn, gv] of Object.entries(G)) {
      const key = `${kn}-${gn}`
      const start = Date.now()
      console.log(`\n🔍 ${key}`)
      try {
        const results = await gv.run(kv)
        const u = dedup(results)
        console.log(`   📊 ${results.length}条原/${u.length}条唯一 · ${Date.now()-start}ms`)
        console.log(`   🧠 裁判评分...`)
        const quality = await judgeSearch(key, results)
        searchResults[key] = { results, unique: u.length, elapsed: Date.now()-start, quality }
        console.log(`   📈 相关${quality.avgRelevance}/5 | 可操作${quality.actionable}/${u.length} | 当季${quality.currentSeason} | 覆盖${quality.companiesCovered.length}家`)
      } catch(err) {
        console.log(`   ❌ ${err.message}`)
        searchResults[key] = { error: err.message }
      }
    }
  }

  // ── 排名 ──
  const ranked = Object.entries(searchResults)
    .filter(([,r]) => r.quality?.avgRelevance > 0)
    .map(([k,r]) => {
      const q = r.quality
      const score = (q.avgRelevance/5)*30 + (Math.min(q.actionable/r.unique,1))*25 + (q.currentSeason/Math.max(r.unique,1))*25 + (q.companiesCovered.length/10)*20
      return { key:k, score:+score.toFixed(1), ...r }
    })
    .sort((a,b) => b.score - a.score)

  console.log('\n📊 搜索策略排名 (综合分 = 相关性30% + 可操作率25% + 当季率25% + 公司覆盖20%):\n')
  console.log(`   ${'策略'.padEnd(22)} ${'综合分'.padStart(7)} ${'相关'.padStart(6)} ${'可操作'.padStart(8)} ${'当季'.padStart(6)} ${'覆盖'.padStart(6)}`)
  console.log('   ' + '─'.repeat(60))
  for (const r of ranked.slice(0,6)) {
    const q = r.quality
    console.log(`   ${r.key.padEnd(22)} ${String(r.score).padStart(7)} ${String(q.avgRelevance).padStart(6)} ${(q.actionable+'/'+r.unique).padStart(8)} ${String(q.currentSeason).padStart(6)} ${String(q.companiesCovered.length).padStart(6)}`)
  }

  // ── Phase 2: Top 2 搜索 × 3 LLM = 6 组提取 ──
  console.log('\n' + '═'.repeat(65))
  console.log('🧠 Phase 2: LLM 提取 L1/L2/L3 × Top 2 搜索策略')
  console.log('═'.repeat(65))

  const top2 = ranked.slice(0, 2)
  // Also include current baseline (K1-G1) for comparison
  const baseline = searchResults['K1-秋招-G1-逐公司']
  const testGroups = [...top2]
  if (baseline && !top2.find(t => t.key === 'K1-秋招-G1-逐公司')) {
    testGroups.push({ key: 'K1-秋招-G1-逐公司', results: baseline.results, unique: baseline.unique, quality: baseline.quality })
  }

  const llmResults = {}

  for (const group of testGroups) {
    console.log(`\n📋 搜索策略: ${group.key} (${group.unique}条唯一)`)
    for (const [ln, lv] of Object.entries(L)) {
      const key = `${group.key}-${ln}`
      console.log(`   🧠 ${ln} — ${lv.desc}`)
      try {
        const output = await lv.run(group.results)
        console.log(`      📊 ${output.events.length}个事件 · ${(output.elapsed/1000).toFixed(1)}s`)
        console.log(`      🧠 裁判评分...`)
        const quality = await judgeLLM(key, group.results, output.events)
        llmResults[key] = { events: output.events.length, elapsed: output.elapsed, quality }
        const q = quality
        console.log(`      📈 准确${q.accuracy}/5 完整${q.completeness}/5 公司${q.companyCorrect}/5 类型${q.typeCorrect}/5 无幻觉${q.noHallucination}/5`)
        if (q.verdict) console.log(`      📝 ${q.verdict}`)
      } catch(err) {
        console.log(`      ❌ ${err.message}`)
        llmResults[key] = { error: err.message }
      }
    }
  }

  // ── Phase 3: 综合 ──
  console.log('\n' + '═'.repeat(65))
  console.log('🏆 Phase 3: 最终推荐')
  console.log('═'.repeat(65))

  console.log('\n📊 LLM 策略排名:')
  const llmRanked = Object.entries(llmResults)
    .filter(([,r]) => r.quality?.accuracy > 0)
    .map(([k,r]) => {
      const q = r.quality
      const score = (q.accuracy||0)*0.2 + (q.completeness||0)*0.2 + (q.companyCorrect||0)*0.2 + (q.noHallucination||0)*0.3 + (q.typeCorrect||0)*0.1
      return { key:k, score:+score.toFixed(2), events:r.events, elapsed:r.elapsed, ...q }
    })
    .sort((a,b) => b.score - a.score)

  console.log(`   ${'策略'.padEnd(35)} ${'综合'.padStart(6)} ${'事件'.padStart(5)} ${'耗时'.padStart(8)} ${'准确'.padStart(5)} ${'完整'.padStart(5)} ${'无幻觉'.padStart(7)}`)
  console.log('   ' + '─'.repeat(80))
  for (const r of llmRanked) {
    console.log(`   ${r.key.padEnd(35)} ${String(r.score).padStart(6)} ${String(r.events).padStart(5)} ${((r.elapsed/1000).toFixed(0)+'s').padStart(8)} ${String(r.accuracy).padStart(5)} ${String(r.completeness).padStart(5)} ${String(r.noHallucination).padStart(7)}`)
    if (r.verdict) console.log(`   📝 ${r.verdict}`)
  }

  // Final
  const bestSearch = ranked[0]
  const bestLLM = llmRanked[0]
  console.log('\n💡 最终推荐:')
  console.log(`   搜索: ${bestSearch.key} (${K[bestSearch.key.split('-')[0]+'-'+bestSearch.key.split('-')[1].split('-')[0]] ? '...' : ''}相关${bestSearch.quality.avgRelevance}/5)`)
  console.log(`   LLM:  ${bestLLM.key}`)
  console.log(`   Tavily: 40 → ?次 | LLM: ~40 → ?次`)

  // Save
  const out = { timestamp: new Date().toISOString(), searchRanking: ranked, llmRanking: llmRanked, bestSearch: bestSearch?.key, bestLLM: bestLLM?.key }
  require('fs').writeFileSync(require('path').resolve(process.cwd(), 'scripts', 'factor-experiment.json'), JSON.stringify(out, null, 2))
  console.log(`\n📁 结果: scripts/factor-experiment.json`)
}

main().catch(err => { console.error('失败:', err); process.exit(1) })
