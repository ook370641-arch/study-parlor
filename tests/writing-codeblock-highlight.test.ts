// @vitest-environment jsdom
// 代码块语法高亮(设计 2026-08-23 §3):refractor 装饰插件;
// 支持的语言 → token span;不支持/无语言 → 零装饰零报错。
import { describe, it, expect } from 'vitest'
import { Editor, rootCtx, defaultValueCtx, editorViewCtx } from '@milkdown/core'
import { commonmark } from '@milkdown/preset-commonmark'
import { gfm } from '@milkdown/preset-gfm'
import { codeblockSchemaPlugins } from '@/lib/milkdown-codeblock-schema'
import { codeblockViewPlugins } from '@/lib/milkdown-codeblock-view'
import { codeblockHighlightPlugins } from '@/lib/milkdown-codeblock-highlight'

async function makeEditor(initial: string) {
  const root = document.createElement('div')
  root.className = 'writing-editor-root'
  document.body.appendChild(root)
  return Editor.make()
    .use(commonmark).use(gfm)
    .use(codeblockSchemaPlugins)
    .use(codeblockViewPlugins)
    .use(codeblockHighlightPlugins)
    .config(ctx => { ctx.set(rootCtx, root); ctx.set(defaultValueCtx, initial) })
    .create()
}

describe('代码块语法高亮', () => {
  it('js 代码块出现 token 装饰 span', async () => {
    const te = await makeEditor('```js\nconst a = 1\n```')
    const view = te.ctx.get(editorViewCtx)
    const kw = view.dom.querySelector('.writing-codeblock .token.keyword')
    expect(kw).not.toBeNull()
    expect(kw!.textContent).toBe('const')
    te.destroy()
  })

  it('不支持的语言:无装饰、不报错', async () => {
    const te = await makeEditor('```cobol\nDISPLAY X\n```')
    const view = te.ctx.get(editorViewCtx)
    expect(view.dom.querySelector('.writing-codeblock .token')).toBeNull()
    expect(view.dom.textContent).toContain('DISPLAY X')
    te.destroy()
  })

  it('无语言/空代码块:无装饰、不报错', async () => {
    const te = await makeEditor('```\n\n```')
    const view = te.ctx.get(editorViewCtx)
    expect(view.dom.querySelector('.writing-codeblock .token')).toBeNull()
    te.destroy()
  })

  it('编辑后装饰跟随更新', async () => {
    const te = await makeEditor('```js\nlet a = 1\n```')
    const view = te.ctx.get(editorViewCtx)
    expect(view.dom.querySelector('.token.keyword')!.textContent).toBe('let')
    // 块首插入 const 语句
    let cbPos = -1
    view.state.doc.descendants((n, p) => { if (n.type.name === 'code_block') cbPos = p })
    view.dispatch(view.state.tr.insertText('const b = 2\n', cbPos + 1))
    const keywords = Array.from(view.dom.querySelectorAll('.token.keyword')).map(el => el.textContent)
    expect(keywords).toContain('const')
    expect(keywords).toContain('let')
    te.destroy()
  })
})
