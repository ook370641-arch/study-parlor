import { useStore } from '@/store'

interface Props {
  className?: string
}

export function BackToCover({ className = '' }: Props) {
  const goto = useStore(s => s.goto)
  const theme = useStore((s) => s.briefingTheme)
  const isAcademic = theme !== 'newspaper'

  return (
    <button
      onClick={() => goto('cover')}
      aria-label="返回封面"
      className={`text-2xl leading-none transition-colors px-2 py-1 ${
        isAcademic
          ? 'text-parchment/70 hover:text-parchment'
          : 'text-[#555] hover:text-[#1a1a1a]'
      } ${className}`}
    >
      ←
    </button>
  )
}
