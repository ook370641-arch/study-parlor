import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useFocusZone } from '@/lib/use-focus-zone'

function buildDom() {
  document.body.innerHTML = `
    <div id="root">
      <div data-zone="rail-source"><button id="s1">x</button></div>
      <div data-zone="rail-list"><button id="l1">x</button></div>
      <div data-zone="article"><p id="a1">text</p></div>
    </div>`
  return document.getElementById('root') as HTMLElement
}

describe('useFocusZone', () => {
  let root: HTMLElement
  beforeEach(() => { root = buildDom() })
  afterEach(() => { document.body.innerHTML = '' })

  it('pointer over a zone lights it and dims the rest; leaving returns to none', () => {
    const rootRef = { current: root }
    renderHook(() => useFocusZone(rootRef))
    expect(root.dataset.focusZone).toBe('none')

    document.getElementById('a1')!.dispatchEvent(new MouseEvent('pointermove', { bubbles: true }))
    expect(root.dataset.focusZone).toBe('article')

    document.getElementById('s1')!.dispatchEvent(new MouseEvent('pointermove', { bubbles: true }))
    expect(root.dataset.focusZone).toBe('rail-source')

    document.body.dispatchEvent(new MouseEvent('pointermove', { bubbles: true }))
    expect(root.dataset.focusZone).toBe('none')
  })

  it('keyboard focus inside a zone counts as presence', () => {
    const rootRef = { current: root }
    renderHook(() => useFocusZone(rootRef))
    document.getElementById('l1')!.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
    expect(root.dataset.focusZone).toBe('rail-list')
  })
})
