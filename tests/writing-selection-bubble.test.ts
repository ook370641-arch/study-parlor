// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { shouldShowBubble } from '@/lib/milkdown-selection-bubble'

// shouldShowBubble 是纯决策函数;视图层行为(定位/点击保持/隐藏)由 Task 8 E2E 覆盖。
describe('shouldShowBubble', () => {
  it('空选区 → false', () => {
    expect(shouldShowBubble({ empty: true }, true)).toBe(false)
  })
  it('非空选区 + 可编辑 → true', () => {
    const sel = { empty: false, $from: { depth: 1, node: (d: number) => ({ type: { name: d === 1 ? 'doc' : 'paragraph' } }) } }
    expect(shouldShowBubble(sel, true)).toBe(true)
  })
  it('不可编辑 → false', () => {
    expect(shouldShowBubble({ empty: false, $from: { depth: 1, node: () => ({ type: { name: 'paragraph' } }) } }, false)).toBe(false)
  })
  it('代码块内 → false', () => {
    const sel = { empty: false, $from: { depth: 2, node: (d: number) => ({ type: { name: d === 2 ? 'code_block' : 'doc' } }) } }
    expect(shouldShowBubble(sel, true)).toBe(false)
  })
})
