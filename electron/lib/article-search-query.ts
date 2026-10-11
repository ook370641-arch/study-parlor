import fs from 'node:fs'
import path from 'node:path'
import { chatNonStream } from './kimi'
import type { AppConfig } from '../env'
import type { Message } from '@shared/index'

const PROMPTS_DIR = (() => {
  const candidates = [
    path.resolve(__dirname, '..', 'prompts'),
    path.resolve(__dirname, '..', '..', 'electron', 'prompts'),
  ]
  for (const c of candidates) {
    if (fs.existsSync(c)) return c
  }
  throw new Error(`prompts directory not found. Tried: ${candidates.join(', ')}`)
})()

// 文章旁注助手的搜索增强：从文章内容+选区+用户问题生成搜索词
export async function generateArticleSearchQuery(
  cfg: AppConfig,
  args: { articleContent: string; selection?: string; lastMessage?: string }
): Promise<string> {
  const prompt = fs.readFileSync(path.join(PROMPTS_DIR, 'generate-search-query.md'), 'utf8')
    .replace('{{articleContent}}', args.articleContent.slice(0, 3000))
    .replace('{{selection}}', args.selection ?? '')
    .replace('{{lastMessage}}', args.lastMessage ?? '')
  const text = await chatNonStream(cfg, {
    messages: [{ role: 'user', content: prompt } as Message],
    temperature: 0.3,
    thinking: { type: 'enabled' },
  })
  return text.trim()
}
