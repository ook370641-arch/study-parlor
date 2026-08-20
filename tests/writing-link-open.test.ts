// @vitest-environment jsdom
// 回归测试:写作编辑器内链接的显示与点击打开。
//
// 背景(2026-08-18 用户反馈):hermes 日报开头的 file:// 链接在编辑器里
// 无法显示也无法点击。根因两层:
// 1) @milkdown/preset-commonmark 的 sanitizeLinkHref 白名单(http/https/mailto/tel/ftp)
//    把 file:// 清洗成 href="",但 mark.attrs.href 里的原始 URL 完好;
// 2) Tailwind preflight 重置 a 样式 + ProseMirror 可编辑视图拦截点击。
//
// 修复:CSS 恢复链接可见性(选择器用 a 而非 a[href],因为 href 被清空);
// linkOpenPlugins 在点击时从文档 mark 取原始 href 路由——http(s) 走浏览器,
// file:// 用系统默认程序打开。
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/ipc', () => ({
  ipc: {
    openExternal: vi.fn(() => Promise.resolve()),
    openLocalFile: vi.fn(() => Promise.resolve()),
  },
}))

import { Editor, rootCtx, defaultValueCtx, editorViewCtx } from '@milkdown/core'
import { commonmark } from '@milkdown/preset-commonmark'
import { resolveLinkOpen, findLinkHrefAt, linkOpenPlugins } from '@/lib/milkdown-link-open'
import { ipc } from '@/lib/ipc'

beforeEach(() => vi.clearAllMocks())

const FILE_URL = 'file:///C:/Users/86468/Desktop/Agent/%E6%97%A5%E6%8A%A5/8.16.html'
const MD = `**完整版**：[点击打开 8.16.html](${FILE_URL})\n\n正文 [外链](https://example.com/a?b=1)。`

async function makeEditor(initial: string) {
  const root = document.createElement('div')
  root.className = 'writing-editor-root'
  document.body.appendChild(root)
  return Editor.make()
    .use(commonmark)
    .use(linkOpenPlugins)
    .config(ctx => {
      ctx.set(rootCtx, root)
      ctx.set(defaultValueCtx, initial)
    })
    .create()
}

describe('resolveLinkOpen', () => {
  it('routes https to external', () => {
    expect(resolveLinkOpen('https://example.com/a?b=1')).toEqual({ kind: 'external', url: 'https://example.com/a?b=1' })
  })

  it('routes http to external', () => {
    expect(resolveLinkOpen('http://example.com')).toEqual({ kind: 'external', url: 'http://example.com' })
  })

  it('routes file:// to local', () => {
    expect(resolveLinkOpen(FILE_URL)).toEqual({ kind: 'local', url: FILE_URL })
  })

  it('returns null for mailto / javascript / empty / non-string', () => {
    expect(resolveLinkOpen('mailto:a@b.c')).toBeNull()
    expect(resolveLinkOpen('javascript:alert(1)')).toBeNull()
    expect(resolveLinkOpen('')).toBeNull()
    expect(resolveLinkOpen('   ')).toBeNull()
    expect(resolveLinkOpen(undefined)).toBeNull()
    expect(resolveLinkOpen(null)).toBeNull()
  })
})

describe('file:// link in editor', () => {
  it('keeps raw file:// href in the link mark (the workaround premise)', async () => {
    const editor = await makeEditor(MD)
    editor.action(ctx => {
      const { doc } = ctx.get(editorViewCtx).state
      let href: string | undefined
      doc.descendants(node => {
        const mark = node.marks.find(m => m.type.name === 'link')
        if (mark && node.text?.includes('8.16.html')) href = mark.attrs.href as string
      })
      expect(href).toBe(FILE_URL)
    })
  })

  it('renders file:// link with empty href (why CSS must target `a`, not `a[href]`)', async () => {
    const editor = await makeEditor(MD)
    editor.action(ctx => {
      const dom = ctx.get(editorViewCtx).dom
      const anchors = [...dom.querySelectorAll('a')]
      const fileAnchor = anchors.find(a => a.textContent?.includes('8.16.html'))
      expect(fileAnchor).toBeTruthy()
      expect(fileAnchor!.getAttribute('href')).toBe('')
      // http 链接不受白名单影响
      const httpAnchor = anchors.find(a => a.textContent === '外链')
      expect(httpAnchor!.getAttribute('href')).toBe('https://example.com/a?b=1')
    })
  })

  it('findLinkHrefAt returns the raw href for a position inside link text', async () => {
    const editor = await makeEditor(MD)
    editor.action(ctx => {
      const { doc } = ctx.get(editorViewCtx).state
      let filePos = -1
      let httpPos = -1
      doc.descendants((node, pos) => {
        if (node.isText && node.text?.includes('8.16.html')) filePos = pos + 1
        if (node.isText && node.text === '外链') httpPos = pos + 1
      })
      expect(filePos).toBeGreaterThan(-1)
      expect(httpPos).toBeGreaterThan(-1)
      expect(findLinkHrefAt(doc, filePos)).toBe(FILE_URL)
      expect(findLinkHrefAt(doc, httpPos)).toBe('https://example.com/a?b=1')
    })
  })

  it('findLinkHrefAt returns null for plain text', async () => {
    const editor = await makeEditor(MD)
    editor.action(ctx => {
      const { doc } = ctx.get(editorViewCtx).state
      let plainPos = -1
      doc.descendants((node, pos) => {
        if (node.isText && node.text?.includes('正文')) plainPos = pos + 1
      })
      expect(plainPos).toBeGreaterThan(-1)
      expect(findLinkHrefAt(doc, plainPos)).toBeNull()
    })
  })
})

describe('handleClick 打开时机', () => {
  function clickAt(view: import('@milkdown/prose/view').EditorView, pos: number, target: EventTarget | null) {
    const event = { target } as MouseEvent
    view.someProp('handleClick', fn => { fn(view, pos, event) })
  }

  it('点击直接落在锚点上 → 打开链接', async () => {
    const editor = await makeEditor(MD)
    editor.action(ctx => {
      const view = ctx.get(editorViewCtx)
      const anchor = [...view.dom.querySelectorAll('a')].find(a => a.textContent?.includes('8.16.html'))!
      let pos = -1
      view.state.doc.descendants((node, p) => {
        if (node.isText && node.text?.includes('8.16.html')) pos = p + 1
      })
      expect(pos).toBeGreaterThan(-1)
      clickAt(view, pos, anchor)
      expect(ipc.openLocalFile).toHaveBeenCalledWith(FILE_URL)
    })
  })

  it('点击落在锚点之外（光标定位到链接后）→ 不打开', async () => {
    const editor = await makeEditor(MD)
    editor.action(ctx => {
      const view = ctx.get(editorViewCtx)
      // 链接文本末尾的下一个位置 = 用户把光标点到链接后面想按删除键的场景
      let endPos = -1
      view.state.doc.descendants((node, p) => {
        if (node.isText && node.text?.includes('8.16.html')) endPos = p + node.nodeSize
      })
      expect(endPos).toBeGreaterThan(-1)
      const paragraph = view.dom.querySelector('p')!
      clickAt(view, endPos, paragraph)
      expect(ipc.openLocalFile).not.toHaveBeenCalled()
      expect(ipc.openExternal).not.toHaveBeenCalled()
    })
  })
})
