import fs from 'node:fs'
import path from 'node:path'
import type { Difficulty, Mode, Profile } from '@shared/index'

const PROMPTS_DIR = path.resolve(__dirname, '..', 'prompts')

function read(name: string): string {
  return fs.readFileSync(path.join(PROMPTS_DIR, name), 'utf8').trim()
}

export type AssembleArgs = {
  mode: Mode
  difficulty: Difficulty
  profile: Profile
  reviewFileBody?: string
}

export function assemblePrompt(args: AssembleArgs): string {
  const parts: string[] = []
  parts.push(read('learner-base.md'))

  if (args.mode === 'review') {
    if (!args.reviewFileBody) throw new Error('reviewFileBody required when mode=review')
    parts.push(read('mode-review.md').replace('{{file_content}}', args.reviewFileBody))
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
