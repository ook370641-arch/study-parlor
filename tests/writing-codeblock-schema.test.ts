// @vitest-environment jsdom
// code_block 节点 collapsed 视图态 attr(设计 2026-08-23 §4):默认 false、可 setNodeMarkup、
// 序列化回 markdown 时不得出现(纯视图态,不落盘)。
import { describe, it, expect } from 'vitest'
import { Editor, rootCtx, defaultValueCtx, editorViewCtx } from '@milkdown/core'
import { commonmark } from '@milkdown/preset-commonmark'
import { gfm } from '@milkdown/preset-gfm'
import { getMarkdown } from '@milkdown/utils'
import { codeblockSchemaPlugins } from '@/lib/milkdown-codeblock-schema'

async function makeEditor(initial: string) {
  const root = document.createElement('div')
  root.className = 'writing-editor-root'
  document.body.appendChild(root)
  return Editor.make()
    .use(commonmark).use(gfm)
    .use(codeblockSchemaPlugins)
    .config(ctx => { ctx.set(rootCtx, root); ctx.set(defaultValueCtx, initial) })
    .create()
}

describe('code_block collapsed attr', () => {
  it('默认 collapsed=false,markdown 序列化不含 collapsed', async () => {
    const te = await makeEditor('```js\nconst a = 1\n```')
    const view = te.ctx.get(editorViewCtx)
    let cb: any = null
    view.state.doc.descendants((n) => { if (n.type.name === 'code_block') cb = n })
    expect(cb).not.toBeNull()
    expect(cb.attrs.collapsed).toBe(false)
    expect(cb.attrs.language).toBe('js')

    const md = te.action(getMarkdown())
    expect(md).toContain('```js')
    expect(md).not.toContain('collapsed')
    te.destroy()
  })

  it('setNodeMarkup 可将 collapsed 置 true,序列化仍不含 collapsed', async () => {
    const te = await makeEditor('```\nlet b = 2\n```')
    const view = te.ctx.get(editorViewCtx)
    let pos = -1
    view.state.doc.descendants((n, p) => { if (n.type.name === 'code_block') pos = p })
    view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, { language: '', collapsed: true }))
    const cb = view.state.doc.nodeAt(pos)!
    expect(cb.attrs.collapsed).toBe(true)
    const md = te.action(getMarkdown())
    expect(md).not.toContain('collapsed')
    te.destroy()
  })
})
