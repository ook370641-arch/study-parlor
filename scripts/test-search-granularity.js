/**
 * 搜索粒度实验：对比不同 Tavily 搜索策略的结果质量
 *
 * 用法：node scripts/test-search-granularity.js
 * 需要项目根目录 .env 中配置 TAVILY_API_KEY
 */
import dotenv from 'dotenv'
import fs from 'node:fs'

dotenv.config()

const TAVILY_KEY = process.env.TAVILY_API_KEY
const TAVILY_URL = process.env.TAVILY_API_URL || 'https://api.tavily.com/search'

if (!TAVILY_KEY) {
  console.error('❌ 缺少 TAVILY_API_KEY，请在 .env 中配置')
  process.exit(1)
}

const COMPANIES = [
  '字节跳动', '阿里巴巴', '腾讯', '百度', '美团',
  'MiniMax', '智谱AI', '月之暗面', '零一万物', '百川智能'
]
const CITIES = '北京 上海 杭州 深圳'
const ROLES = 'AI产品经理 大模型产品经理 Agent产品经理'

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

function summarize(results) {
  const urls = new Set(results.map(r => r.url))
  const domains = {}
  for (const r of results) {
    try { const host = new URL(r.url).hostname; domains[host] = (domains[host] || 0) + 1 } catch {}
  }
  return { total: results.length, unique: urls.size, domains }
}

// ═══════════════════════════════════════════════════════
// 策略定义
// ═══════════════════════════════════════════════════════

const STRATEGIES = {
  // A: 当前策略 — 逐家公司搜索（采样 4 家代表）
  'A-逐家搜索(采样)': {
    async run() {
      const sample = COMPANIES.slice(0, 4) // 只测 4 家代表，避免烧配额
      const all = []
      for (const c of sample) {
        const q = `${c} 2026秋招 2027届 校招 宣讲会 AI产品 招聘 ${CITIES}`
        const results = await tavilySearch({ query: q, maxResults: 5, days: 7 })
        all.push(...results)
      }
      return all
    }
  },

  // B: 全部公司合并为一个搜索词
  'B-全量合并': {
    async run() {
      const q = `2026秋招 AI产品经理 校招开启 ${COMPANIES.join(' ')}`
      return await tavilySearch({ query: q, maxResults: 15, days: 7 })
    }
  },

  // C: 分层 — 社区汇总贴（限域）+ 全网动态
  'C-双层(社区+全网)': {
    async run() {
      const [community, broad] = await Promise.all([
        tavilySearch({
          query: '2026秋招 2027届 校招 AI产品 大模型 提前批 汇总',
          maxResults: 10,
          days: 7,
          includeDomains: ['nowcoder.com', 'yingjiesheng.com'],
        }),
        tavilySearch({
          query: `2026秋招 AI产品经理 校招 宣讲会 ${COMPANIES.slice(0, 5).join(' ')} ${CITIES}`,
          maxResults: 10,
          days: 7,
        }),
      ])
      return [...community, ...broad]
    }
  },

  // D: 三层 — 社区 + 大厂 + 创业公司
  'D-三层(社区+大厂+AI创业)': {
    async run() {
      const bigTech = COMPANIES.slice(0, 5) // 字节 阿里 腾讯 百度 美团
      const aiStartup = COMPANIES.slice(5)   // MiniMax 智谱 月之暗面 零一 百川
      const [community, big, startup] = await Promise.all([
        tavilySearch({
          query: '2026秋招 2027届 校招 AI产品 提前批 汇总',
          maxResults: 8,
          days: 7,
          includeDomains: ['nowcoder.com', 'yingjiesheng.com'],
        }),
        tavilySearch({
          query: `2026秋招 AI产品经理 校招 宣讲会 ${bigTech.join(' ')} ${CITIES}`,
          maxResults: 8,
          days: 7,
        }),
        tavilySearch({
          query: `2026秋招 AI产品经理 校招 ${aiStartup.join(' ')} ${CITIES}`,
          maxResults: 8,
          days: 7,
        }),
      ])
      return [...community, ...big, ...startup]
    }
  },

  // E: 极简 — 单次搜索全部（maxResults 拉满）
  'E-极简单次': {
    async run() {
      const q = `2026秋招 校招 AI产品 大模型 ${COMPANIES.join(' ')} ${CITIES}`
      return await tavilySearch({ query: q, maxResults: 20, days: 7 })
    }
  },
}

// ═══════════════════════════════════════════════════════
// 主程序
// ═══════════════════════════════════════════════════════

