import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup, act } from '@testing-library/react'

const annotationsRead = vi.fn()
const annotationsWrite = vi.fn()
vi.mock('@/lib/ipc', () => ({
  ipc: {
    annotationsRead: (...args: unknown[]) => annotationsRead(...args),
    annotationsWrite: (...args: unknown[]) => annotationsWrite(...args),
  },
}))

import { ArticleAnnotations } from '@/components/article-assistant/ArticleAnnotations'

const anno = {
  id: 'a1', selectedText: '目标文本', note: '批注', paragraphIndex: 1,
  createdAt: '2026-07-24', updatedAt: '2026-07-24',
}

function makeContainer() {
  const container = document.createElement('div')
  container.innerHTML = '<p>第一段包含目标文本。</p><p>第二段无关内容。</p>'
  document.body.appendChild(container)
  return container
}

describe('ArticleAnnotations marker scheduling', () => {
  beforeEach(() => {
    cleanup()
    document.body.innerHTML = ''
    annotationsRead.mockReset()
    annotationsWrite.mockReset()
    annotationsRead.mockResolvedValue([anno])
    annotationsWrite.mockResolvedValue(undefined)
  })
  afterEach(() => { document.body.innerHTML = '' })

  // 分两段等待：先让 annotationsRead 的 promise 解析并提交 state 更新
  // （单个长 act 内 React 会把该更新推迟到 act 退出时才提交，导致 100ms
  // settle 定时器来不及启动），再等待 settle 定时器触发 applyMarkers。
  const flushLoad = async () => {
    await act(async () => { await Promise.resolve() })
    await act(async () => { await new Promise((r) => setTimeout(r, 150)) })
  }

  it('applies markers on load without per-render rescans', async () => {
    const container = makeContainer()
    const ref = { current: container as HTMLElement }
    const walkerSpy = vi.spyOn(document, 'createTreeWalker')

    const { rerender } = render(<ArticleAnnotations articlePath="/x.md" articleRef={ref} briefingFontSize="lg" />)
    await flushLoad()
    expect(container.querySelector('.anno-wrap')).not.toBeNull()
    const scansAfterLoad = walkerSpy.mock.calls.length
    expect(scansAfterLoad).toBeGreaterThan(0)

    rerender(<ArticleAnnotations articlePath="/x.md" articleRef={ref} briefingFontSize="lg" />)
    rerender(<ArticleAnnotations articlePath="/x.md" articleRef={ref} briefingFontSize="lg" />)
    await act(async () => { await new Promise((r) => setTimeout(r, 250)) })
    expect(walkerSpy.mock.calls.length).toBe(scansAfterLoad)
    walkerSpy.mockRestore()
  })

  it('re-applies markers after the article DOM is replaced imperatively', async () => {
    const container = makeContainer()
    const ref = { current: container as HTMLElement }
    render(<ArticleAnnotations articlePath="/x.md" articleRef={ref} briefingFontSize="lg" />)
    await flushLoad()
    expect(container.querySelector('.anno-wrap')).not.toBeNull()

    // 模拟 ArticleBodyChunks 命令式替换文章 DOM
    container.innerHTML = '<p>第一段包含目标文本。</p><p>第二段无关内容。</p>'
    expect(container.querySelector('.anno-wrap')).toBeNull()
    await act(async () => { await new Promise((r) => setTimeout(r, 300)) })
    expect(container.querySelector('.anno-wrap')).not.toBeNull()
  })
})
