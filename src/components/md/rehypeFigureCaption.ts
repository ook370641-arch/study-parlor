import type { Plugin } from 'unified'
import type { Root, Element, ElementContent } from 'hast'

const MAX_CAPTION_LENGTH = 140

function textContent(node: ElementContent): string {
  if (node.type === 'text') return node.value
  if (node.type === 'element') return node.children.map(textContent).join('')
  return ''
}

/** p 的唯一有效子节点是 img（允许空白文本节点） */
function isImageOnlyParagraph(node: ElementContent): node is Element {
  if (node.type !== 'element' || node.tagName !== 'p') return false
  const meaningful = node.children.filter((c) => !(c.type === 'text' && c.value.trim() === ''))
  return (
    meaningful.length === 1 &&
    meaningful[0].type === 'element' &&
    (meaningful[0] as Element).tagName === 'img'
  )
}

/** 图注候选：纯文本短段落（可含 em/strong），不含链接/图片 */
function captionText(node: ElementContent): string | null {
  if (node.type !== 'element' || node.tagName !== 'p') return null
  const el = node as Element
  const forbidden = el.children.some(
    (c) => c.type === 'element' && ((c as Element).tagName === 'a' || (c as Element).tagName === 'img')
  )
  if (forbidden) return null
  const text = el.children.map(textContent).join('').trim()
  if (text.length === 0 || text.length > MAX_CAPTION_LENGTH) return null
  return text
}

/**
 * 「独占一段的图片 + 紧随的短文本段落」→ figure > img + figcaption。
 * 对标官网博客的图注排版（Anthropic engineering 文章每图一行小字图注）。
 * 仅由 MarkdownContent 在 figureCaptions prop 开启时挂载（briefing 阅读器专用）。
 */
export const rehypeFigureCaption: Plugin<[], Root> = () => (tree) => {
  const process = (parent: Root | Element) => {
    const children = parent.children as ElementContent[]
    for (let i = 0; i < children.length - 1; i++) {
      const imgP = children[i]
      if (!isImageOnlyParagraph(imgP)) continue
      // remark-rehype 会在块级元素之间留下空白文本节点（"\n"），需跳过
      let j = i + 1
      while (j < children.length && children[j].type === 'text' && (children[j] as { value: string }).value.trim() === '') j++
      if (j >= children.length) continue
      const caption = captionText(children[j])
      if (caption === null) continue
      const img = imgP.children.find((c) => c.type === 'element') as Element
      const figure: Element = {
        type: 'element',
        tagName: 'figure',
        properties: { className: ['md-figure'] },
        children: [
          img,
          {
            type: 'element',
            tagName: 'figcaption',
            properties: {},
            children: [{ type: 'text', value: caption }],
          },
        ],
      }
      children.splice(i, j - i + 1, figure)
      i--
    }
    for (const child of children) {
      if (child.type === 'element') process(child as Element)
    }
  }
  process(tree)
}
