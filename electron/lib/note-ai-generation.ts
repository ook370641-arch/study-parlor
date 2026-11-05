import fs from 'node:fs'
import path from 'node:path'
import type { AppConfig } from '../env'
import type { AiNoteInput } from './note-ai-source'
import { chatNonStream } from './kimi'
import { getSearchApiKey } from './credentials'
import { extractJsonArray } from './extract-json'
import { searchWeb, type TavilyResult } from './search'

const PROMPTS_DIR = (() => {
  const candidates = [
    path.resolve(__dirname, '..', 'prompts'),
    path.resolve(__dirname, '..', '..', 'electron', 'prompts'),
  ]
  const existing = candidates.find(candidate => fs.existsSync(candidate))
  if (!existing) throw new Error(`prompts directory not found: ${candidates.join(', ')}`)
  return existing
})()

type GenerationStage = 'round1' | 'round2' | 'curating' | 'writing'
type LabeledResult = TavilyResult & { id: string }
type Coordinate = { relation: string; claim: string; contribution: string; sourceIds: string[] }

function generationError(code: 'MISSING_API_KEY' | 'SEARCH_ROUND_FAILED' | 'NOTE_GENERATION_INVALID'): Error & { code: string } {
  const error = new Error(code) as Error & { code: string }
  error.code = code
  return error
}

function prompt(name: string): string {
  return fs.readFileSync(path.join(PROMPTS_DIR, name), 'utf8')
}

function materialBlock(input: AiNoteInput): string {
  return [
    `标题：${input.title}`,
    `来源：${JSON.stringify(input.sourceIdentity)}`,
    `## 导读\n${input.guideText ?? '（无可用导读）'}`,
    `## 用户原笔迹\n${input.originalNote || '（空）'}`,
    `## 来源正文\n${input.sourceText}`,
  ].join('\n\n')
}

function resultBlock(results: LabeledResult[]): string {
  return results.map(result => `[${result.id}] ${result.title}\nURL: ${result.url}\n摘要: ${result.content.slice(0, 1200)}`).join('\n\n')
}

function sourceMapBlock(results: LabeledResult[]): string {
  return results.map(result => `[${result.id}] ${result.title}\nURL: ${result.url}`).join('\n')
}

async function callModel(config: AppConfig, content: string, temperature: number, thoughtful = false): Promise<string> {
  return chatNonStream(config, {
    messages: [{ role: 'user', content }],
    temperature,
    thinking: thoughtful ? { type: 'enabled', reasoning_effort: 'high' } : { type: 'disabled' },
  })
}

function parseQueries(text: string): string[] {
  const extracted = extractJsonArray(text)
  if (!extracted) throw generationError('NOTE_GENERATION_INVALID')
  const value: unknown = JSON.parse(extracted)
  if (!Array.isArray(value)) throw generationError('NOTE_GENERATION_INVALID')
  const queries = value.filter((item): item is string => typeof item === 'string')
    .map(item => item.trim())
    .filter(item => item.length > 0 && item.length <= 200 && /[A-Za-z]/.test(item))
    .slice(0, 3)
  if (queries.length < 2 || queries.length !== Math.min(value.length, 3)) throw generationError('NOTE_GENERATION_INVALID')
  return Array.from(new Set(queries))
}

async function planQueries(config: AppConfig, content: string): Promise<string[]> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return parseQueries(await callModel(config, content, 0.2))
    } catch (error) {
      if (attempt === 1) throw generationError('NOTE_GENERATION_INVALID')
    }
  }
  throw generationError('NOTE_GENERATION_INVALID')
}

async function searchRound(queries: string[], apiKey: string, round: 1 | 2): Promise<LabeledResult[]> {
  const settled = await Promise.allSettled(queries.map(query => searchWeb({ query, apiKey, maxResults: 5 })))
  if (settled.every(result => result.status === 'rejected')) throw generationError('SEARCH_ROUND_FAILED')
  const byUrl = new Map<string, TavilyResult>()
  for (const result of settled) {
    if (result.status === 'rejected') continue
    for (const item of result.value) {
      const key = item.url.trim()
      if (!byUrl.has(key)) byUrl.set(key, item)
    }
  }
  if (byUrl.size === 0) throw generationError('SEARCH_ROUND_FAILED')
  return Array.from(byUrl.values()).map((result, index) => ({ ...result, id: `W${round}-${index + 1}` }))
}

