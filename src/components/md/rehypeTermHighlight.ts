import type { Plugin } from 'unified'
import type { Root, Text, Element } from 'hast'
import { visit, SKIP } from 'unist-util-visit'

export type TermDef = { term: string; translation: string; explanation: string }

/**
 * Factory returning a rehype attacher that wraps glossary-term occurrences in the
 * article body with a `<span class="article-term-highlight" title="...">`.
 *
 * IMPORTANT: call this factory in `rehypePlugins`, e.g. `[rehypeTermHighlight(terms)]`.
 * Passing `[rehypeTermHighlight, terms]` double-wraps and does nothing.
 */
export function rehypeTermHighlight(terms: TermDef[]): Plugin<[], Root> {
  const sorted = [...terms]
    .filter((t) => t.term.trim().length > 0)
    .sort((a, b) => b.term.length - a.term.length)

  return () => (tree: Root) => {
    if (sorted.length === 0) return
    visit(tree, 'text', (node: Text, index, parent) => {
      if (index === undefined || !parent || parent.type !== 'element') return
      const el = parent as Element
      const tag = el.tagName
      if (tag === 'script' || tag === 'style') return
      // Guard: never descend into / re-wrap an already-highlighted span.
      const cls = String((el.properties?.className as unknown) ?? '')
      if (cls.includes('article-term-highlight')) return

      const parts: (Text | Element)[] = []
      let remaining = node.value
      let matched = false
      while (remaining) {
        const lower = remaining.toLowerCase()
        let bestIdx = -1
        let best: TermDef | null = null
        // Pick the leftmost occurrence; `sorted` (longest-first) breaks ties at
        // the same position by preferring the longer term.
        for (const t of sorted) {
          const i = lower.indexOf(t.term.toLowerCase())
          if (i >= 0 && (bestIdx === -1 || i < bestIdx)) {
            bestIdx = i
            best = t
          }
        }
        if (!best || bestIdx === -1) {
          parts.push({ type: 'text', value: remaining })
          break
        }
        matched = true
        if (bestIdx > 0) parts.push({ type: 'text', value: remaining.slice(0, bestIdx) })
        parts.push({
          type: 'element',
          tagName: 'span',
          properties: {
            className: 'article-term-highlight',
            title: `${best.translation} — ${best.explanation}`,
          },
          children: [{ type: 'text', value: remaining.slice(bestIdx, bestIdx + best.term.length) }],
        })
        remaining = remaining.slice(bestIdx + best.term.length)
      }
      if (!matched) return
      el.children.splice(index, 1, ...parts)
      // Skip the inserted nodes so visit does not descend into them (which would
      // match the term text again and wrap forever).
      return [SKIP, index + parts.length]
    })
  }
}
