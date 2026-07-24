import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'

const factoryCalls: unknown[][] = []
let lastDeps: unknown[] | undefined
vi.mock('@milkdown/react', () => ({
  MilkdownProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Milkdown: () => <div data-testid="milkdown-root" />,
  useEditor: (_factory: unknown, deps: unknown[]) => {
    // Simulate real Milkdown: only invoke factory when deps change
    if (!lastDeps || deps.length !== lastDeps.length || deps.some((d, i) => d !== lastDeps[i])) {
      factoryCalls.push(deps)
      lastDeps = deps
    }
    return { loading: false, get: () => null }
  },
}))
vi.mock('@milkdown/core', () => ({ Editor: { make: () => ({ use() { return this }, config() { return this } }) }, rootCtx: 'rootCtx', defaultValueCtx: 'defaultValueCtx' }))
vi.mock('@milkdown/preset-commonmark', () => ({ commonmark: 'commonmark' }))
vi.mock('@milkdown/preset-gfm', () => ({ gfm: 'gfm' }))
vi.mock('@milkdown/plugin-listener', () => ({ listener: 'listener', listenerCtx: { markdownUpdated: vi.fn() } }))
vi.mock('@milkdown/plugin-history', () => ({ history: 'history' }))
vi.mock('@milkdown/plugin-clipboard', () => ({ clipboard: 'clipboard' }))

import { WritingEditor } from '@/components/writing/WritingEditor'

describe('WritingEditor', () => {
  beforeEach(() => { cleanup(); factoryCalls.length = 0; lastDeps = undefined })

  it('creates the editor once even when initial changes within the same mount', () => {
    const { rerender } = render(<WritingEditor initial="a" onChange={() => {}} />)
    rerender(<WritingEditor initial="ab" onChange={() => {}} />)
    rerender(<WritingEditor initial="abc" onChange={() => {}} />)
    expect(factoryCalls).toHaveLength(1)
  })

  it('recreates the editor on remount (file switch via key)', () => {
    const { unmount } = render(<WritingEditor key="f1" initial="a" onChange={() => {}} />)
    unmount()
    // Simulate new hook instance after remount (key change destroys old state)
    lastDeps = undefined
    render(<WritingEditor key="f2" initial="b" onChange={() => {}} />)
    expect(factoryCalls).toHaveLength(2)
  })
})
