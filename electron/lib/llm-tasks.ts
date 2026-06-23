import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { chatNonStream } from './kimi'
import { parseFrontmatter } from './frontmatter'
import { getSortedSessionDirs } from '../ipc/files'
import { extractXmlTag, extractXmlTags, extractJsonObject, extractJsonArray } from './extract-json'
import type { AppConfig } from '../env'
import type { Profile, NewTopic, Message, ContinueTopicSuggestion } from '@shared/index'

const PROMPTS_DIR = (() => {
  const candidates = [
    path.resolve(__dirname, '..', 'prompts'),                          // dev/vite: out/prompts (if ever copied)
    path.resolve(__dirname, '..', '..', 'electron', 'prompts'),        // dev: project-root/electron/prompts
                                                                         // packaged: app.asar/electron/prompts
  ]
  for (const c of candidates) {
    if (fs.existsSync(c)) return c
  }
  throw new Error(`prompts directory not found. Tried: ${candidates.join(', ')}`)
})()
const read = (n: string) => {
  const p = path.join(PROMPTS_DIR, n)
  if (!fs.existsSync(p)) {
    throw new Error(`Prompt file not found: ${p} (searched in ${PROMPTS_DIR})`)
  }
  return fs.readFileSync(p, 'utf8')
}

const transcript = (h: Message[]) =>
  h.filter(m => m.role !== 'system')
    .map(m => `${m.role === 'user' ? '学者' : 'AI'}:${m.content}`)
    .join('\n\n')

export async function finalizeProgress(
  cfg: AppConfig,
  history: Message[]
): Promise<{ title: string; description?: string; body: string; progress_summary?: string }> {
  const prompt = read('archive-progress.md').replace('{{transcript}}', transcript(history))
  try {
    const text = await chatNonStream(cfg, {
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      thinking: { type: 'enabled', reasoning_effort: 'max' }
    })
    const title = extractXmlTag(text, 'title')
    const body = extractXmlTag(text, 'body')
    if (!title || !body) {
      console.error(`[finalizeProgress] XML extraction failed. Response length=${text.length}`)
      throw new Error('XML extraction failed')
    }
    return {
      title,
      description: extractXmlTag(text, 'description') || undefined,
      body,
      progress_summary: extractXmlTag(text, 'progress_summary') || undefined,
    }
  } catch {
    return {
      title: '未命名笔记',
      body: '> LLM 归档失败,原始对话已保留为草稿:\n\n' + transcript(history),
      progress_summary: ''
    }
  }
}

export async function finalizeReview(
  cfg: AppConfig,
  args: { history: Message[]; existingBody: string }
): Promise<{ summary: string; gaps: string[]; mastery_assessment?: string; mastery_checklist?: string[]; future_advice?: string[] }> {
  const prompt = read('archive-review.md')
    .replace('{{existing_body}}', args.existingBody)
    .replace('{{transcript}}', transcript(args.history))
  try {
    const text = await chatNonStream(cfg, {
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      thinking: { type: 'enabled', reasoning_effort: 'max' }
    })
    const summary = extractXmlTag(text, 'summary')
    if (!summary) {
      // 非 XML 响应：把原始文本作为 summary
      return { summary: text.trim(), gaps: [] }
    }
    return {
      summary,
      gaps: extractXmlTags(text, 'gap'),
      mastery_assessment: extractXmlTag(text, 'mastery_assessment') || undefined,
      mastery_checklist: extractXmlTags(text, 'checklist'),
      future_advice: extractXmlTags(text, 'advice'),
    }
  } catch {
    return { summary: '(复习摘要生成失败,本次对话未自动总结)', gaps: [] }
  }
}

export async function generateFable(
  cfg: AppConfig,
  args: { history: Message[]; topic: string }
): Promise<{ title: string; body: string }> {
  const prompt = read('fable.md')
    .replace('{{transcript}}', transcript(args.history))
    .replace('{{reportBody}}', '【未提供】')
    .replace('{{userPrompt}}', '【未提供】')
    .replace('{{topic}}', args.topic)

  try {
    const text = await chatNonStream(cfg, {
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      thinking: { type: 'enabled', reasoning_effort: 'max' }
    })
    const extracted = extractJsonObject(text)
    if (!extracted) throw new Error('JSON extraction failed')
    const json = JSON.parse(extracted) as { title?: string; body?: string }
    if (!json.title || !json.body) throw new Error('shape')
    return { title: json.title, body: json.body }
  } catch {
    return {
      title: `${args.topic} — 寓言`,
      body: `> 寓言生成失败，以下为原始对话记录：\n\n${transcript(args.history)}`
    }
  }
}

