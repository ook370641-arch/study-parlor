import type { BriefingSourceGroup } from '@/lib/parse-briefing-markdown'

interface Props {
  sources: BriefingSourceGroup[]
  theme: 'academic' | 'newspaper'
}

export function BriefingReferences({ sources, theme }: Props) {
  const isAcademic = theme === 'academic'
  if (sources.length === 0) return null
  return (
    <div
      className={
        isAcademic
          ? 'bg-[#2a1f1a] border border-[#4a3f35] p-4'
          : 'mt-5 pt-4 border-t border-[#1a1a1a]'
      }
    >
      <div
        className={
          isAcademic
            ? 'text-[10px] tracking-[2px] uppercase text-[#d97757] mb-3 font-sans'
            : 'text-[11px] tracking-[1px] uppercase font-bold text-[#1a1a1a] mb-2 font-sans'
        }
      >
        References · 原始来源
      </div>
      <div className={isAcademic ? 'text-[11px] leading-[1.7] text-[#a89a86] font-sans' : 'text-[11px] leading-[1.6] text-[#555] font-sans'}>
        {sources.map((group, i) => (
          <div key={i} className="mb-2">
            <span className={isAcademic ? 'text-[#e8d5b7]' : 'text-[#1a1a1a] font-bold'}>{group.title}</span>
            {group.items.map((item, j) => (
              <div key={j} className="ml-4">
                {item.replace(/^[-*]\s+/, '')}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