function parseCoordinates(text: string, validSourceIds: Set<string>): Coordinate[] {
  const extracted = extractJsonArray(text)
  if (!extracted) throw generationError('NOTE_GENERATION_INVALID')
  const value: unknown = JSON.parse(extracted)
  if (!Array.isArray(value) || value.length < 3 || value.length > 5) throw generationError('NOTE_GENERATION_INVALID')
  const coordinates = value.map(item => {
    if (!item || typeof item !== 'object') throw generationError('NOTE_GENERATION_INVALID')
    const candidate = item as Record<string, unknown>
    if (typeof candidate.relation !== 'string' || !candidate.relation.trim()
      || typeof candidate.claim !== 'string' || !candidate.claim.trim()
      || typeof candidate.contribution !== 'string' || !candidate.contribution.trim()
      || !Array.isArray(candidate.sourceIds) || candidate.sourceIds.length === 0
      || !candidate.sourceIds.every(id => typeof id === 'string' && validSourceIds.has(id))) {
      throw generationError('NOTE_GENERATION_INVALID')
    }
    return {
      relation: candidate.relation.trim(),
      claim: candidate.claim.trim(),
      contribution: candidate.contribution.trim(),
      sourceIds: Array.from(new Set(candidate.sourceIds as string[])),
    }
  })
  return coordinates
}

async function curate(config: AppConfig, content: string, validSourceIds: Set<string>): Promise<Coordinate[]> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return parseCoordinates(await callModel(config, content, 0.2), validSourceIds)
    } catch (error) {
      if (attempt === 1) throw generationError('NOTE_GENERATION_INVALID')
    }
  }
  throw generationError('NOTE_GENERATION_INVALID')
}

function chineseCharacterCount(body: string): number {
  return body.match(/[\u3400-\u4dbf\u4e00-\u9fff]/g)?.length ?? 0
}

function validLength(body: string): boolean {
  const count = chineseCharacterCount(body)
  return count >= 900 && count <= 1600
}

export async function generateAiNoteBody(
  config: AppConfig,
  input: AiNoteInput,
  onStage: (stage: GenerationStage) => void,
): Promise<string> {
  const apiKey = await getSearchApiKey().catch(() => null)
  if (!apiKey) throw generationError('MISSING_API_KEY')
  const materials = materialBlock(input)

  onStage('round1')
  const round1Queries = await planQueries(config, `${prompt('note-ai-round1.md')}\n\n${materials}`)
  const round1Results = await searchRound(round1Queries, apiKey, 1)

  onStage('round2')
  const round2Prompt = `${prompt('note-ai-round2.md')}\n\n${materials}\n\n## 第一轮结果\n${resultBlock(round1Results)}`
  const round2Queries = await planQueries(config, round2Prompt)
  const round2Results = await searchRound(round2Queries, apiKey, 2)

  onStage('curating')
  const allResults = [...round1Results, ...round2Results]
  const curatePrompt = `${prompt('note-ai-curate.md')}\n\n${materials}\n\n## 第一轮资料\n${resultBlock(round1Results)}\n\n## 第二轮资料\n${resultBlock(round2Results)}`
  const coordinates = await curate(config, curatePrompt, new Set(allResults.map(result => result.id)))

  onStage('writing')
  const writePrompt = `${prompt('note-ai-write.md')}\n\n${materials}\n\n## 策展思想坐标\n${JSON.stringify(coordinates)}\n\n## 紧凑来源编号表\n${sourceMapBlock(allResults)}`
  let body = (await callModel(config, writePrompt, 0.5, true)).trim()
  if (!validLength(body)) {
    const revisionPrompt = `${writePrompt}\n\n# 针对性修订\n上一版正文汉字数为 ${chineseCharacterCount(body)}，不在 900–1600 之间。只针对篇幅与信息密度修订，保持原有结构目标、原笔迹连接和真实引用，不新增案例或原始搜索摘要。\n\n## 上一版\n${body}`
    body = (await callModel(config, revisionPrompt, 0.5, true)).trim()
  }
  if (!validLength(body)) throw generationError('NOTE_GENERATION_INVALID')
  return body
}
