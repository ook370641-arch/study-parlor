import dotenv from 'dotenv'

dotenv.config()

const DEEPSEEK_BASE_URL = (process.env.KIMI_BASE_URL || 'https://api.deepseek.com/v1').replace(/\/+$/, '')
const DEEPSEEK_KEY = process.env.KIMI_API_KEY
const DEEPSEEK_MODEL = process.env.KIMI_MODEL || 'deepseek-v4-pro'
const TAVILY_KEY = process.env.TAVILY_API_KEY

async function deepSeekChat({ thinking, label }) {
  const body = {
    model: DEEPSEEK_MODEL,
    stream: false,
    messages: [{ role: 'user', content: '用一句话解释苏格拉底式教学法。' }],
    temperature: 0.5,
    max_tokens: 1024,
  }
  if (thinking) {
    body.thinking = { type: 'enabled' }
    body.reasoning_effort = 'high'
  } else {
    body.thinking = { type: 'disabled' }
  }

  const start = Date.now()
  try {
    const res = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${DEEPSEEK_KEY}`,
        'Content-Type': 'application/json',
        'User-Agent': 'claude-code/0.1.0',
      },
      body: JSON.stringify(body),
    })
    const elapsed = Date.now() - start
    const text = await res.text()
    console.log(`\n[DeepSeek ${label}] status=${res.status} time=${elapsed}ms`)
    if (!res.ok) {
      console.error('  error:', text.slice(0, 500))
      return false
    }
    const json = JSON.parse(text)
    const content = json.choices?.[0]?.message?.content ?? ''
    console.log('  content:', content.slice(0, 200).replace(/\n/g, ' '))
    return true
  } catch (err) {
    console.error(`\n[DeepSeek ${label}] failed after ${Date.now() - start}ms:`, err.name, err.message)
    return false
  }
}

async function tavilySearch() {
  const start = Date.now()
  try {
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: TAVILY_KEY,
        query: '苏格拉底式教学法',
        search_depth: 'basic',
        max_results: 3,
        include_answer: false,
      }),
    })
    const elapsed = Date.now() - start
    const text = await res.text()
    console.log(`\n[Tavily] status=${res.status} time=${elapsed}ms`)
    if (!res.ok) {
      console.error('  error:', text.slice(0, 500))
      return false
    }
    const json = JSON.parse(text)
    console.log('  results count:', json.results?.length ?? 0)
    return true
  } catch (err) {
    console.error(`\n[Tavily] failed after ${Date.now() - start}ms:`, err.name, err.message)
    return false
  }
}

async function main() {
  console.log('=== Real API smoke test ===')
  console.log('DeepSeek base URL:', DEEPSEEK_BASE_URL)
  console.log('DeepSeek model:', DEEPSEEK_MODEL)
  console.log('Tavily key present:', !!TAVILY_KEY)

  const thinkingOk = await deepSeekChat({ thinking: true, label: 'thinking enabled' })
  const noThinkingOk = await deepSeekChat({ thinking: false, label: 'thinking disabled' })
  const tavilyOk = await tavilySearch()

  console.log('\n=== Summary ===')
  console.log('DeepSeek thinking enabled:', thinkingOk ? 'OK' : 'FAIL')
  console.log('DeepSeek thinking disabled:', noThinkingOk ? 'OK' : 'FAIL')
  console.log('Tavily search:', tavilyOk ? 'OK' : 'FAIL')

  process.exit(thinkingOk && noThinkingOk && tavilyOk ? 0 : 1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
