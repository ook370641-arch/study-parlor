import { Quote } from '@/components/Quote'
import { StarOrbit } from '@/components/StarOrbit'
import { useStore } from '@/store'

interface Props {
  hint: string
  buttonLabel: string
  buttonTestId: string
  onReceive: () => void
}

export function BriefingEmptyState({ hint, buttonLabel, buttonTestId, onReceive }: Props) {
  const theme = useStore((s) => s.briefingTheme)
  const isAcademic = theme !== 'newspaper'
  return (
    <main className="relative z-[5] flex-1 flex items-center justify-center px-6">
      <div className="flex flex-col items-center gap-5 text-center">
        <div data-testid="briefing-empty-orbit">
          <StarOrbit starCount={2} radius={10} period={2400} showLines tone={isAcademic ? 'night' : 'paper'} />
        </div>
        <Quote surface="briefing" />
        <p className={isAcademic ? 'text-parchment/70' : 'text-[#6b5d52]'}>{hint}</p>
        <button
          data-testid={buttonTestId}
          onClick={onReceive}
          className={`px-8 py-3 rounded text-[15px] font-serif transition-colors ${
            isAcademic
              ? 'bg-ember text-white hover:bg-ember/90'
              : 'bg-[#1a1a1a] text-white hover:bg-[#333]'
          }`}
        >
          {buttonLabel}
        </button>
      </div>
    </main>
  )
}
