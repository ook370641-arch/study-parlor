import { useEffect, type RefObject } from 'react'

export function useFocusZone(rootRef: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    root.dataset.focusZone = 'none'

    const classify = (target: EventTarget | null) => {
      const zone = (target as Element | null)?.closest?.('[data-zone]')
      root.dataset.focusZone = zone?.getAttribute('data-zone') ?? 'none'
    }
    const onPointer = (e: PointerEvent) => classify(e.target)
    const onFocus = (e: FocusEvent) => classify(e.target)
    const onLeave = () => { root.dataset.focusZone = 'none' }

    window.addEventListener('pointermove', onPointer, { passive: true })
    window.addEventListener('focusin', onFocus)
    document.documentElement.addEventListener('mouseleave', onLeave)
    return () => {
      window.removeEventListener('pointermove', onPointer)
      window.removeEventListener('focusin', onFocus)
      document.documentElement.removeEventListener('mouseleave', onLeave)
    }
  }, [])
}
