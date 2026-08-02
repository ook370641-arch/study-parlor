import type { AnthropicArticleMeta } from '@shared/index'

/**
 * Claude's Constitution 可视化报告 —— Anthropic 博客列表中的本地置顶条目。
 * 不依赖网络抓取，渲染进程直接合成，点击后由 ConstitutionReportView 以
 * iframe (sp-report://) 渲染 constitution/index.html。
 */
export const CONSTITUTION_ARTICLE_URL = 'local://constitution-report'

export const CONSTITUTION_ARTICLE_META: AnthropicArticleMeta = {
  url: CONSTITUTION_ARTICLE_URL,
  title: "Claude's Constitution · 可视化双语读本",
  summary:
    'Anthropic 2026 年 1 月发布的 Claude 宪法交互式报告：结构总图、优先级金字塔、七条红线，含 13 章英中对照与 43 条夜话按注解。',
  publishedAt: null,
  imageUrl: null,
  isSaved: true,
  local: 'constitution',
}

/** 把宪法条目置顶合成进文章列表，并按 url 去重（持久化缓存可能已含旧条目）。 */
export function withConstitutionEntry(articles: AnthropicArticleMeta[]): AnthropicArticleMeta[] {
  return [CONSTITUTION_ARTICLE_META, ...articles.filter((a) => a.url !== CONSTITUTION_ARTICLE_URL)]
}
