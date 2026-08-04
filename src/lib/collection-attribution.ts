import { splitArticleIntoChunks } from './article-chunks'
import type { ArticleAssistantChunk, ArticleAssistantMessage } from '@shared/index'

export type AttributedMessage = { index: number; message: ArticleAssistantMessage }

/** DOM 选段是渲染后的纯文本，raw markdown 里的 **、` 等语法会阻碍 includes 匹配 */
function stripMarkdown(md: string): string {
  return md
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // [text](url) → text
    .replace(/[*_`#>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * 归属规则（spec：向前填充）：
 * 带 selection 的 user 消息更新当前归属块；其后的消息沿用该归属，直到下一个匹配成功的 selection。
 * selection 匹配不到任何块 → 当前归属置空，该段消息全部丢弃。
 */
export function attributeMessages(
  messages: ArticleAssistantMessage[],
  articleContent: string,
  guideChunks: ArticleAssistantChunk[],
): Map<number, AttributedMessage[]> {
  const result = new Map<number, AttributedMessage[]>()
  if (guideChunks.length === 0 || messages.length === 0) return result

  // splitArticleIntoChunks 返回的带标题块与 guide.chunks 顺序一一对应（preamble 无标题被过滤）
  const headed = splitArticleIntoChunks(articleContent, guideChunks.map((c) => c.heading))
    .filter((c) => c.heading)
  const bodies = guideChunks.map((_, gi) => {
    const raw = headed[gi]?.body ?? ''
    return { raw, plain: stripMarkdown(raw) }
  })

  let current: number | null = null
  messages.forEach((message, index) => {
    if (message.role === 'user' && message.selection) {
      const sel = message.selection
      const plain = stripMarkdown(sel)
      const found = bodies.findIndex(
        (b) => b.raw.includes(sel) || (plain.length >= 2 && b.plain.includes(plain))
      )
      current = found === -1 ? null : found
    }
    if (current !== null) {
      const list = result.get(current) ?? []
      list.push({ index, message })
      result.set(current, list)
    }
  })
  return result
}
