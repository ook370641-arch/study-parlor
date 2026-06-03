import { useEffect, useRef, useState } from 'react'
import mermaid from 'mermaid'

let initialized = false

function init() {
  if (initialized) return
  mermaid.initialize({ startOnLoad: false, securityLevel: 'strict' })
  initialized = true
}

export function MermaidRenderer({ source }: { source: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    init()
    setError(false)

    const id = `mermaid-${Math.random().toString(36).slice(2, 11)}`

    mermaid
      .render(id, source)
      .then(({ svg }) => {
        if (containerRef.current) {
          containerRef.current.innerHTML = svg
        }
      })
      .catch(() => {
        setError(true)
      })
  }, [source])

  if (error) {
    return (
      <div className="flex justify-center">
        <span className="text-wine text-sm">图表渲染失败，请重试</span>
      </div>
    )
  }

  return <div ref={containerRef} className="flex justify-center" />
}