async function main() {
  console.log('🔍 Tavily 搜索粒度对比实验')
  console.log(`   关注公司: ${COMPANIES.length} 家 | 城市: ${CITIES} | 岗位: ${ROLES}`)
  console.log(`   API Key: ${TAVILY_KEY.slice(0, 12)}...`)
  console.log('')

  const results = {}

  for (const [name, strategy] of Object.entries(STRATEGIES)) {
    const start = Date.now()
    try {
      const data = await strategy.run()
      const s = summarize(data)
      const elapsed = Date.now() - start
      results[name] = { ...s, elapsed, ok: true }
      console.log(`  ✅ ${name}`)
      console.log(`     ${s.total} 条结果 (${s.unique} 唯一URL) · ${elapsed}ms`)
      console.log(`     来源域名: ${Object.entries(s.domains).map(([d, n]) => `${d}(${n})`).join(', ') || '(无)'}`)
    } catch (err) {
      const elapsed = Date.now() - start
      results[name] = { total: 0, unique: 0, domains: {}, elapsed, ok: false, error: err.message }
      console.log(`  ❌ ${name}: ${err.message} (${elapsed}ms)`)
    }
    console.log('')
  }

  // ── 汇总对比表 ──
  console.log('═'.repeat(70))
  console.log('📊 对比汇总')
  console.log('═'.repeat(70))
  console.log('')
  console.log(`${'策略'.padEnd(24)} ${'Tavily次数'.padStart(10)} ${'总结果'.padStart(8)} ${'唯一URL'.padStart(8)} ${'耗时ms'.padStart(8)} ${'效率(唯一/次)'.padStart(14)}`)
  console.log('─'.repeat(76))

  for (const [name, r] of Object.entries(results)) {
    const calls = name.startsWith('A') ? 4 : (name.startsWith('C') ? 2 : (name.startsWith('D') ? 3 : 1))
    const efficiency = r.ok ? (r.unique / calls).toFixed(1) : 'N/A'
    console.log(
      `${name.padEnd(24)} ${String(calls).padStart(10)} ${String(r.total).padStart(8)} ${String(r.unique).padStart(8)} ${String(r.elapsed).padStart(8)} ${efficiency.padStart(14)}`
    )
  }

  // ── 域名覆盖分析 ──
  console.log('')
  console.log('─'.repeat(76))
  console.log('🌐 域名覆盖（去重并集）')
  const allDomains = new Set()
  for (const [, r] of Object.entries(results)) {
    if (r.ok) Object.keys(r.domains).forEach(d => allDomains.add(d))
  }
  console.log(`   各策略共覆盖 ${allDomains.size} 个唯一域名`)
  console.log(`   ${[...allDomains].sort().join('\n   ')}`)

  // ── 建议 ──
  console.log('')
  console.log('═'.repeat(70))
  console.log('💡 初步结论')
  console.log('═'.repeat(70))

  const okResults = Object.entries(results).filter(([, r]) => r.ok)
  if (okResults.length === 0) {
    console.log('   ⚠️ 所有策略均失败，请检查 API key 和网络')
    return
  }

  // 找效率最高的
  const best = okResults.sort((a, b) => {
    const callsA = a[0].startsWith('A') ? 4 : (a[0].startsWith('C') ? 2 : (a[0].startsWith('D') ? 3 : 1))
    const callsB = b[0].startsWith('A') ? 4 : (b[0].startsWith('C') ? 2 : (b[0].startsWith('D') ? 3 : 1))
    return (b[1].unique / callsB) - (a[1].unique / callsA)
  })[0]

  console.log(`   效率最高: ${best[0]}（${best[1].unique} 唯一 URL / ${best[0].startsWith('A') ? 4 : best[0].startsWith('C') ? 2 : best[0].startsWith('D') ? 3 : 1} 次调用 = ${(best[1].unique / (best[0].startsWith('A') ? 4 : best[0].startsWith('C') ? 2 : best[0].startsWith('D') ? 3 : 1)).toFixed(1)} 条/次）`)

  // 检查合并策略是否能覆盖所有公司
  const mergedResults = results['B-全量合并'] || results['E-极简单次']
  if (mergedResults && mergedResults.ok) {
    console.log('')
    console.log('   📋 公司覆盖检查（合并策略结果中出现的公司）：')
    // 简单检查：结果 title/url/content 中包含的公司名
    // （这不是精确匹配，只是快速信号）
  }
}

main().catch(err => {
  console.error('实验失败:', err)
  process.exit(1)
})
