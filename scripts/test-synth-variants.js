/**
 * 合成策略对照实验：
 *   变体A — 合成prompt中直接要求输出"导师笔记"+"提问方向"（单次LLM）
 *   变体B — 合成后额外调一次LLM生成"导师笔记"+"提问方向"（两次LLM）
 *
 * 同一批搜索结果，仅合成策略不同。
 * 用法：node scripts/test-synth-variants.js
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

// ─── 两轮搜索（共享，只跑一次）──────────────────────────

async function runSearch() {
  console.log('🔭 执行两轮搜索（两个变体共享这批结果）...\n')

  // 第1轮：探索查询
  console.log('📝 第1轮：生成探索查询词...')
  const q1Prompt = `用户想研究：「${TOPIC}」

请生成 2-3 个宽域搜索查询词，用于全面了解这个主题。要求：
- 覆盖不同角度（架构设计、工程实践、对比分析、底层原理）
- 查询词简短、精准，适合英文搜索引擎
- 查询词用英文（此类技术资料英文质量更高）
只输出 JSON 数组：["查询1", "查询2"]`

  const q1Text = await llm([{ role: 'user', content: q1Prompt }])
  const r1Queries = JSON.parse(extractJsonArray(q1Text) || '[]')
  console.log('  查询词:', r1Queries)

  console.log('  并行搜索...')
  const r1Settled = await Promise.allSettled(r1Queries.map(q => tavilySearch({ query: q, maxResults: 6 })))
  const r1Results = r1Settled.filter(r => r.status === 'fulfilled').flatMap(r => r.value)
  console.log('  第1轮结果:', r1Results.length, '条\n')

  // 子维度识别
  console.log('🎯 识别子维度...')
  const dimPrompt = `以下是关于「${TOPIC}」的第一轮网络搜索结果。请通读，识别 2-4 个值得深挖的子维度，生成精准搜索查询词。

第一轮结果：
${formatResults(r1Results, 'R1')}

只输出 JSON 数组：["查询1", "查询2"]`

  const dimText = await llm([{ role: 'user', content: dimPrompt }])
  const dimQueries = JSON.parse(extractJsonArray(dimText) || '[]')
  console.log('  查询词:', dimQueries)

  // 第2轮
  console.log('  并行搜索...')
  const r2Settled = await Promise.allSettled(dimQueries.map(q => tavilySearch({ query: q, maxResults: 5 })))
  const r2Results = r2Settled.filter(r => r.status === 'fulfilled').flatMap(r => r.value)
  console.log('  第2轮结果:', r2Results.length, '条\n')

  return { r1Queries, r1Results, dimQueries, r2Results }
}

// ─── 共享的报告prompt（两个变体的基础）─────────────────────

function buildReportPrompt(topic, r1Results, r2Results) {
  return `你是一位技术研究助手。以下是从两轮网络搜索得到的关于「${topic}」的资料。

## 第一轮（全景扫描）
${formatResults(r1Results, 'R1')}

## 第二轮（子维度深钻）
${formatResults(r2Results, 'R2')}

请撰写一份结构化的研究报告。要求：

1. 输出纯 markdown 格式，控制在 4000 字以内
2. 结构灵活但不失深度——根据材料自然产生的维度组织章节，而不是套固定模板
3. 优先使用：对比表格、分层分析、关键数据点
4. 每个事实性陈述后附上来源编号 [1] [2] ...
5. 如果材料之间存在矛盾或不同观点，明确指出
6. 结尾附"关键收获"：3-5 条最值得记住的要点
7. 结尾附"来源列表"

写作风格：资深工程师写的内部技术备忘录。`
}

// ─── 变体A：单次LLM（报告 + 导师笔记 + 提问方向全在一个prompt）───

async function variantA(topic, r1Results, r2Results) {
  console.log('🧪 变体A：单次LLM（报告内嵌导师笔记+提问方向）')

  const basePrompt = buildReportPrompt(topic, r1Results, r2Results)

  const extraSection = `

---

报告写完后，请追加以下两个部分（用 markdown 分隔线 --- 隔开）：

### 导师备课笔记
将本报告的核心知识转化为苏格拉底式导师的备课参考。包含：核心概念（2-4个）、关键区分点、常见误解（2-3个）、前置知识。风格：导师知道但不直接告诉学生的背景笔记。控制在 800 字以内。

### 提问方向
基于报告内容，给出 3-5 个苏格拉底式提问方向，用于引导学生自己发现这些知识。每个提问方向包含：引导问题 + 期望学生最终自己发现的结论。`

  const prompt = basePrompt + extraSection

  const startTime = Date.now()
  const output = await llm([{ role: 'user', content: prompt }], {
    temperature: 0.5,
    maxTokens: 10000,
    thinking: { type: 'enabled' },
    reasoningEffort: 'high',
  })
  console.log(`  耗时: ${((Date.now() - startTime) / 1000).toFixed(1)}s · 输出: ${output.length} 字符`)
  return output
}

// ─── 变体B：两次LLM（报告 → 独立节点补充导师笔记+提问方向）───

async function variantB(topic, r1Results, r2Results) {
  console.log('🧪 变体B：两次LLM（先报告 → 再补充导师笔记+提问方向）')

  // Step 1: 仅合成报告
  const t1 = Date.now()
  const reportPrompt = buildReportPrompt(topic, r1Results, r2Results)
  const report = await llm([{ role: 'user', content: reportPrompt }], {
    temperature: 0.5,
    maxTokens: 8192,
    thinking: { type: 'enabled' },
    reasoningEffort: 'high',
  })
  const reportTime = Date.now() - t1
  console.log(`  报告耗时: ${(reportTime / 1000).toFixed(1)}s · ${report.length} 字符`)

  // Step 2: 独立节点 — 基于已生成的报告，补充导师笔记 + 提问方向
  const t2 = Date.now()
  const supplementPrompt = `以下是一份关于「${topic}」的研究报告。

---
${report}
---

请基于以上报告，生成以下两部分内容：

### 导师备课笔记
将报告的核心知识转化为苏格拉底式导师的备课参考。包含：核心概念（2-4个）、关键区分点、常见误解（2-3个）、前置知识。风格：导师知道但不直接告诉学生的背景笔记。控制在 800 字以内。

### 提问方向
基于报告内容，给出 3-5 个苏格拉底式提问方向，用于引导学生自己发现这些知识。每个提问方向包含：引导问题 + 期望学生最终自己发现的结论。

请用 markdown 分隔线 --- 隔开两个部分。`

  const supplement = await llm([{ role: 'user', content: supplementPrompt }], {
    temperature: 0.5,
    maxTokens: 4096,
    thinking: { type: 'enabled' },
    reasoningEffort: 'high',
  })
  const suppTime = Date.now() - t2
  console.log(`  补充耗时: ${(suppTime / 1000).toFixed(1)}s · ${supplement.length} 字符`)

  const combined = report + '\n\n---\n\n' + supplement
  console.log(`  总耗时: ${((reportTime + suppTime) / 1000).toFixed(1)}s · 合计: ${combined.length} 字符`)
  return combined
}

// ─── 主程序 ─────────────────────────────────────────────

async function main() {
  console.log('🧪 合成策略对照实验')
  console.log(`   主题: ${TOPIC}`)
  console.log(`   LLM: ${DEEPSEEK_MODEL}`)
  console.log('   变体A: 单次LLM（报告内嵌导师笔记+提问方向）')
  console.log('   变体B: 两次LLM（报告 → 独立节点补充）')
  console.log('')

  const totalStart = Date.now()

  // ── 共享搜索 ──
  const searchStart = Date.now()
  const { r1Queries, r1Results, dimQueries, r2Results } = await runSearch()
  const searchTime = (Date.now() - searchStart) / 1000

  // ── 变体A ──
  let outputA = ''
  try {
    outputA = await variantA(TOPIC, r1Results, r2Results)
  } catch (err) {
    outputA = '变体A 失败: ' + err.message
    console.error('变体A 失败:', err.message)
  }

  // ── 变体B ──
  let outputB = ''
  try {
    outputB = await variantB(TOPIC, r1Results, r2Results)
  } catch (err) {
    outputB = '变体B 失败: ' + err.message
    console.error('变体B 失败:', err.message)
  }

  const totalTime = (Date.now() - totalStart) / 1000

  // ── 输出预览 ────────────────────────────────────────────

  console.log('\n' + '='.repeat(70))
  console.log('📋 变体A 预览（前500字）')
  console.log('='.repeat(70))
  console.log(outputA.slice(0, 500) + '...')

  console.log('\n' + '='.repeat(70))
  console.log('📋 变体B 预览（前500字）')
  console.log('='.repeat(70))
  console.log(outputB.slice(0, 500) + '...')

  // ── 保存 ────────────────────────────────────────────

  const outputDir = path.resolve('.', '.experiment-results')
  fs.mkdirSync(outputDir, { recursive: true })
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)

  // 变体A
  const fileA = path.join(outputDir, `synth-variant-A-${ts}.md`)
  fs.writeFileSync(fileA, [
    '# 合成策略对照实验 — 变体A：单次LLM（报告内嵌导师笔记+提问方向）',
    '',
    `- **主题**: ${TOPIC}`,
    `- **第1轮查询**: ${r1Queries.join(', ')}`,
    `- **第2轮查询**: ${dimQueries.join(', ')}`,
    `- **搜索结果**: 第1轮 ${r1Results.length} 条 + 第2轮 ${r2Results.length} 条`,
    '',
    '---',
    '',
    outputA,
  ].join('\n'), 'utf8')

  // 变体B
  const fileB = path.join(outputDir, `synth-variant-B-${ts}.md`)
  fs.writeFileSync(fileB, [
    '# 合成策略对照实验 — 变体B：两次LLM（报告 → 独立节点补充）',
    '',
    `- **主题**: ${TOPIC}`,
    `- **第1轮查询**: ${r1Queries.join(', ')}`,
    `- **第2轮查询**: ${dimQueries.join(', ')}`,
    `- **搜索结果**: 第1轮 ${r1Results.length} 条 + 第2轮 ${r2Results.length} 条`,
    '',
    '---',
    '',
    outputB,
  ].join('\n'), 'utf8')

  // ── 统计对比 ────────────────────────────────────────────

  console.log('\n' + '='.repeat(70))
  console.log('📊 统计对比')
  console.log('='.repeat(70))
  console.log(`搜索耗时: ${searchTime.toFixed(1)}s · Tavily: ${r1Queries.length + dimQueries.length} 次 · 总计 ${r1Results.length + r2Results.length} 条结果`)
  console.log('')
  console.log(`${'指标'.padEnd(30)} ${'变体A（单次LLM）'.padStart(25)} ${'变体B（两次LLM）'.padStart(25)}`)
  console.log('-'.repeat(80))
  console.log(`${'输出总字符'.padEnd(30)} ${String(outputA.length).padStart(25)} ${String(outputB.length).padStart(25)}`)
  console.log(`${'LLM调用次数'.padEnd(30)} ${String('1').padStart(25)} ${String('2').padStart(25)}`)

  // 粗略估算：导师笔记+提问方向在变体A中占的比例
  // 找 "导师备课笔记" 出现位置
  const aTutorIdx = outputA.indexOf('导师备课笔记')
  const bTutorIdx = outputB.indexOf('导师备课笔记')
  if (aTutorIdx > 0) {
    const reportLenA = aTutorIdx
    const extraLenA = outputA.length - aTutorIdx
    console.log(`${'报告主体估算'.padEnd(30)} ${String(reportLenA + ' 字符').padStart(25)} ${'--'.padStart(25)}`)
    console.log(`${'导师笔记+提问估算'.padEnd(30)} ${String(extraLenA + ' 字符').padStart(25)} ${'--'.padStart(25)}`)
  }
  if (bTutorIdx > 0) {
    const reportLenB = bTutorIdx
    const extraLenB = outputB.length - bTutorIdx
    console.log(`${'报告主体估算'.padEnd(30)} ${'--'.padStart(25)} ${String(reportLenB + ' 字符').padStart(25)}`)
    console.log(`${'导师笔记+提问估算'.padEnd(30)} ${'--'.padStart(25)} ${String(extraLenB + ' 字符').padStart(25)}`)
  }

  console.log('')
  console.log(`💾 变体A 已保存: ${fileA}`)
  console.log(`💾 变体B 已保存: ${fileB}`)

  console.log('\n' + '='.repeat(70))
  console.log('🔍 关键对比问题')
  console.log('='.repeat(70))
  console.log('1. 变体A的报告主体是否因要同时输出导师笔记而变"薄"了？')
  console.log('2. 变体B的导师笔记是否因独立生成而更有深度（能引用报告具体段落）？')
  console.log('3. 提问方向在两个变体中，哪个更具体、更贴合报告内容？')
  console.log(`\n⏱ 总耗时: ${totalTime.toFixed(1)}s`)
}

main().catch(err => {
  console.error('未捕获错误:', err)
  process.exit(1)
})
