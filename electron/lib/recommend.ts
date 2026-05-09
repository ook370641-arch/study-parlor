import type { TopicMeta, RecCard } from '@shared/index'

const DAY = 86400_000

export function pickRecommendations(
  lib: TopicMeta[],
  now: Date,
  opts: { exclude?: string[] } = {}
): { left: RecCard | null; right: RecCard | null } {
  const exclude = new Set(opts.exclude ?? [])
  const pool = lib.filter(f => !exclude.has(f.dirName))

  const continues = pool
    .filter(f => f.last_studied && now.getTime() - new Date(f.last_studied).getTime() <= 3 * DAY)
    .sort((a, b) => new Date(b.last_studied!).getTime() - new Date(a.last_studied!).getTime())

  const continueDirs = new Set(continues.map(f => f.dirName))
  const reviews = pool
    .filter(f => !continueDirs.has(f.dirName))
    .filter(f => f.review_count < 3)
    .filter(f => !f.last_reviewed || now.getTime() - new Date(f.last_reviewed).getTime() >= 7 * DAY)
    .sort((a, b) => {
      const aT = a.last_reviewed ? new Date(a.last_reviewed).getTime() : 0
      const bT = b.last_reviewed ? new Date(b.last_reviewed).getTime() : 0
      return aT - bT
    })

  const toCard = (f: TopicMeta, type: 'continue' | 'review'): RecCard => ({
    type, dirName: f.dirName, title: f.title
  })

  // 互补优先:左 continue 右 review
  if (continues[0] && reviews[0] && continues[0].dirName !== reviews[0].dirName) {
    return { left: toCard(continues[0], 'continue'), right: toCard(reviews[0], 'review') }
  }

  // 一边为空 → 同类填充
  if (continues[0] && !reviews[0] && continues[1]) {
    return { left: toCard(continues[0], 'continue'), right: toCard(continues[1], 'continue') }
  }
  if (reviews[0] && !continues[0] && reviews[1]) {
    return { left: toCard(reviews[0], 'review'), right: toCard(reviews[1], 'review') }
  }

  // 只够一边出一张
  return {
    left:  continues[0] ? toCard(continues[0], 'continue')
        : reviews[0]   ? toCard(reviews[0], 'review')
        : null,
    right: null
  }
}
