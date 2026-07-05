interface Props {
  quote: string
  translation: string
  theme: 'academic' | 'newspaper'
}

export function BriefingSpark({ quote, translation, theme }: Props) {
  const isAcademic = theme === 'academic'
  return (
    <div
      className={
        isAcademic
          ? 'py-5 border-t border-b border-[#4a3f35] my-8 text-center'
          : 'py-4 border-t border-b border-[#1a1a1a] my-5 text-center'
      }
    >
      <div
        className={
          isAcademic
            ? 'text-[10px] tracking-[2px] uppercase text-[#d97757] mb-2 font-sans'
            : 'text-[10px] tracking-[1.5px] uppercase text-[#555] mb-2 font-sans'
        }
      >
        Spark · 一句话火种
      </div>
      <div
        className={
          isAcademic
            ? 'text-[15px] italic leading-[1.6] text-[#e8d5b7] mb-1'
            : 'text-[16px] font-bold text-[#1a1a1a] mb-1'
        }
      >
        "{quote}"
      </div>
      <div className={isAcademic ? 'text-[12px] text-[#8b7d6b]' : 'text-[12px] text-[#555]'}>
        — {translation}
      </div>
    </div>
  )
}
