import type { ArticleAssistantGuide, ArticleAssistantMessage } from '@shared/index'

export function buildAssistantSystemPrompt(socratic = true): string {
  if (!socratic) {
    return `你是一位陪伴用户阅读文章的信息检索助手。

你的职责：
- 用户正在阅读一篇文章，你在旁边帮助他快速获取信息。
- 直接、简洁地回答问题，基于文章内容与搜索结果给出结论。
- 不要反问、不要质询、不要用提问引导用户。
- 除非用户明确要求用其他语言，一律用中文回答。`
  }
  return `你是一位陪伴用户阅读文章的苏格拉底式助手。

你的职责：
- 用户正在阅读一篇文章，你在旁边帮助他理解、思考和联想。
- 用简短的问题、类比和联想引导用户自己思考，而不是直接给出结论。
- 回答要简洁，不要长篇大论，一次聚焦一两个要点。
- 结合文章上下文、背景资料和用户选中的文本作答。
- 除非用户明确要求用其他语言，一律用中文回答。`
}

export function buildAssistantUserPrompt(args: {
  articleContent: string
  guide: ArticleAssistantGuide | null
  selection?: string
  messages: ArticleAssistantMessage[]
  searchResults?: string
  socratic?: boolean
}): string {
  const sections: string[] = []

  sections.push(`# 文章全文\n${args.articleContent}`)

  if (args.guide && args.guide.background) {
    sections.push(`# 文章背景\n${args.guide.background}`)
  }

  if (args.guide && args.guide.chunks.length > 0) {
    const summaryText = args.guide.chunks
      .map((c) => `## ${c.heading}\n${c.summary}`)
      .join('\n\n')
    sections.push(`# 文章摘要\n${summaryText}`)
  }

  if (args.selection && args.selection.trim()) {
    sections.push(`# 用户选中文本\n${args.selection.trim()}`)
  }

  if (args.searchResults) {
    sections.push(`# 网络搜索结果\n${args.searchResults}`)
  }

  if (args.messages.length > 0) {
    const historyText = args.messages
      .map((m) => `${m.role === 'user' ? '用户' : '助手'}：${m.content}`)
      .join('\n\n')
    sections.push(`# 历史对话\n${historyText}`)
  }

  sections.push(
    args.socratic === false
      ? '请针对用户当前问题或选中文本直接给出简明回答。'
      : '请针对用户当前问题或选中文本给出苏格拉底式回复。'
  )

  return sections.join('\n\n')
}

export function formatSearchResults(
  results: { title: string; url: string; content: string }[]
): string {
  return results
    .map((r, i) => `来源 ${i + 1}：${r.title}\n${r.content}\n链接：${r.url}`)
    .join('\n\n')
}
