import dotenv from 'dotenv'

dotenv.config()

const API_KEY = process.env.KIMI_API_KEY
const BASE_URL = process.env.KIMI_BASE_URL?.replace(/\/+$/, '')
const MODEL = process.env.KIMI_MODEL

if (!API_KEY || !BASE_URL || !MODEL) {
  console.error('Missing env vars')
  process.exit(1)
}

async function probe() {
  const url = `${BASE_URL}/chat/completions`
  console.log('Base URL:', BASE_URL)
  console.log('Model:', MODEL)
  console.log('Key prefix:', API_KEY.slice(0, 12) + '...')

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
      'User-Agent': 'claude-code/0.1.0'
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: '你是一位苏格拉底式导师，只通过提问引导用户。' },
        { role: 'user', content: '请解释机会成本。' }
      ],
      temperature: 0.6,
      max_tokens: 1000,
      thinking: { type: 'disabled' }
    })
  })

  const text = await res.text()
  console.log('\nStatus:', res.status)
  console.log('Content-Type:', res.headers.get('content-type'))

  let json
  try {
    json = JSON.parse(text)
  } catch {
    console.log('\nRaw response (not JSON):')
    console.log(text.slice(0, 2000))
    return
  }

  console.log('\nResponse keys:', Object.keys(json))
  if (json.choices?.[0]?.message) {
    const msg = json.choices[0].message
    console.log('Message keys:', Object.keys(msg))
    console.log('Has reasoning_content:', 'reasoning_content' in msg)
    if (msg.reasoning_content) {
      console.log('Reasoning content length:', msg.reasoning_content.length)
      console.log('Reasoning preview:', msg.reasoning_content.slice(0, 200))
    }
    if (msg.content) {
      console.log('Content length:', msg.content.length)
      console.log('Content has <think>:', msg.content.includes('<think>'))
      console.log('Content preview:\n---\n', msg.content.slice(0, 800), '\n---')
    }
  } else {
    console.log('\nFull JSON:')
    console.log(JSON.stringify(json, null, 2).slice(0, 3000))
  }
}

probe().catch(err => {
  console.error('Probe failed:', err)
  process.exit(1)
})
