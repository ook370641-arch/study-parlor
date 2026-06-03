import { useEffect, useRef } from 'react'

type Props = {
  source: string
}

export function SVGRenderer({ source }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!containerRef.current || !source) return
    containerRef.current.innerHTML = source
  }, [source])

  return <div ref={containerRef} className="svg-diagram flex justify-center" />
}
