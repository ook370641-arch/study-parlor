import type { GuideProgress } from '@shared/index'

// 与 electron/lib/guide-v2.ts 中的 GUIDE_FORMAT_VERSION / countArticleHeadings
// 保持同步——主/渲染进程不能互相 import（rules ipc-state §5），此为渲染侧副本。
export const GUIDE_FORMAT_VERSION = 2

/** 统计正文 H2/H3 标题数，作为撰写进度分母（entriesTotal） */
export function countArticleHeadings(content: string): number {
  const m = content.match(/^#{2,3}\s+\S/gm)
  return m ? m.length : 0
}

/** digest 导读缓存版本判定：非 digest 永远有效；digest 需要 v2 */
export function isGuideCacheCurrent(
  contextType: 'briefing' | 'anthropic-article' | 'web-article' | 'writing',
  guideVersion: number | undefined
): boolean {
  if (contextType !== 'briefing') return true
  return (guideVersion ?? 1) >= GUIDE_FORMAT_VERSION
}

export function guideProgressText(p: GuideProgress | null): string {
  if (!p || p.stage === 'planning') return '规划检索中…'
  if (p.stage === 'searching') return `检索背景资料中… ${p.done}/${p.total}`
  return `撰写导读中… §${p.entriesDone}/${p.entriesTotal} · 已写 ${p.chars} 字`
}

/** 进度痕宽度（0-1）：规划 5%，搜索 5%-30%，撰写 30%-100%，超发 clamp 到 1 */
export function guideProgressFraction(p: GuideProgress | null): number {
  if (!p || p.stage === 'planning') return 0.05
  if (p.stage === 'searching') return p.total > 0 ? 0.05 + 0.25 * (p.done / p.total) : 0.05
  if (p.entriesTotal <= 0) return 0.3
  return Math.min(0.3 + 0.7 * (p.entriesDone / p.entriesTotal), 1)
}
