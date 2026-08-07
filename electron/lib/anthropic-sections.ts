import type { AnthropicSectionKey } from '@shared/index'

// 与 src/lib/anthropic-sections.ts 渲染侧副本保持同步（进程隔离，不能互 import；
// 双副本先例见 electron/lib/guide-v2.ts 的 GUIDE_FORMAT_VERSION）。
export interface AnthropicSource {
  key: AnthropicSectionKey
  label: string
  color: string
  discover: 'sitemap' | 'static-list' | 'rss'
  /** sitemap 策略：索引页（富元数据来源）；static-list/rss 策略：列表页/feed URL */
  indexUrl: string
  sitemapUrl?: string
  /** sitemap URL 过滤：包含此前缀（主站用） */
  linkPrefix?: string
  /** sitemap URL 过滤：整 URL 正则（product 排除本地化前缀用） */
  sitemapInclude?: RegExp
  excludePrefixes?: string[]
  /** importArticle 正文容器选择器链（缺省用主站现有链） */
  contentSelectors?: string[]
}

export const ANTHROPIC_SOURCES: AnthropicSource[] = [
  {
    key: 'engineering', label: 'Engineering', color: '#d97757',
    discover: 'sitemap',
    indexUrl: 'https://www.anthropic.com/engineering',
    sitemapUrl: 'https://www.anthropic.com/sitemap.xml',
    linkPrefix: '/engineering/',
  },
  {
    key: 'research', label: 'Research', color: '#6b8fa3',
    discover: 'sitemap',
    indexUrl: 'https://www.anthropic.com/research',
    sitemapUrl: 'https://www.anthropic.com/sitemap.xml',
    linkPrefix: '/research/',
    excludePrefixes: ['/research/team/'],
  },
  {
    key: 'alignment', label: 'Alignment', color: '#b08d57',
    discover: 'static-list',
    indexUrl: 'https://alignment.anthropic.com/',
    contentSelectors: ['d-article'],
  },
  {
    key: 'interpretability', label: 'Interpretability', color: '#7d6b9e',
    discover: 'rss',
    indexUrl: 'https://transformer-circuits.pub/feed.xml',
    contentSelectors: ['d-article'],
  },
  {
    key: 'product', label: 'Product', color: '#c2613e',
    discover: 'sitemap',
    indexUrl: 'https://claude.com/blog',
    sitemapUrl: 'https://claude.com/sitemap.xml',
    linkPrefix: '/blog/',
    sitemapInclude: /^https:\/\/claude\.com\/blog\/[^/]+$/,
    contentSelectors: ['main'],
  },
]

/** 遗留栏目（不再抓取，仅旧数据色签显示） */
export const LEGACY_SECTION_META: Record<string, { label: string; color: string }> = {
  institute: { label: 'Institute', color: '#8a9a5b' },
}

/** 从文章 URL 回推来源；无法识别时归 engineering（旧数据兜底） */
export function sectionForUrl(url: string): AnthropicSectionKey {
  if (url.includes('alignment.anthropic.com')) return 'alignment'
  if (url.includes('transformer-circuits.pub')) return 'interpretability'
  if (url.includes('claude.com/blog')) return 'product'
  if (url.includes('/institute/')) return 'institute'
  for (const s of ANTHROPIC_SOURCES) {
    if (s.linkPrefix && url.includes(s.linkPrefix)) return s.key
  }
  return 'engineering'
}
