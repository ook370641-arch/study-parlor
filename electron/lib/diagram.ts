import fs from 'node:fs'
import path from 'node:path'
import { chatNonStream } from './kimi'
import type { AppConfig } from '../env'

const PROMPTS_DIR = (() => {
  const standard = path.resolve(__dirname, '..', 'prompts')
  if (fs.existsSync(standard)) return standard
  return path.resolve(__dirname, '..', '..', 'electron', 'prompts')
})()

function readPrompt(n: string): string {
  return fs.readFileSync(path.join(PROMPTS_DIR, n), 'utf8')
}

interface DiagramResult {
  chartType: string
  title: string
  rationale: string
  svg: string
}

export async function generateDiagram(
  cfg: AppConfig,
  reportBody: string
): Promise<string | undefined> {
  if (!reportBody || reportBody.trim().length < 50) {
    return undefined
  }

  let promptText: string
  try {
    const promptFile = fs.existsSync(path.join(PROMPTS_DIR, 'diagram.md'))
      ? 'diagram.md'
      : 'diagram_prompt_v1.md'
    promptText = readPrompt(promptFile).replace('{{report_body}}', reportBody)
  } catch {
    return undefined
  }

  try {
    const text = await chatNonStream(cfg, {
      messages: [{ role: 'user', content: promptText }],
      temperature: 0.3
    })

    const extracted = extractJson(text)
    if (!extracted) return undefined

    const json = JSON.parse(extracted) as Partial<DiagramResult>
    if (typeof json.svg !== 'string' || !json.svg.trim()) {
      return undefined
    }
    return json.svg.trim()
  } catch {
    return undefined
  }
}

function extractJson(text: string): string | null {
  text = text.trim()

  // 1. 去除 markdown 代码块包装（```json ... ``` 或 ``` ... ```）
  const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/)
  if (codeBlockMatch) {
    text = codeBlockMatch[1].trim()
  }

  // 2. 从文本中找第一个 { 作为 JSON 对象起始
  let start = -1
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '{') {
      let j = i + 1
      while (j < text.length && /\s/.test(text[j])) j++
      if (j < text.length && text[j] === '"') {
        start = i
        break
      }
    }
  }
  if (start === -1) return null

  let depth = 0
  let inString = false
  let escape = false
  let end = -1

  for (let i = start; i < text.length; i++) {
    const ch = text[i]
    if (escape) {
      escape = false
      continue
    }
    if (ch === '\\' && inString) {
      escape = true
      continue
    }
    if (ch === '"' && !inString) {
      inString = true
      continue
    }
    if (ch === '"' && inString) {
      inString = false
      continue
    }
    if (!inString) {
      if (ch === '{') depth++
      if (ch === '}') depth--
      if (depth === 0) {
        end = i
        break
      }
    }
  }

  if (end !== -1) return text.slice(start, end + 1)

  // Fallback: 括号平衡失败时，尝试直接截取第一个 { 到最后一个 }
  const fallback = text.slice(start).match(/\{[\s\S]*?\}(?=\s*$)/)
  if (fallback) {
    try {
      JSON.parse(fallback[0])
      return fallback[0]
    } catch {}
  }

  return null
}
