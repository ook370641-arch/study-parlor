import fs from 'node:fs'
import path from 'node:path'
import { chatNonStream } from './kimi'
import { extractJsonObject } from './extract-json'
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

    const extracted = extractJsonObject(text)
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
