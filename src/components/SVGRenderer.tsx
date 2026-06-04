import { useMemo } from 'react'

type Props = {
  source: string
}

export function SVGRenderer({ source }: Props) {
  const dataUrl = useMemo(() => {
    if (!source) return ''
    // Escape XML special chars for data URL
    const escaped = source
      .replace(/%/g, '%25')
      .replace(/&/g, '%26')
      .replace(/#/g, '%23')
    return `data:image/svg+xml,${escaped}`
  }, [source])

  if (!dataUrl) return null

  return (
    <img
      src={dataUrl}
      alt="知识图谱"
      className="max-w-full h-auto"
      style={{ maxHeight: '70vh' }}
    />
  )
}
