import type { GuideProgress } from '@shared/index'

// 与 electron/lib/guide-v2.ts 中的 GUIDE_FORMAT_VERSION / countArticleHeadings
// 保持同步——主/渲染进程不能互相 import（rules ipc-state §5），此为渲染侧副本。
export const GUIDE_FORMAT_VERSION = 2

/** 统计正文 H2/H3 标题数，作为撰写进度分母（entriesTotal）。
 *  「## 原始来源 / Sources」section 及其下的 ### 来源分组不是导读条目，计数前截断
 *  （判定与 parse-briefing-markdown.ts 保持一致）。 */
export function countArticleHeadings(content: string): number {
  const cut = content.search(/^##\s+.*(?:原始来源|sources).*$/im)
  const body = cut >= 0 ? content.slice(0, cut) : content
  const m = body.match(/^#{2,3}\s+\S/gm)
  return m ? m.length : 0
}

/** 导读缓存版本判定：web-article / writing 永远有效；briefing 与 anthropic-article 需要 v2 */
export function isGuideCacheCurrent(
  contextType: 'briefing' | 'anthropic-article' | 'web-article' | 'writing',
  guideVersion: number | undefined
): boolean {
  if (contextType === 'web-article' || contextType === 'writing') return true
  return (guideVersion ?? 1) >= GUIDE_FORMAT_VERSION
}

export function guideProgressText(p: GuideProgress | null): string {
  const parts = guideProgressParts(p)
  return parts.detail ? `${parts.label} ${parts.detail}` : parts.label
}

/** 拆分进度文案为 label（阶段关键词）和 detail（数字/计数），UI 层分别用 ember 和 muted 渲染 */
export function guideProgressParts(p: GuideProgress | null): { label: string; detail: string } {
  if (!p || p.stage === 'planning') return { label: '规划检索中…', detail: '' }
  if (p.stage === 'searching') return { label: '检索背景资料中…', detail: `${p.done}/${p.total}` }
  return { label: '撰写导读中…', detail: `§${p.entriesDone}/§${p.entriesTotal} · 已写 ${p.chars} 字` }
}

/** 进度痕宽度（0-1）：规划 5%，搜索 5%-30%，撰写 30%-100%，超发 clamp 到 1 */
export function guideProgressFraction(p: GuideProgress | null): number {
  if (!p || p.stage === 'planning') return 0.05
  if (p.stage === 'searching') return p.total > 0 ? 0.05 + 0.25 * (p.done / p.total) : 0.05
  if (p.entriesTotal <= 0) return 0.3
  return Math.min(0.3 + 0.7 * (p.entriesDone / p.entriesTotal), 1)
}
