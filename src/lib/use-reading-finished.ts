import { useEffect, useRef, useState, type RefObject } from 'react'

/**
 * 唯一「读完」语义（F6 燃熄 / F7 阖卷共享，禁止第二套判定）。
 * hasScrolled 守卫：用户至少滚过一次才计数——防短正文打开即已读。
 * resetKey = filePath，切换即归零。
 */
export function useReadingFinished(
  containerRef: RefObject<HTMLElement | null>,
  sentinelRef: RefObject<HTMLElement | null>,
  resetKey: string | undefined,
): boolean {
  const [finished, setFinished] = useState(false)
  const scrolled = useRef(false)

  useEffect(() => {
    setFinished(false)
    scrolled.current = false
    const container = containerRef.current
    const sentinel = sentinelRef.current
    if (!container || !sentinel) return

    const onScroll = () => { scrolled.current = true }
    container.addEventListener('scroll', onScroll, { passive: true })
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting) && scrolled.current) setFinished(true)
    }, { root: container, threshold: 0.6 })
    io.observe(sentinel)

    return () => {
      container.removeEventListener('scroll', onScroll)
      io.disconnect()
    }
  }, [resetKey])

  return finished
}
