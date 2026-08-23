// @vitest-environment jsdom
// 代码块 NodeView 外壳(设计 2026-08-23 §2):头部行(折叠箭头 + 语言只读标签)、
// contentDOM 可编辑、折叠箭头/展开条切换 collapsed attr;编辑事件不被外壳拦截。
// 折叠偏好经 store → ipc.patchState,jsdom 无 window.api,故 mock ipc。
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Editor, rootCtx, defaultValueCtx, editorViewCtx } from '@milkdown/core'
import { commonmark } from '@milkdown/preset-commonmark'
import { gfm } from '@milkdown/preset-gfm'
import { TextSelection } from '@milkdown/prose/state'
import { codeblockSchemaPlugins } from '@/lib/milkdown-codeblock-schema'
import { codeblockViewPlugins } from '@/lib/milkdown-codeblock-view'
import { useStore } from '@/store'

vi.mock('@/lib/ipc', () => ({ ipc: { patchState: vi.fn() } }))

const FILE = 'test.md'

async function makeEditor(initial: string) {
  const root = document.createElement('div')
  root.className = 'writing-editor-root'
  document.body.appendChild(root)
  return Editor.make()
    .use(commonmark).use(gfm)
    .use(codeblockSchemaPlugins)
    .use(codeblockViewPlugins(FILE))
    .config(ctx => { ctx.set(rootCtx, root); ctx.set(defaultValueCtx, initial) })
    .create()
}

function getBlock(te: any) {
  const view = te.ctx.get(editorViewCtx)
  const dom = view.dom.querySelector('[data-testid="writing-codeblock"]') as HTMLElement
  return { view, dom }
}

describe('代码块 NodeView 外壳', () => {
  beforeEach(() => {
    useStore.setState({ writingCodeblockCollapsed: {} })
  })

  it('渲染头部行:箭头 + 语言标签;contentDOM 为 pre>code', async () => {
    const te = await makeEditor('```js\nconst a = 1\n```')
    const { dom } = getBlock(te)
    expect(dom).not.toBeNull()
    expect(dom.dataset.collapsed).toBe('false')
    expect(dom.querySelector('[data-testid="writing-codeblock-toggle"]')!.textContent).toBe('▾')
    expect(dom.querySelector('[data-testid="writing-codeblock-lang"]')!.textContent).toBe('js')
    expect(dom.querySelector('pre > code')).not.toBeNull()
    te.destroy()
  })

  it('无语言时标签显示「文本」', async () => {
    const te = await makeEditor('```\nplain\n```')
    const { dom } = getBlock(te)
    expect(dom.querySelector('[data-testid="writing-codeblock-lang"]')!.textContent).toBe('文本')
    te.destroy()
  })

  it('点箭头折叠 → data-collapsed=true + 展开条可见;点展开条恢复', async () => {
    const te = await makeEditor('```\nline1\nline2\nline3\nline4\n```')
    const { view, dom } = getBlock(te)
    const toggle = dom.querySelector('[data-testid="writing-codeblock-toggle"]') as HTMLButtonElement
    toggle.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
    expect(dom.dataset.collapsed).toBe('true')
    expect(toggle.textContent).toBe('▸')
    const expand = dom.querySelector('[data-testid="writing-codeblock-expand"]') as HTMLButtonElement
    expect(expand.style.display).not.toBe('none')
    // attr 真的写进了 doc
    let cb: any = null
    view.state.doc.descendants((n) => { if (n.type.name === 'code_block') cb = n })
    expect(cb.attrs.collapsed).toBe(true)

    expand.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
    expect(dom.dataset.collapsed).toBe('false')
    expect(expand.style.display).toBe('none')
    te.destroy()
  })

  it('外壳不拦截 contentDOM 内事件,光标可进入代码区编辑', async () => {
    const te = await makeEditor('前文\n\n```\nlet x = 1\n```')
    const { view, dom } = getBlock(te)
    // 光标放进代码块末尾,插字符走 PM 正常路径
    let cbPos = -1
    view.state.doc.descendants((n, p) => { if (n.type.name === 'code_block') cbPos = p })
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, cbPos + 1 + 'let x = 1'.length)))
    view.dispatch(view.state.tr.insertText('!'))
    expect(dom.textContent).toContain('let x = 1!')
    // 语言标签不应被当成可编辑内容
    expect(view.state.doc.textContent).not.toContain('文本')
    te.destroy()
  })
})
