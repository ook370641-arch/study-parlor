#!/usr/bin/env node
// Task 0 spike — 探测 Kimi 端点是否原生支持 OpenAI 兼容的 tools (function calling) 参数。
// 读项目根 .env 的 KIMI_API_KEY / KIMI_BASE_URL / KIMI_MODEL，POST /chat/completions。
// 只记录结论；默认路径仍是 prompt 协议，原生支持仅作后续增强，不阻塞。
// 运行：node scripts/spike-tools-probe.mjs
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const envText = readFileSync(path.join(root, '.env'), 'utf8')
const env = {}
for (const line of envText.split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
  if (m) env[m[1]] = m[2]
}

const { KIMI_API_KEY, KIMI_BASE_URL, KIMI_MODEL } = env
if (!KIMI_API_KEY || !KIMI_BASE_URL || !KIMI_MODEL) {
  console.error('缺少 KIMI_API_KEY / KIMI_BASE_URL / KIMI_MODEL，请检查项目根 .env')
  process.exit(1)
}

const url = `${KIMI_BASE_URL.replace(/\/$/, '')}/chat/completions`
const body = {
  model: KIMI_MODEL,
  max_tokens: 64,
  messages: [{ role: 'user', content: '列出当前目录的文件' }],
  tools: [
    {
      type: 'function',
      function: {
        name: 'list_files',
        description: '列出文件',
        parameters: {
          type: 'object',
          properties: { dir: { type: 'string' } }
        }
      }
    }
  ]
}

console.log(`POST ${url}`)
console.log(`model=${KIMI_MODEL}`)

const res = await fetch(url, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${KIMI_API_KEY}`,
    'Content-Type': 'application/json',
    // Kimi Coding 端点要求此 UA，否则 403（见 electron/lib/kimi.ts）
    'User-Agent': 'claude-code/0.1.0'
  },
  body: JSON.stringify(body)
})

const text = await res.text()
console.log(`HTTP ${res.status} ${res.statusText}`)
console.log('--- 响应前 600 字符 ---')
console.log(text.slice(0, 600))
console.log('---')

if (res.ok) {
  try {
    const json = JSON.parse(text)
    const choice = json.choices?.[0]
    const toolCalls = choice?.message?.tool_calls
    if (Array.isArray(toolCalls) && toolCalls.length > 0) {
      console.log(`结论: 端点支持 tools 参数，且返回了 tool_calls（${toolCalls.map((t) => t.function?.name).join(', ')}）`)
    } else {
      console.log(`结论: 端点接受 tools 参数（HTTP ${res.status}），但本次未返回 tool_calls（finish_reason=${choice?.finish_reason ?? '?'}）`)
    }
  } catch {
    console.log('结论: HTTP 200 但响应非 JSON（可能是 SSE 流），需人工查看上方原文')
  }
} else {
  console.log('结论: 端点拒绝 tools 参数或不支持 function calling（见上方错误）')
}
