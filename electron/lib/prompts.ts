import fs from 'node:fs'
import path from 'node:path'
import type { Difficulty, Mode, Profile } from '@shared/index'

const PROMPTS_DIR = (() => {
  const standard = path.resolve(__dirname, '..', 'prompts')
  if (fs.existsSync(standard)) return standard
  return path.resolve(__dirname, '..', '..', 'electron', 'prompts')
})()

function read(name: string): string {
  return fs.readFileSync(path.join(PROMPTS_DIR, name), 'utf8').trim()
}

export type AssembleArgs = {
  mode: Mode
  difficulty: Difficulty
  profile: Profile
  reviewFileBody?: string
  progressSummary?: string
}

export function assemblePrompt(args: AssembleArgs): string {
  const parts: string[] = []
  parts.push(read('learner-base.md'))

  if (args.mode === 'review') {
    if (!args.reviewFileBody) throw new Error('reviewFileBody required when mode=review')
    parts.push(read('mode-review.md').replace('{{file_content}}', args.reviewFileBody))
  }

  if (args.mode === 'progress') {
    parts.push(read('mode-progress.md'))
  }

  if (args.mode === 'progress' && args.progressSummary) {
    parts.push(`[学习进度摘要]\n你正在继续之前的学习。目前已掌握的内容摘要:\n${args.progressSummary}\n\n请自然地接续之前的进度推进。`)
  }

  if (args.difficulty === 'mid') parts.push(read('difficulty-mid.md'))
  if (args.difficulty === 'low') parts.push(read('difficulty-low.md'))

  parts.push(formatProfile(args.profile))

  return parts.join('\n\n---\n\n')
}

function formatProfile(p: Profile): string {
  return [
    `# 学习者画像`,
    `姓名:${p.name}`,
    `画像:${p.profile_text}`,
    `偏好领域:${p.preferred_topics.join(' / ')}`
  ].join('\n')
}
