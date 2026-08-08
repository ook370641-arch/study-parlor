import { describe, it, expect } from 'vitest'
import { transformSpanHtmlToTextColor, textColorToMarkdownExtension } from '../src/lib/milkdown-text-color'

describe('transformSpanHtmlToTextColor', () => {
  it('html span 开闭序列改写为 textColor 节点', () => {
    const tree = {
      type: 'root',
      children: [{
        type: 'paragraph',
        children: [
          { type: 'text', value: '前' },
          { type: 'html', value: '<span style="color:#d97757">' },
          { type: 'strong', children: [{ type: 'text', value: '重点' }] },
          { type: 'html', value: '</span>' },
          { type: 'text', value: '后' },
        ],
      }],
    }
    transformSpanHtmlToTextColor(tree as any)
    const para = (tree as any).children[0]
    expect(para.children).toHaveLength(3)
    expect(para.children[1].type).toBe('textColor')
    expect(para.children[1].data.color).toBe('#d97757')
    expect(para.children[1].children[0].type).toBe('strong')
  })

  it('不匹配颜色的 span / 未闭合 span 原样保留', () => {
    const tree = {
      type: 'root',
      children: [{
        type: 'paragraph',
        children: [
          { type: 'html', value: '<span class="x">' },
          { type: 'text', value: 'a' },
          { type: 'html', value: '</span>' },
        ],
      }],
    }
    transformSpanHtmlToTextColor(tree as any)
    expect((tree as any).children[0].children).toHaveLength(3)
    expect((tree as any).children[0].children[0].type).toBe('html')
  })
})

describe('textColorToMarkdownExtension', () => {
  it('textColor 节点序列化为 span HTML', async () => {
    const { toMarkdown } = await import('mdast-util-to-markdown')
    const out = toMarkdown(
      { type: 'paragraph', children: [
        { type: 'text', value: '前' },
        { type: 'textColor', data: { color: '#1a1a1a' }, children: [{ type: 'text', value: '黑字' }] } as any,
      ] } as any,
      { extensions: [textColorToMarkdownExtension] },
    )
    // toMarkdown 作为文档级序列化器强制以 '\n' 结尾(mdast-util-to-markdown 2.1.2 无关闭选项),
    // 对 span 序列化格式本身逐字符断言。
    expect(out.trimEnd()).toBe('前<span style="color:#1a1a1a">黑字</span>')
  })
})
