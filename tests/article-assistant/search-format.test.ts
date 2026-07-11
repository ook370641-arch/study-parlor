import { describe, it, expect } from 'vitest'
import { formatSearchResults } from '../../electron/lib/article-assistant-prompt'

describe('formatSearchResults', () => {
  it('renders each title, content body, and url with 1-based 来源 indices', () => {
    const out = formatSearchResults([
      { title: '标题A', url: 'https://a.example', content: '内容A' },
      { title: '标题B', url: 'https://b.example', content: '内容B' },
    ])

    // real label format from the source: `来源 N：{title}\n{content}\n链接：{url}`
    expect(out).toContain('来源 1：标题A')
    expect(out).toContain('内容A')
    expect(out).toContain('链接：https://a.example')
    expect(out).toContain('来源 2：标题B')
    expect(out).toContain('内容B')
    expect(out).toContain('链接：https://b.example')

    // indices are 1-based and ordered
    expect(out).not.toContain('来源 0')
    expect(out.indexOf('来源 1')).toBeLessThan(out.indexOf('来源 2'))

    // blocks joined by a blank line
    expect(out).toContain('链接：https://a.example\n\n来源 2：标题B')
  })

  it('returns an empty string for an empty array', () => {
    expect(formatSearchResults([])).toBe('')
  })
})
