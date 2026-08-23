// @vitest-environment jsdom
// 代码块折叠状态持久化(设计 2026-08-23 追加需求):折叠偏好存 state.json(块 hash 多重集合),
// 不进 .md;重开文件时恢复;内容编辑/删除块后自动清理残留。
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Editor, rootCtx, defaultValueCtx, editorViewCtx } from '@milkdown/core'
import { commonmark } from '@milkdown/preset-commonmark'
import { gfm } from '@milkdown/preset-gfm'
import { codeblockSchemaPlugins } from '@/lib/milkdown-codeblock-schema'
import { codeblockViewPlugins } from '@/lib/milkdown-codeblock-view'
import { codeblockHash } from '@/lib/codeblock-collapse'
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

function block(te: any): HTMLElement {
  const view = te.ctx.get(editorViewCtx)
  return view.dom.querySelector('[data-testid="writing-codeblock"]') as HTMLElement
}

function blocks(te: any): HTMLElement[] {
  const view = te.ctx.get(editorViewCtx)
  return Array.from(view.dom.querySelectorAll('[data-testid="writing-codeblock"]'))
}

const tick = () => new Promise(resolve => setTimeout(resolve, 0))

describe('代码块折叠状态持久化', () => {
  beforeEach(() => {
    useStore.setState({ writingCodeblockCollapsed: {} })
  })

  it('store 预置 hash → 建编辑器后该块恢复折叠', async () => {
    const h = codeblockHash('js', 'const a = 1')
    useStore.setState({ writingCodeblockCollapsed: { [FILE]: [h] } })
    const te = await makeEditor('```js\nconst a = 1\n```')
    await tick() // 恢复插件 setTimeout(0)
    expect(block(te).dataset.collapsed).toBe('true')
    te.destroy()
  })

  it('折叠 → store 含该文件 hash;展开 → 移除', async () => {
    const te = await makeEditor('```\nline1\nline2\nline3\nline4\n```')
    const dom = block(te)
    const h = codeblockHash('', 'line1\nline2\nline3\nline4')
    const toggle = dom.querySelector('[data-testid="writing-codeblock-toggle"]') as HTMLButtonElement
    toggle.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
    expect(useStore.getState().writingCodeblockCollapsed[FILE]).toContain(h)
    // 展开
    toggle.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
    expect(useStore.getState().writingCodeblockCollapsed[FILE] ?? []).not.toContain(h)
    te.destroy()
  })

  it('两个内容相同的块 + store 含 hash×2 → 都折叠;hash×1 → 只折叠第一个', async () => {
    const h = codeblockHash('', 'same')
    useStore.setState({ writingCodeblockCollapsed: { [FILE]: [h, h] } })
    let te = await makeEditor('```\nsame\n```\n\n```\nsame\n```')
    await tick()
    expect(blocks(te).map(b => b.dataset.collapsed)).toEqual(['true', 'true'])
    te.destroy()

    useStore.setState({ writingCodeblockCollapsed: { [FILE]: [h] } })
    te = await makeEditor('```\nsame\n```\n\n```\nsame\n```')
    await tick()
    expect(blocks(te).map(b => b.dataset.collapsed)).toEqual(['true', 'false'])
    te.destroy()
  })

  it('store 含不存在块的残留 hash → 打开后被清理', async () => {
    useStore.setState({ writingCodeblockCollapsed: { [FILE]: ['deadbeef'] } })
    const te = await makeEditor('```\nkept\n```')
    await tick()
    // 残留 hash 无法匹配任何块 → 写回空 → 该文件条目被删除
    expect(useStore.getState().writingCodeblockCollapsed[FILE]).toBeUndefined()
    expect(block(te).dataset.collapsed).toBe('false')
    te.destroy()
  })
})
