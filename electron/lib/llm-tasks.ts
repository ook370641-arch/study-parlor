import fs from 'node:fs'
import path from 'node:path'
import { chatNonStream } from './kimi'
import type { AppConfig } from '../env'
import type { Profile, NewTopic, Message } from '@shared/index'

const PROMPTS_DIR = path.resolve(__dirname, '..', 'prompts')
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
    const json = JSON.parse(text) as { title: string; body: string; progress_summary?: string }
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
