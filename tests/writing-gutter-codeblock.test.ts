// @vitest-environment jsdom
// 加号栏「代码块」入口(设计 2026-08-23 §1):菜单出现该项,点击把当前块转为代码块。
import { describe, it, expect } from 'vitest'
import { Editor, rootCtx, defaultValueCtx, editorViewCtx } from '@milkdown/core'
import { commonmark } from '@milkdown/preset-commonmark'
import { gfm } from '@milkdown/preset-gfm'
import { codeblockSchemaPlugins } from '@/lib/milkdown-codeblock-schema'
import { codeblockViewPlugins } from '@/lib/milkdown-codeblock-view'
import { gutterInsertPlugins } from '@/lib/milkdown-gutter-insert'

async function makeEditor(initial: string) {
  const root = document.createElement('div')
  root.className = 'writing-editor-root'
  document.body.appendChild(root)
  return Editor.make()
    .use(commonmark).use(gfm)
    .use(codeblockSchemaPlugins)
    .use(codeblockViewPlugins('test.md'))
    .use(gutterInsertPlugins)
    .config(ctx => { ctx.set(rootCtx, root); ctx.set(defaultValueCtx, initial) })
    .create()
}

describe('加号栏代码块入口', () => {
  it('菜单含「代码块」项,点击后当前段落变成代码块(NodeView 外壳挂载)', async () => {
    const te = await makeEditor('前文段落')
    const view = te.ctx.get(editorViewCtx)
    // 触发一次 layout:插件构造时已 layout 一次,光标在首段 depth 1 → plus 可见
    const root = view.dom.closest('.writing-editor-root') as HTMLElement
    const plus = root.querySelector('[data-testid="writing-gutter-plus"]') as HTMLButtonElement
    expect(plus.style.display).not.toBe('none')
    plus.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))

    const item = root.querySelector('[data-testid="writing-gutter-item"][data-type="codeblock"]') as HTMLButtonElement
    expect(item).not.toBeNull()
    expect(item.textContent).toBe('代码块')
    item.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))

    const first = view.state.doc.child(0)
    expect(first.type.name).toBe('code_block')
    expect(root.querySelector('[data-testid="writing-codeblock"]')).not.toBeNull()
    te.destroy()
  })
})
