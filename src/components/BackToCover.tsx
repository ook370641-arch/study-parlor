import { useStore } from '@/store'

interface Props {
  className?: string
}

export function BackToCover({ className = '' }: Props) {
  const goto = useStore(s => s.goto)
  return (
    <button
      onClick={() => goto('cover')}
      aria-label="返回封面"
      className={`text-2xl leading-none text-parchment/70 hover:text-parchment transition-colors px-2 py-1 ${className}`}
    >
      ←
    </button>
  )
}
