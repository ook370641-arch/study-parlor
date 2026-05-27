import fs from 'node:fs'
import path from 'node:path'
import { chatNonStream } from './kimi'
import { parseFrontmatter } from './frontmatter'
import type { AppConfig } from '../env'
import type { Profile, NewTopic, Message } from '@shared/index'

const PROMPTS_DIR = (() => {
  // 与 electron/lib/prompts.ts 保持同一套 fallback:
  // dev 模式下 electron-vite 不复制 .md 到 out/,所以 out/prompts/ 不存在
  // → 回退到源代码目录 electron/prompts/。
  const standard = path.resolve(__dirname, '..', 'prompts')
  if (fs.existsSync(standard)) return standard
  return path.resolve(__dirname, '..', '..', 'electron', 'prompts')
})()
const read = (n: string) => fs.readFileSync(path.join(PROMPTS_DIR, n), 'utf8')

const transcript = (h: Message[]) =>
  h.filter(m => m.role !== 'system')
    .map(m => `${m.role === 'user' ? '学者' : 'AI'}:${m.content}`)
    .join('\n\n')

export async function generateInspirations(
  cfg: AppConfig,
  args: { profile: Profile; existingTitles: string[] }
): Promise<NewTopic[]> {
  const prompt = read('inspiration.md')
    .replace('{{name}}', args.profile.name)
    .replace('{{profile_text}}', args.profile.profile_text)
    .replace('{{preferred_topics}}', args.profile.preferred_topics.join(' / '))
    .replace('{{existing_titles}}', args.existingTitles.join(' / '))

  try {
    const text = await chatNonStream(cfg, {
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7
    })
    const json = JSON.parse(text) as NewTopic[]
    return Array.isArray(json) ? json.slice(0, 2) : []
  } catch {
    return []
  }
}

export async function finalizeProgress(
  cfg: AppConfig,
  history: Message[]
): Promise<{ title: string; body: string; progress_summary?: string }> {
  const prompt = read('archive-progress.md').replace('{{transcript}}', transcript(history))
  try {
    const text = await chatNonStream(cfg, {
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3
    })
    const extracted = extractJsonObject(text)
    if (!extracted) {
      console.error('[finalizeProgress] failed to extract JSON from:', text.slice(0, 200))
      throw new Error('JSON extraction failed')
    }
    const json = JSON.parse(extracted) as { title: string; body: string; progress_summary?: string }
    if (!json.title || !json.body) throw new Error('shape')
    return json
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
): Promise<{ summary: string; gaps: string[] }> {
  const prompt = read('archive-review.md')
    .replace('{{existing_body}}', args.existingBody)
    .replace('{{transcript}}', transcript(args.history))
  try {
    const text = await chatNonStream(cfg, {
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3
    })
    const trimmed = text.trim()
    try {
      const json = JSON.parse(trimmed) as { summary?: string; gaps?: string[] }
      return {
        summary: json.summary ?? trimmed,
        gaps: Array.isArray(json.gaps) ? json.gaps : []
      }
    } catch {
      // 非 JSON 响应：把原始文本作为 summary
      return { summary: trimmed, gaps: [] }
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
    .replace('{{topic}}', args.topic)

  try {
    const text = await chatNonStream(cfg, {
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7
    })
    const json = JSON.parse(text) as { title?: string; body?: string }
    if (!json.title || !json.body) throw new Error('shape')
    return { title: json.title, body: json.body }
  } catch {
    return {
      title: `${args.topic} — 寓言`,
      body: `> 寓言生成失败，以下为原始对话记录：\n\n${transcript(args.history)}`
    }
  }
}

function getSortedSessionDirs(topicDir: string): string[] {
  const entries = fs.readdirSync(topicDir, { withFileTypes: true })
  return entries
    .filter(e => e.isDirectory() && /^s\d+$/.test(e.name))
    .map(e => e.name)
    .sort((a, b) => {
      const na = parseInt(a.slice(1), 10)
      const nb = parseInt(b.slice(1), 10)
      return na - nb
    })
}

/**
 * 从 LLM 返回的任意文本中提取第一个 {...} JSON 对象。
 * 处理前后文字、markdown 代码块、多余空格等噪音。
 */
function extractJsonObject(text: string): string | null {
  text = text.trim()

  // 1. 去除 markdown 代码块包装（```json ... ```）
  const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/)
  if (codeBlockMatch) {
    text = codeBlockMatch[1].trim()
  }

  // 2. 从文本中找第一个 {" 作为 JSON 对象起始（跳过非 JSON 的花括号）
  let start = -1
  for (let i = 0; i < text.length - 1; i++) {
    if (text[i] === '{' && text[i + 1] === '"') {
      start = i
      break
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

  if (end === -1) return null
  return text.slice(start, end + 1)
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

  let text = await chatNonStream(cfg, {
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.7
  })

  // 激进 JSON 提取：从 LLM 返回的任意文本中找第一个 {...} 结构
  const extracted = extractJsonObject(text)
  if (!extracted) {
    console.error('[generateGroupInspiration] failed to extract JSON from:', text.slice(0, 200))
    throw new Error('JSON extraction failed')
  }
  const json = JSON.parse(extracted) as NewTopic
  if (!json.topic || !json.hook) throw new Error('shape')
  return json
}
