import { useEffect, useRef } from 'react'

/**
 * Watches article body chunk sections via IntersectionObserver and fires
 * onActiveChange with the index of the most-visible section during scroll.
 *
 * Performance safeguards (per prior scroll-lag lessons):
 * - Single observer instance for all [data-chunk-index] sections
 * - rAF throttling: IO callback records ratios, rAF picks the winner once per frame
 * - Programmatic scroll suppression: caller can suppress observers for N ms
 *   (e.g. when navigateToChunk triggers scrollIntoView)
 * - rootMargin: top 10% tolerance, bottom 60% dead zone so only near-top sections count
 */
export function useChunkScrollSpy(
  containerRef: { current: HTMLElement | null },
  onActiveChange: (index: number | null) => void,
): { suppressFor: (ms: number) => void } {
  const skipUntilRef = useRef<number>(0)
  const rafRef = useRef<number>(0)
  const ratiosRef = useRef<Map<number, number>>(new Map())
  // Keep callback in a ref so the effect doesn't re-subscribe on every render
  const cbRef = useRef(onActiveChange)
  cbRef.current = onActiveChange

  const suppressFor = (ms: number) => {
    skipUntilRef.current = Date.now() + ms
  }

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const ratios = ratiosRef.current

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const el = entry.target as HTMLElement
          const idxStr = el.dataset.chunkIndex
          if (idxStr == null) continue
          const index = Number(idxStr)
          if (Number.isNaN(index)) continue
          if (entry.isIntersecting) {
            ratios.set(index, entry.intersectionRatio)
          } else {
            ratios.delete(index)
          }
        }

        // rAF throttle: only one winner-picking per frame
        if (rafRef.current !== 0) return
        rafRef.current = requestAnimationFrame(() => {
          rafRef.current = 0
          if (Date.now() < skipUntilRef.current) return
          if (ratios.size === 0) return
          let bestIndex = -1
          let bestRatio = 0
          for (const [idx, ratio] of ratios) {
            if (ratio > bestRatio) {
              bestRatio = ratio
              bestIndex = idx
            }
          }
          if (bestIndex >= 0) {
            cbRef.current(bestIndex)
          }
        })
      },
      {
        root: container,
        rootMargin: '-10% 0px -60% 0px',
        threshold: [0, 0.25, 0.5, 0.75],
      },
    )

    // Observe existing sections + watch for dynamically added ones
    const observeAll = () => {
      const sections = container.querySelectorAll('[data-chunk-index]')
      for (const s of sections) observer.observe(s)
    }
    observeAll()

    // MutationObserver to catch late-arriving sections (e.g. generation completes)
    const mo = new MutationObserver(() => observeAll())
    mo.observe(container, { childList: true, subtree: true })

    return () => {
      observer.disconnect()
      mo.disconnect()
      if (rafRef.current !== 0) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = 0
      }
    }
  }, [containerRef])

  return { suppressFor }
}
