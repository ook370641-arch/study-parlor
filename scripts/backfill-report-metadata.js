#!/usr/bin/env node
/**
 * Backfill missing `description` and `progress_summary` for old progress reports.
 * Reads report body, calls LLM to generate metadata, updates frontmatter in-place.
 */

const fs = require('fs')
const path = require('path')
const matter = require('gray-matter')

const STUDY_LIBRARY_PATH = process.env.STUDY_LIBRARY_PATH
  || 'c:/Users/86468/Desktop/工作与学习/学习库'

// Load .env for API key
const envPath = path.resolve(__dirname, '..', '.env')
if (fs.existsSync(envPath)) {
  const envRaw = fs.readFileSync(envPath, 'utf8')
  for (const line of envRaw.split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
  }
}

const API_KEY = process.env.KIMI_API_KEY
const BASE_URL = process.env.KIMI_BASE_URL || 'https://api.kimi.com/coding/v1'
const MODEL = process.env.KIMI_MODEL || 'kimi-k2.6'

if (!API_KEY) {
  console.error('KIMI_API_KEY not found in .env')
  process.exit(1)
}

const HEADERS = {
  Authorization: `Bearer ${API_KEY}`,
  'Content-Type': 'application/json',
  'User-Agent': 'claude-code/0.1.0',
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

function extractJson(text) {
  text = text.trim()
  // Try code block first
  const cb = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/)
  if (cb) text = cb[1].trim()
  // Find first {...}
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start >= 0 && end > start) {
    return text.slice(start, end + 1)
  }
  return null
}

async function generateMetadata(title, body) {
  const truncatedBody = body.length > 8000 ? body.slice(0, 8000) + '\n\n[truncated...]' : body

  const prompt = `以下是一份学习报告的 markdown 正文。请从中提取：

1. description: 一句话副标题（15-30字），概括主题范围和内容，不要重复标题本身
2. progress_summary: 一句话学习进度摘要（30-60字），概括已掌握的核心内容或关键认知

请严格输出 JSON，不要其他文字：

{"description":"...","progress_summary":"..."}

报告标题：${title}

报告正文：
---
${truncatedBody}
---`

  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({
      model: MODEL,
      stream: false,
      temperature: 0.3,
      messages: [{ role: 'user', content: prompt }],
      thinking: { type: 'disabled' },
    }),
  })

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${await res.text()}`)
  }

  const json = await res.json()
  const text = json.choices[0]?.message?.content ?? ''

  const extracted = extractJson(text)
  if (!extracted) {
    throw new Error(`No JSON found in response: ${text.slice(0, 200)}`)
  }

  const result = JSON.parse(extracted)
  if (!result.description || !result.progress_summary) {
    throw new Error(`Missing fields in JSON: ${extracted}`)
  }

  return result
}

async function main() {
  const libPath = STUDY_LIBRARY_PATH
  const topics = fs.readdirSync(libPath).filter(d => {
    const p = path.join(libPath, d)
    return fs.statSync(p).isDirectory()
  })

  let processed = 0
  let skipped = 0
  let failed = 0

  for (const topic of topics) {
    const topicPath = path.join(libPath, topic)
    const sessions = fs.readdirSync(topicPath).filter(d => {
      const p = path.join(topicPath, d)
      return fs.statSync(p).isDirectory() && /^s\d+$/.test(d)
    })

    for (const session of sessions) {
      const sessionPath = path.join(topicPath, session)
      const reportPath = path.join(sessionPath, '学习报告.md')

      if (!fs.existsSync(reportPath)) continue

      const raw = fs.readFileSync(reportPath, 'utf8')
      const parsed = matter(raw)
      const data = parsed.data
      const body = parsed.content

      const needDescription = !data.description
      const needProgressSummary = !data.progress_summary

      if (!needDescription && !needProgressSummary) {
        skipped++
        continue
      }

      console.log(`\n[${topic}/${session}] ${data.title}`)
      console.log(`  Missing: ${needDescription ? 'description ' : ''}${needProgressSummary ? 'progress_summary' : ''}`)

      try {
        const generated = await generateMetadata(data.title, body)
        console.log(`  Generated description: ${generated.description}`)
        console.log(`  Generated summary: ${generated.progress_summary.slice(0, 60)}...`)

        // Update data
        if (needDescription) data.description = generated.description
        if (needProgressSummary) data.progress_summary = generated.progress_summary

        // Re-serialize with field order
        const ordered = {}
        const coreFields = ['title', 'description', 'type', 'created', 'tags']
        for (const key of coreFields) {
          if (data[key] !== undefined && data[key] !== null) ordered[key] = data[key]
        }
        const extFields = ['session_number', 'difficulty', 'progress_summary', 'last_studied', 'review_count']
        for (const key of extFields) {
          if (data[key] !== undefined && data[key] !== null && data[key] !== '') {
            ordered[key] = data[key]
          }
        }
        const known = new Set([...coreFields, ...extFields])
        for (const [key, val] of Object.entries(data)) {
          if (!known.has(key) && val !== undefined && val !== null && val !== '') {
            ordered[key] = val
          }
        }

        const newContent = matter.stringify(body, ordered)
        fs.writeFileSync(reportPath, newContent, 'utf8')
        console.log(`  ✓ Updated`)
        processed++

        // Rate limit: wait 1s between calls
        await sleep(1000)
      } catch (err) {
        console.error(`  ✗ Failed: ${err.message}`)
        failed++
        await sleep(2000)
      }
    }
  }

  console.log(`\n=== Done ===`)
  console.log(`Processed: ${processed}`)
  console.log(`Skipped (already complete): ${skipped}`)
  console.log(`Failed: ${failed}`)
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