export async function generateFableFromReport(
  cfg: AppConfig,
  args: { reportBody: string; topic: string; userPrompt?: string }
): Promise<{ title: string; body: string }> {
  const prompt = read('fable.md')
    .replace('{{transcript}}', '【未提供】')
    .replace('{{reportBody}}', args.reportBody)
    .replace('{{userPrompt}}', args.userPrompt || '【未提供】')
    .replace('{{topic}}', args.topic)

  try {
    const text = await chatNonStream(cfg, {
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      thinking: { type: 'enabled', reasoning_effort: 'max' }
    })
    const extracted = extractJsonObject(text)
    if (!extracted) throw new Error('JSON extraction failed')
    const json = JSON.parse(extracted) as { title?: string; body?: string }
    if (!json.title || !json.body) throw new Error('shape')
    return { title: json.title, body: json.body }
  } catch {
    return {
      title: `${args.topic} — 寓言`,
      body: `> 寓言生成失败，以下为原始学习报告：\n\n${args.reportBody}`
    }
  }
}

export async function generateContinueSuggestions(
  cfg: AppConfig,
  args: { topic: string; dirName: string }
): Promise<ContinueTopicSuggestion[]> {
  const reportSummaries = readTopicReportSummaries(cfg.libraryPath, args.dirName)

  const prompt = read('continue-suggestions_prompt_v2.md')
    .replace('{{topic}}', args.topic)
    .replace('{{reportSummaries}}', reportSummaries.map((s, i) => `第${i + 1}次学习：\n${s}`).join('\n\n'))

  try {
    const text = await chatNonStream(cfg, {
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      thinking: { type: 'enabled', reasoning_effort: 'max' }
    })
    const extracted = extractJsonArray(text)
    if (!extracted) throw new Error('JSON extraction failed')
    const json = JSON.parse(extracted) as ContinueTopicSuggestion[]
    if (!Array.isArray(json)) return []
    return json.filter(item => item.title).slice(0, 3)
  } catch {
    return []
  }
}

export function readTopicReportSummaries(
  libraryPath: string,
  dirName: string
): string[] {
  try {
    const topicDir = path.join(libraryPath, dirName)
    const sessionDirs = getSortedSessionDirs(topicDir)
    const summaries: string[] = []

    for (const sd of sessionDirs) {
      const reportPath = path.join(topicDir, sd, '学习报告.md')
      if (!fs.existsSync(reportPath)) continue
      try {
        const raw = fs.readFileSync(reportPath, 'utf8')
        const { frontmatter, body } = parseFrontmatter(raw, { filename: '学习报告.md' })
        // 优先用 progress_summary，没有则取 body 前 300 字
        const summary = frontmatter.progress_summary
          ? frontmatter.progress_summary.replace(/\s+/g, ' ').trim()
          : body.trim().slice(0, 300)
        summaries.push(summary)
      } catch {
        // 单份报告解析失败，跳过
      }
    }

    return summaries
  } catch {
    return []
  }
}

function readReportFrontmatter(libraryPath: string, dirName: string): { tags: string[]; progress_summary?: string } | null {
  try {
    const topicDir = path.join(libraryPath, dirName)
    const sessionDirs = getSortedSessionDirs(topicDir)
    if (sessionDirs.length === 0) return null
    const latestDir = sessionDirs[sessionDirs.length - 1]
    const reportPath = path.join(topicDir, latestDir, '学习报告.md')
    if (!fs.existsSync(reportPath)) return null
    const raw = fs.readFileSync(reportPath, 'utf8')
    const { frontmatter } = parseFrontmatter(raw, { filename: '学习报告.md' })
    // progress_summary 可能包含 YAML 多行换行符，替换为空格避免破坏 prompt
    const ps = frontmatter.progress_summary
      ? frontmatter.progress_summary.replace(/\s+/g, ' ').trim()
      : undefined
    return {
      tags: frontmatter.tags ?? [],
      progress_summary: ps
    }
  } catch {
    return null
  }
}

function isValidNewTopic(value: unknown): value is NewTopic {
  const obj = value as Record<string, unknown> | null
  return !!obj && typeof obj.topic === 'string' && typeof obj.hook === 'string'
}

