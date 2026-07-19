// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { Editor, rootCtx, defaultValueCtx } from '@milkdown/core'
import { commonmark } from '@milkdown/preset-commonmark'
import { gfm } from '@milkdown/preset-gfm'
import { listener } from '@milkdown/plugin-listener'
import { getMarkdown } from '@milkdown/utils'

// Each fixture: markdown input, plus a semantic marker that must survive round-trip.
// Milkdown v7 normalizes some syntax (e.g. list bullets from '-' to '*', GFM table
// separator widths), so the semantic check uses content-significant substrings rather
// than exact character matching.
const FIXTURES: Array<{ md: string; marker: string }> = [
  { md: '# 标题\n\n正文**加粗**与*斜体*。\n', marker: '**加粗**' },
  { md: '| a | b |\n|---|---|\n| 1 | 2 |\n', marker: '| 1 | 2 |' },
  { md: '- 一\n  - 二\n    - 三\n', marker: '一' },
  { md: '```ts\nconst x = 1\n```\n', marker: '```ts' },
  { md: '> 引用\n> 多行\n', marker: '引用' },
]

describe('milkdown round-trip', () => {
  for (const [i, { md, marker }] of FIXTURES.entries()) {
    it(`fixture ${i} 语义保持且二次序列化幂等`, async () => {
      const root = document.createElement('div')
      const editor = await Editor.make()
        .config(ctx => { ctx.set(rootCtx, root); ctx.set(defaultValueCtx, md) })
        .use(commonmark).use(gfm).use(listener).create()
      const once = editor.action(getMarkdown())
      editor.destroy()
      // Second round
      const root2 = document.createElement('div')
      const editor2 = await Editor.make()
        .config(ctx => { ctx.set(rootCtx, root2); ctx.set(defaultValueCtx, once) })
        .use(commonmark).use(gfm).use(listener).create()
      const twice = editor2.action(getMarkdown())
      editor2.destroy()
      expect(twice).toBe(once)          // idempotent
      expect(once).toContain(marker)     // semantic: content-significant substring survives
    })
  }
})
