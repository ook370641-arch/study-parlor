import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const annotationsRead = vi.fn()
const annotationsWrite = vi.fn()
const setAnnotationHighlightColor = vi.fn()
let annotationHighlightColor = 'gold'

vi.mock('@/lib/ipc', () => ({
  ipc: {
    annotationsRead: (...args: unknown[]) => annotationsRead(...args),
    annotationsWrite: (...args: unknown[]) => annotationsWrite(...args),
  },
}))

vi.mock('@/store', () => ({
  useStore: (selector: (state: any) => any) => selector({
    annotationHighlightColor,
    setAnnotationHighlightColor,
  }),
}))

import { ArticleAnnotations } from '@/components/article-assistant/ArticleAnnotations'
import type { ArticleAnnotation } from '@shared/index'

const noteAnnotation = {
  id: 'a1',
  selectedText: '目标文本',
  note: '',
  paragraphIndex: 1,
  createdAt: '2026-10-31',
  updatedAt: '2026-10-31',
}

function makeContainer() {
  const container = document.createElement('div')
  container.innerHTML = '<p>第一段包含目标文本。</p><p>第二段无关内容。</p>'
  document.body.appendChild(container)
  return container
}

async function flushLoad() {
  await act(async () => { await Promise.resolve() })
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 150)) })
}

async function renderAnnotations(initial: ArticleAnnotation[] = []) {
  annotationsRead.mockResolvedValue(initial)
  const container = makeContainer()
  const ref = { current: container as HTMLElement }
  const result = render(<ArticleAnnotations articlePath="/x.md" articleRef={ref} briefingFontSize="base" />)
  await flushLoad()
  return { ...result, container }
}

async function triggerGhost(container: HTMLElement) {
  await act(async () => {
    ;(window as any).__e2e_triggerGhostPen(container.querySelector('p'), 0, 4)
  })
}

describe('ArticleAnnotations actions', () => {
  beforeEach(() => {
    cleanup()
    document.body.innerHTML = ''
    annotationsRead.mockReset()
    annotationsWrite.mockReset()
    annotationsWrite.mockResolvedValue(undefined)
    setAnnotationHighlightColor.mockReset()
    annotationHighlightColor = 'gold'
    Object.defineProperty(Range.prototype, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        left: 20, top: 20, right: 60, bottom: 36, width: 40, height: 16, x: 20, y: 20,
        toJSON: () => ({}),
      }),
    })
    Object.defineProperty(Range.prototype, 'getClientRects', {
      configurable: true,
      value: () => [],
    })
  })

  afterEach(() => {
    cleanup()
    document.body.innerHTML = ''
    vi.restoreAllMocks()
  })

  it('creates a persistent highlight immediately without opening a note card', async () => {
    const { container } = await renderAnnotations()
    await triggerGhost(container)

    fireEvent.click(screen.getByTestId('anno-highlight-button'))

    expect(annotationsWrite).toHaveBeenCalledWith('/x.md', [
      expect.objectContaining({
        selectedText: '第一段包',
        note: '',
        kind: 'highlight',
        highlightColor: 'gold',
      }),
    ])
    expect(screen.queryByTestId('anno-note-card')).toBeNull()
  })

  it('shows the permanent highlight without requiring another selection change', async () => {
    const { container } = await renderAnnotations()
    await triggerGhost(container)
    expect(window.getSelection()?.isCollapsed).toBe(false)

    fireEvent.click(screen.getByTestId('anno-highlight-button'))
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 150)) })

    expect(container.querySelector('.anno-wrap')).not.toBeNull()
  })

  it('persists the selected highlight color and keeps the selection toolbar available', async () => {
    const { container } = await renderAnnotations()
    await triggerGhost(container)

    fireEvent.click(screen.getByTestId('anno-highlight-color-toggle'))
    expect(screen.getByTestId('anno-highlight-color-menu')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('anno-highlight-color-blue'))

    expect(setAnnotationHighlightColor).toHaveBeenCalledWith('blue')
    expect(screen.getByTestId('anno-highlight-button')).toBeInTheDocument()
    expect(annotationsWrite).not.toHaveBeenCalled()
  })

  it('autosaves an empty-note annotation on outside click and always offers delete', async () => {
    const { container } = await renderAnnotations([noteAnnotation])
    fireEvent.click(container.querySelector('.anno-wrap')!)

    expect(screen.queryByTestId('anno-save-button')).toBeNull()
    expect(screen.getByTestId('anno-delete-button')).toBeInTheDocument()
    fireEvent.change(screen.getByTestId('anno-note-textarea'), { target: { value: '自动保存' } })
    fireEvent.mouseDown(document.body)
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)) })

    expect(annotationsWrite).toHaveBeenCalledWith('/x.md', expect.arrayContaining([
      expect.objectContaining({ id: 'a1', note: '自动保存' }),
    ]))
    expect(screen.queryByTestId('anno-note-card')).toBeNull()
  })

  it('deletes an empty-note annotation from its card', async () => {
    const { container } = await renderAnnotations([noteAnnotation])
    fireEvent.click(container.querySelector('.anno-wrap')!)
    fireEvent.click(screen.getByTestId('anno-delete-button'))

    expect(annotationsWrite).toHaveBeenCalledWith('/x.md', [])
    expect(container.querySelector('.anno-wrap')).toBeNull()
  })

  it('changes and deletes a persisted highlight without showing a note editor', async () => {
    const highlight = {
      ...noteAnnotation,
      kind: 'highlight',
      highlightColor: 'green',
    } as ArticleAnnotation
    const { container } = await renderAnnotations([highlight])
    expect(container.querySelector('.anno-pen')).toBeNull()

    fireEvent.click(container.querySelector('.anno-wrap')!)
    expect(screen.queryByTestId('anno-note-textarea')).toBeNull()
    fireEvent.click(screen.getByTestId('anno-highlight-color-blue'))

    expect(annotationsWrite).toHaveBeenLastCalledWith('/x.md', [
      expect.objectContaining({ id: 'a1', kind: 'highlight', highlightColor: 'blue' }),
    ])

    fireEvent.click(screen.getByTestId('anno-delete-button'))
    expect(annotationsWrite).toHaveBeenLastCalledWith('/x.md', [])
    expect(container.querySelector('.anno-wrap')).toBeNull()
  })
})
