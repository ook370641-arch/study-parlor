import { useEffect, useRef } from 'react'
import { useStore } from '@/store'

const SIZE = 640
const LERP = 0.11
const IDLE_MS = 8000

const AMBER = { a: '255, 214, 150', b: '255, 190, 110', c: '255, 226, 175' }

function gradient(p: typeof AMBER): string {
  return [
    `radial-gradient(closest-side, rgba(${p.a}, 0.20), rgba(${p.b}, 0.08) 45%, transparent 72%)`,
    `radial-gradient(closest-side, rgba(${p.c}, 0.14), transparent 55%)`,
  ].join(', ')
}

export function CandlelightLayer() {
  const enabled = useStore((s) => s.candlelightEnabled)
  const theme = useStore((s) => s.briefingTheme)
  const streaming = useStore((s) =>
    Boolean(s.assistantSession?.streaming))
  const glowRef = useRef<HTMLDivElement>(null)

  const isAcademic = theme !== 'newspaper'
  const live = enabled && isAcademic

  // Mouse following + inertia + idle fade-out
  useEffect(() => {
    if (!live) return
    const glow = glowRef.current
    if (!glow) return
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let raf = 0
    let seen = false
    let target = { x: window.innerWidth / 2, y: window.innerHeight * 0.4 }
    let pos = { ...target }
    let idleTimer: number | null = null

    const armIdle = () => {
      if (idleTimer) clearTimeout(idleTimer)
      idleTimer = window.setTimeout(() => {
        glow.style.opacity = '0'
        document.documentElement.classList.add('cursor-hidden')
      }, IDLE_MS)
    }
    const onMove = (e: MouseEvent) => {
      target = { x: e.clientX, y: e.clientY }
      if (!seen) { pos = { ...target }; seen = true }
      glow.style.opacity = '1'
      document.documentElement.classList.remove('cursor-hidden')
      armIdle()
    }
    const onLeave = () => { glow.style.opacity = '0' }
    const onBlur = () => { glow.style.opacity = '0' }
    const frame = () => {
      const k = reduced ? 1 : LERP
      pos.x += (target.x - pos.x) * k
      pos.y += (target.y - pos.y) * k
      glow.style.transform = `translate(${pos.x}px, ${pos.y}px)`
      raf = requestAnimationFrame(frame)
    }
    window.addEventListener('mousemove', onMove)
    document.documentElement.addEventListener('mouseleave', onLeave)
    window.addEventListener('blur', onBlur)
    raf = requestAnimationFrame(frame)
    return () => {
      cancelAnimationFrame(raf)
      if (idleTimer) clearTimeout(idleTimer)
      document.documentElement.classList.remove('cursor-hidden')
      window.removeEventListener('mousemove', onMove)
      document.documentElement.removeEventListener('mouseleave', onLeave)
      window.removeEventListener('blur', onBlur)
    }
  }, [live])

  // Annotation hover warm → write DOM directly
  useEffect(() => {
    if (!live) return
    const glow = glowRef.current
    if (!glow) return
    const onOver = (e: PointerEvent) => {
      const t = e.target as Element | null
      const near = t?.closest?.('.anno-wrap, .article-term-highlight') ?? null
      glow.classList.toggle('candle-warm', near !== null)
    }
    document.addEventListener('pointerover', onOver)
    return () => document.removeEventListener('pointerover', onOver)
  }, [live])

  // Assistant streaming → breathe
  useEffect(() => {
    const glow = glowRef.current
    if (!glow) return
    glow.classList.toggle('candle-breathe', live && streaming)
  }, [live, streaming])

  if (!live) return null

  return (
    <div data-testid="briefing-candlelight" className="fixed inset-0 z-[6] pointer-events-none" aria-hidden="true">
      <div
        ref={glowRef}
        className="candle-glow"
        style={{
          position: 'fixed', left: 0, top: 0,
          width: SIZE,
          height: SIZE,
          margin: -SIZE / 2,
          background: gradient(AMBER),
          mixBlendMode: 'screen',
          opacity: 0,
          transition: 'opacity 450ms ease, filter 600ms ease, width 1200ms ease, height 1200ms ease, margin 1200ms ease',
          willChange: 'transform',
        }}
      />
    </div>
  )
}
