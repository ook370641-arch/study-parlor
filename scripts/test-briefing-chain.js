import dotenv from 'dotenv'
import fs from 'node:fs'
import path from 'node:path'

dotenv.config()

const BASE_URL = (process.env.KIMI_BASE_URL || 'https://api.deepseek.com/v1').replace(/\/+$/, '')
const API_KEY = process.env.KIMI_API_KEY
const MODEL = process.env.KIMI_MODEL || 'deepseek-v4-pro'

async function fetchJson(url) {
  const ctl = new AbortController()
  const t = setTimeout(() => ctl.abort(), 30_000)
  try {
    const res = await fetch(url, {
      signal: ctl.signal,
      headers: { 'User-Agent': 'study-parlor/1.0' },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return res.json()
  } finally {
    clearTimeout(t)
  }
}

function buildExtractionPrompt({ feedX, feedPodcasts, feedBlogs }) {
  const profileContext = '用户背景：AI 从业者，关注行业动态。'
  const schema = {
    builders: [{ name: '...', role: '...', handle: '...', summary: '...', key_url: '...' }],
    podcasts: [{ show: '...', episode: '...', url: '...', takeaway: '...', summary: '...', quote: '...' }],
    blogs: [{ blog: '...', title: '...', url: '...', summary: '...', quote: '...' }],
  }
  return [
    `# Follow Builders Structured Extraction`,
    ``,
    profileContext,
    ``,
    `## Output format`,
    `Output ONLY a single JSON object matching the schema below. Do not include markdown code fences or explanations.`,
    ``,
    '```json\n' + JSON.stringify(schema, null, 2) + '\n```',
    ``,
    `## Summary instructions`,
    `### summarize-tweets`,
    `提取每位 builder 的核心观点，保留关键 URL。`,
    ``,
    `### summarize-podcast`,
    `提取播客单集要点、quote 和 takeaway。`,
    ``,
    `### summarize-blogs`,
    `提取博客文章核心论点和 quote。`,
    ``,
    `## Feeds`,
    `### X/Twitter`,
    '```json\n' + JSON.stringify(feedX, null, 2) + '\n```',
    `### Podcasts`,
    '```json\n' + JSON.stringify(feedPodcasts, null, 2) + '\n```',
    `### Blogs`,
    '```json\n' + JSON.stringify(feedBlogs, null, 2) + '\n```',
  ].join('\n')
}

function buildAssemblyPrompt(structured) {
  return [
    `# Bilingual Digest Assembly`,
    ``,
    `将以下结构化摘要组装成一份中英文双语行业简报。`,
    ``,
    `## Structured summaries to assemble`,
    '```json\n' + JSON.stringify(structured, null, 2) + '\n```',
    ``,
    `Write the final digest in Markdown following the section order and bilingual interleaving rules above.`,
  ].join('\n')
}

async function chat({ messages, temperature, thinking, label, maxTokens = 16384 }) {
  const body = {
    model: MODEL,
    stream: false,
    messages,
    temperature,
    max_tokens: maxTokens,
  }
  if (thinking) {
    body.thinking = { type: 'enabled' }
    body.reasoning_effort = 'high'
  } else {
    body.thinking = { type: 'disabled' }
  }

  const start = Date.now()
  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
      'User-Agent': 'claude-code/0.1.0',
    },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  const elapsed = Date.now() - start
  console.log(`[${label}] status=${res.status} time=${elapsed}ms response-size=${text.length}`)
  if (!res.ok) {
    console.error('  error:', text.slice(0, 500))
    throw new Error(`HTTP ${res.status}`)
  }
  const json = JSON.parse(text)
  return json.choices?.[0]?.message?.content ?? ''
}

async function main() {
  console.log('=== Briefing chain smoke test with real feeds ===')
  const feedX = await fetchJson('https://raw.githubusercontent.com/zarazhangrui/follow-builders/main/feed-x.json').catch(e => (console.error('feed-x failed', e.message), null))
  const feedPodcasts = await fetchJson('https://raw.githubusercontent.com/zarazhangrui/follow-builders/main/feed-podcasts.json').catch(e => (console.error('feed-podcasts failed', e.message), null))
  const feedBlogs = await fetchJson('https://raw.githubusercontent.com/zarazhangrui/follow-builders/main/feed-blogs.json').catch(e => (console.error('feed-blogs failed', e.message), null))

  if (!feedX && !feedPodcasts && !feedBlogs) {
    console.error('No feeds available, aborting')
    process.exit(1)
  }

  const extractionPrompt = buildExtractionPrompt({ feedX, feedPodcasts, feedBlogs })
  console.log('Extraction prompt length:', extractionPrompt.length)

  const structuredRaw = await chat({ messages: [{ role: 'user', content: extractionPrompt }], temperature: 0.5, thinking: true, label: 'extraction' })
  console.log('Structured output preview:', structuredRaw.slice(0, 300))

  const assemblyPrompt = buildAssemblyPrompt(structuredRaw)
  console.log('Assembly prompt length:', assemblyPrompt.length)

  const content = await chat({ messages: [{ role: 'user', content: assemblyPrompt }], temperature: 0.5, thinking: true, label: 'assembly' })
  console.log('Assembly output preview:', content.slice(0, 300))
  console.log('\n=== Briefing chain OK ===')
}

main().catch((err) => {
  console.error('\n=== Briefing chain FAILED ===', err)
  process.exit(1)
})
