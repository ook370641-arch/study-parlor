import type { AnthropicSectionKey } from '@shared/index'

// 与 src/lib/anthropic-sections.ts 中的渲染侧副本保持同步（进程隔离，不能互 import；
// 双副本先例见 electron/lib/guide-v2.ts 的 GUIDE_FORMAT_VERSION）。
export interface AnthropicSection {
  key: AnthropicSectionKey
  label: string
  indexUrl: string
  linkPrefix: string
  /** 索引页中需要排除的链接前缀（如 research 的团队页） */
  excludePrefixes?: string[]
  color: string
}

export const ANTHROPIC_SECTIONS: AnthropicSection[] = [
  {
    key: 'engineering',
    label: 'Engineering',
    indexUrl: 'https://www.anthropic.com/engineering',
    linkPrefix: '/engineering/',
    color: '#d97757',
  },
  {
    key: 'institute',
    label: 'Institute',
    indexUrl: 'https://www.anthropic.com/institute',
    linkPrefix: '/institute/',
    color: '#8a9a5b',
  },
  {
    key: 'research',
    label: 'Research',
    indexUrl: 'https://www.anthropic.com/research',
    linkPrefix: '/research/',
    excludePrefixes: ['/research/team/'],
    color: '#6b8fa3',
  },
]

/** 从文章 URL 回推栏目；无法识别时归 engineering（旧数据兜底） */
export function sectionForUrl(url: string): AnthropicSectionKey {
  for (const s of ANTHROPIC_SECTIONS) {
    if (url.includes(s.linkPrefix)) return s.key
  }
  return 'engineering'
}
