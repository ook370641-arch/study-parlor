import { useEffect, useState } from 'react'

interface StarParticleProps {
  count: number
  origin: 'center' | 'bottom' | 'edge'
  direction: 'up' | 'outward' | 'scatter'
  color: 'ember' | 'parchment' | 'mixed'
  duration: number
}

export function StarParticle({ count, origin, direction, color, duration }: StarParticleProps) {
  const [active, setActive] = useState(false)
  const [gone, setGone] = useState(false)

  useEffect(() => {
    const raf = requestAnimationFrame(() => setActive(true))
    const timer = setTimeout(() => setGone(true), duration + 50)
    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(timer)
    }
  }, [duration])

  if (gone) return null

  const stars = Array.from({ length: count }, (_, i) => {
    const isEmber = color === 'ember' || (color === 'mixed' && i % 2 === 0)
    const bgClass = isEmber ? 'bg-ember/70' : 'bg-parchment/50'

    let angle: number, dist: number
    if (direction === 'up') {
      angle = -30 + (Math.random() * 60)
      dist = 20 + Math.random() * 20
    } else if (direction === 'outward') {
      angle = (i / count) * 360
      dist = 20 + Math.random() * 15
    } else {
      angle = Math.random() * 360
      dist = 15 + Math.random() * 25
    }

    const rad = (angle * Math.PI) / 180
    const dx = Math.cos(rad) * dist
    const dy = Math.sin(rad) * dist

    let top: string, left: string
    if (origin === 'bottom') {
      top = '100%'
      left = '50%'
    } else if (origin === 'edge') {
      top = `${20 + Math.random() * 60}%`
      left = `${20 + Math.random() * 60}%`
    } else {
      top = '50%'
      left = '50%'
    }

    return { bgClass, dx, dy, top, left }
  })

  return (
    <>
      {stars.map((s, i) => (
        <div
          key={i}
          className={`absolute w-1 h-1 rounded-full ${s.bgClass} pointer-events-none`}
          style={{
            top: s.top,
            left: s.left,
            transform: active
              ? `translate(calc(-50% + ${s.dx}px), calc(-50% + ${s.dy}px)) scale(0)`
              : 'translate(-50%, -50%) scale(1)',
            opacity: active ? 0 : 1,
            transition: `transform ${duration}ms ease-out, opacity ${duration}ms ease-out`,
            willChange: 'transform, opacity',
          }}
        />
      ))}
    </>
  )
}
