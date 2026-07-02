interface Props {
  body: string
  keywords?: string
  theme: 'academic' | 'newspaper'
}

export function BriefingAbstract({ body, keywords, theme }: Props) {
  const isAcademic = theme === 'academic'
  return (
    <div
      className={
        isAcademic
          ? 'bg-[#2a1f1a] border border-[#4a3f35] border-l-[3px] border-l-[#d97757] p-4 mb-7'
          : 'border-l-2 border-[#1a1a1a] pl-5 mb-9'
      }
    >
      <div
        className={
          isAcademic
            ? 'text-[10px] tracking-[2px] uppercase text-[#d97757] mb-2 font-sans'
            : 'text-[10px] tracking-[1.5px] uppercase font-bold text-[#1a1a1a] mb-2 font-sans'
        }
      >
        Abstract · 摘要
      </div>
      <p
        className={
          isAcademic
            ? 'text-[13px] leading-[1.7] italic text-[#cbbba5] m-0'
            : 'text-[14px] leading-[1.7] text-[#1a1a1a] m-0 mb-2'
        }
      >
        {body}
      </p>
      {keywords && (
        <div
          className={
            isAcademic
              ? 'mt-3 text-[11px] text-[#8b7d6b] font-sans'
              : 'text-[11px] text-[#555] font-sans'
          }
        >
          <span className={isAcademic ? 'text-[#d97757]' : 'text-[#1a1a1a] font-bold'}>Keywords:</span>{' '}
          {keywords}
        </div>
      )}
    </div>
  )
}
