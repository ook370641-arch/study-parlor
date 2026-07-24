import { extractFirstLink } from '@/lib/parse-source-link'

interface Props {
  item: string
  theme: 'academic' | 'newspaper'
}

export function BriefingSourceCard({ item, theme }: Props) {
  const isAcademic = theme !== 'newspaper'
  const { text, url } = extractFirstLink(item)
  return (
    <div
      data-testid="briefing-source-card"
      className={`flex items-center gap-3 rounded-lg border px-3 py-2 font-mono ${
        isAcademic ? 'border-ember/35 bg-ink/50' : 'border-[#1a1a1a]/30 bg-white'
      }`}
    >
      <div className={`min-w-0 flex-1 text-xs leading-relaxed ${isAcademic ? 'text-parchment/85' : 'text-[#1a1a1a]'}`}>
        {text}
      </div>
      {url && (
        <a
          data-testid="briefing-source-card-link"
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className={`shrink-0 rounded border px-2 py-0.5 text-[10px] ${
            isAcademic
              ? 'border-ember/50 text-ember hover:bg-ember/15'
              : 'border-[#1a1a1a]/50 text-[#1a1a1a] hover:bg-black/5'
          }`}
        >
          原文 ↗
        </a>
      )}
    </div>
  )
}
