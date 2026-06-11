import fs from 'node:fs'
import path from 'node:path'
import type { Difficulty, Mode, Profile } from '@shared/index'

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

function read(name: string): string {
  return fs.readFileSync(path.join(PROMPTS_DIR, name), 'utf8').trim()
}

export type AssembleArgs = {
  mode: Mode
  difficulty: Difficulty
  profile: Profile
  reviewFileBody?: string
  progressSummary?: string
  selectedTopic?: string
  userRequirement?: string
}

export function assemblePrompt(args: AssembleArgs): string {
  const parts: string[] = []
  parts.push(read('learner-base.md'))

  // 插入本次学习方向
  const directionParts: string[] = []
  if (args.selectedTopic) {
    directionParts.push(`聚焦主题：${args.selectedTopic}`)
  }
  if (args.userRequirement) {
    directionParts.push(`学习者额外要求：${args.userRequirement}`)
  }
  if (directionParts.length > 0) {
    parts.push(`【本次学习方向】\n${directionParts.join('\n')}`)
  }

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

  if (args.difficulty === 'high') parts.push(read('difficulty-high.md'))
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
