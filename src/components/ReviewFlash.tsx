import { useEffect, useState } from 'react'

interface ReviewFlashProps {
  title: string
  date: string
  onComplete: () => void
}

export function ReviewFlash({ title, date, onComplete }: ReviewFlashProps) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const raf = requestAnimationFrame(() => setVisible(true))
    const timer = setTimeout(onComplete, 600)
    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(timer)
    }
  }, [onComplete])

  return (
    <div
      className={`fixed inset-0 z-[100] flex flex-col items-center justify-center bg-ink/60 transition-opacity duration-200 ${visible ? 'opacity-100' : 'opacity-0'}`}
    >
      <div className="relative w-10 h-10 mb-4">
        <div
          className="absolute inset-0 rounded-full transition-transform duration-600"
          style={{
            background: visible ? 'rgba(217,119,87,0.15)' : 'rgba(217,119,87,0)',
            transform: visible ? 'scale(2)' : 'scale(0.5)',
            transitionDuration: '600ms',
          }}
        />
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-ember transition-all duration-600"
          style={{
            opacity: visible ? 1 : 0.3,
            boxShadow: visible ? '0 0 12px rgba(217,119,87,0.5)' : '0 0 0 rgba(217,119,87,0)',
            transitionDuration: '600ms',
          }}
        />
      </div>
      <p className="text-parchment text-lg italic tracking-wide mb-1">重温这颗星</p>
      <p className="text-parchment/40 text-sm">{title} · {date}</p>
    </div>
  )
}
