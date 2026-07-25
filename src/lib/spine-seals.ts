import type { ArticleAnnotation, ArticleAssistantChunk } from '@shared/index'
import { splitArticleIntoChunks } from '@/lib/article-chunks'

/** 封印推导：标注的 selectedText 落在哪个 chunk，哪个 chunk 即「已内化」。映射失败宁可少封不可错封。 */
export function computeSealedChunks(
  content: string,
  chunks: ArticleAssistantChunk[],
  annotations: ArticleAnnotation[],
): Set<number> {
  const bodies = splitArticleIntoChunks(content, chunks.map((c) => c.heading))
  const sealed = new Set<number>()
  for (const a of annotations) {
    const text = a.selectedText?.trim()
    if (!text) continue
    const i = bodies.findIndex((b) => b.body.includes(text))
    if (i >= 0) sealed.add(i)
  }
  return sealed
}