export async function generateWildcardInspiration(
  cfg: AppConfig,
  args: {
    profile: Profile
    topics: { title: string }[]
  }
): Promise<NewTopic> {
  const topicList = args.topics.length > 0
    ? args.topics.map(t => `- ${t.title}`).join('\n')
    : '（学习库为空）'

  const prompt = read('wild-card-v1.md')
    .replace('{{profile_text}}', args.profile.profile_text)
    .replace('{{topic_list}}', topicList)

  const text = await chatNonStream(cfg, {
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.8,
    thinking: { type: 'enabled', reasoning_effort: 'max' }
  })

  const extracted = extractJsonObject(text)
  if (!extracted) {
    const debugDir = path.join(os.homedir(), '.studyparlor', 'debug')
    fs.mkdirSync(debugDir, { recursive: true })
    const debugFile = path.join(debugDir, `wild-card-fail-${Date.now()}.txt`)
    fs.writeFileSync(debugFile, `=== Prompt ===\n${prompt}\n\n=== LLM Response ===\n${text}`, 'utf8')
    throw new Error(`JSON extraction failed. Debug written to: ${debugFile}`)
  }

  try {
    const json = JSON.parse(extracted) as unknown
    if (!isValidNewTopic(json)) throw new Error('shape')
    return json
  } catch {
    const debugDir = path.join(os.homedir(), '.studyparlor', 'debug')
    fs.mkdirSync(debugDir, { recursive: true })
    const debugFile = path.join(debugDir, `wild-card-parse-fail-${Date.now()}.txt`)
    fs.writeFileSync(debugFile, `=== Prompt ===\n${prompt}\n\n=== Extracted ===\n${extracted}\n\n=== LLM Response ===\n${text}`, 'utf8')
    throw new Error(`JSON parse failed after extraction. Debug written to: ${debugFile}`)
  }
}

export async function generateGroupInspiration(
  cfg: AppConfig,
  args: {
    groupName: string
    topics: { dirName: string; title: string }[]
    profile: Profile
    strategy?: 'v1' | 'v2' | 'v3'
  }
): Promise<NewTopic> {
  // 读取每个主题的学习报告 frontmatter
  const summaries: string[] = []
  for (const t of args.topics) {
    const fm = readReportFrontmatter(cfg.libraryPath, t.dirName)
    let line = `- ${t.title}`
    if (fm) {
      if (fm.tags.length > 0) line += ` [标签: ${fm.tags.join(', ')}]`
      if (fm.progress_summary) line += ` — 进度: ${fm.progress_summary}`
    }
    summaries.push(line)
  }

  const strategyFile = args.strategy ? `group-inspiration-${args.strategy}.md` : 'group-inspiration-v2.md'

  const prompt = read(strategyFile)
    .replace('{{group_name}}', args.groupName)
    .replace('{{topic_summaries}}', summaries.join('\n'))
    .replace('{{profile_text}}', args.profile.profile_text)
    .replace('{{preferred_topics}}', args.profile.preferred_topics.join(' / '))

  const text = await chatNonStream(cfg, {
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.7,
    thinking: { type: 'enabled', reasoning_effort: 'max' }
  })

  // 激进 JSON 提取：从 LLM 返回的任意文本中找第一个 {...} 结构
  const extracted = extractJsonObject(text)
  if (!extracted) {
    // 将原始响应写入文件供诊断（终端日志在 dev 模式下不可靠）
    const debugDir = path.join(os.homedir(), '.studyparlor', 'debug')
    fs.mkdirSync(debugDir, { recursive: true })
    const debugFile = path.join(debugDir, `group-inspiration-fail-${Date.now()}.txt`)
    fs.writeFileSync(debugFile, `=== Prompt ===\n${prompt}\n\n=== LLM Response ===\n${text}`, 'utf8')
    throw new Error(`JSON extraction failed. Debug written to: ${debugFile}`)
  }
  try {
    const json = JSON.parse(extracted) as unknown
    if (!isValidNewTopic(json)) throw new Error('shape')
    return json
  } catch {
    const debugDir = path.join(os.homedir(), '.studyparlor', 'debug')
    fs.mkdirSync(debugDir, { recursive: true })
    const debugFile = path.join(debugDir, `group-inspiration-parse-fail-${Date.now()}.txt`)
    fs.writeFileSync(debugFile, `=== Prompt ===\n${prompt}\n\n=== Extracted ===\n${extracted}\n\n=== LLM Response ===\n${text}`, 'utf8')
    throw new Error(`JSON parse failed after extraction. Debug written to: ${debugFile}`)
  }
}
