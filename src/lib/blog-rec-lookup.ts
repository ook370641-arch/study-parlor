import type { BlogRecommendBatch } from '@shared/index'

/** 文章 URL → 所属推荐批次号；history 最新在前，多批命中取最新 */
export function findBatchForUrl(history: BlogRecommendBatch[], sourceUrl: string): number | null {
  for (const b of history) {
    if (b.picks?.some(p => p.sourceUrl === sourceUrl)) return b.batch
  }
  return null
}
